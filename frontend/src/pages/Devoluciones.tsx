import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, OfflineError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useConnection } from "../lib/offline/connection";
import type { ReturnLookup, ReturnableSale } from "../lib/types";
import { paymentMethodLabels } from "../lib/types";
import { formatDate, formatDateTime, formatMoney, invoiceCode } from "../lib/format";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { EmptyState } from "../components/ui/EmptyState";
import { StatusBadge } from "../components/ui/StatusBadge";
import { inputCls, primaryBtnCls, secondaryBtnCls } from "../components/ui/inputs";
import { ReturnModal } from "../components/caja/ReturnModal";

const OFFLINE_MESSAGE = "Las devoluciones solo se pueden hacer con internet";

// Módulo de devoluciones del cajero (solo con internet). Se escanea la
// pantalla y el sistema busca las ventas de contado de la sede de los últimos
// 7 días que la incluyen; los préstamos no cuentan (se devuelven desde el
// préstamo del cliente). Al elegir la venta se registra la devolución: el
// producto vuelve al inventario y el dinero sale de la caja abierta.
export default function Devoluciones() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const online = useConnection((s) => s.online);

  const [barcode, setBarcode] = useState("");
  const [result, setResult] = useState<ReturnLookup | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ReturnableSale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = async (code: string, keepSuccess = false) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    if (!keepSuccess) setSuccess(null);
    try {
      setResult(
        await api.get<ReturnLookup>(
          `/returns/lookup?barcode=${encodeURIComponent(trimmed)}`,
          { fresh: true },
        ),
      );
    } catch (err) {
      setResult(null);
      setError(
        err instanceof OfflineError
          ? OFFLINE_MESSAGE
          : err instanceof Error ? err.message : "Error al buscar la pantalla",
      );
    }
    setSearching(false);
    // El siguiente escaneo reemplaza el código en vez de sumarse al anterior.
    inputRef.current?.select();
  };

  if (!online) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageHeader title="Devoluciones" />
        <Card className="p-8 text-center space-y-4">
          <p className="text-white font-medium">{OFFLINE_MESSAGE}</p>
          <p className="text-slate-400 text-sm">
            Hay que confirmar en el servidor que la pantalla se vendió. Vuelve a intentarlo cuando regrese la conexión.
          </p>
          <button onClick={() => navigate("/caja")} className={secondaryBtnCls}>
            Volver a la caja
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Devoluciones"
        subtitle="Escanea la pantalla para buscar su venta de contado de los últimos 7 días"
      >
        <span className="text-sm text-slate-400">{user?.branchName}</span>
      </PageHeader>

      {error && <Alert kind="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert kind="success" message={success} onClose={() => setSuccess(null)} />}

      <Card className="p-4 mb-6">
        <form
          onSubmit={(e) => { e.preventDefault(); void search(barcode); }}
          className="flex flex-wrap gap-2"
        >
          <input
            ref={inputRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            inputMode="numeric"
            autoFocus
            placeholder="Escanea o escribe el código de barras"
            className={`${inputCls} flex-1 min-w-48 font-mono`}
          />
          <button type="submit" disabled={searching || !barcode.trim()} className={primaryBtnCls}>
            {searching ? "Buscando..." : "Buscar"}
          </button>
        </form>
      </Card>

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold text-white">{result.product.name}</h3>
            <p className="text-xs text-slate-500">
              Ventas de contado desde el {formatDate(result.since)}
            </p>
          </div>

          {result.sales.length === 0 ? (
            <Card className="p-2">
              <EmptyState
                message={`No se vendió de contado en esta sede en los últimos ${result.windowDays} días: no se puede hacer la devolución`}
              />
            </Card>
          ) : (
            result.sales.map((s) => (
              <Card key={s.saleDetailId} className="p-4 flex flex-wrap items-center gap-4">
                <div className="w-28 shrink-0">
                  <p className="text-white font-semibold">{invoiceCode(s.invoiceNumber)}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(s.createdAt)}</p>
                </div>
                <div className="flex-1 min-w-48 text-sm space-y-0.5">
                  <p className="text-slate-300">
                    {s.quantity} vendida{s.quantity === 1 ? "" : "s"} a {formatMoney(s.unitPaid)} c/u
                    {s.returnedQuantity > 0 && (
                      <span className="text-yellow-400"> · {s.returnedQuantity} ya devuelta{s.returnedQuantity === 1 ? "" : "s"}</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    Pagó con {s.paymentMethods.map((m) => paymentMethodLabels[m]).join(", ") || "—"}
                    {" · "}Atendió {s.seller}
                    {s.customerName ? ` · Cliente: ${s.customerName}` : ""}
                  </p>
                </div>
                {s.returnableQuantity > 0 ? (
                  <button onClick={() => setSelected(s)} className={primaryBtnCls}>
                    Devolver
                  </button>
                ) : (
                  <StatusBadge tone="neutral">Ya devuelta</StatusBadge>
                )}
              </Card>
            ))
          )}

          {result.loans > 0 && (
            <p className="text-xs text-slate-500">
              También aparece en {result.loans} préstamo{result.loans === 1 ? "" : "s"}; esas
              pantallas no se devuelven aquí sino desde Facturación → Clientes pendientes.
            </p>
          )}
        </div>
      )}

      {selected && result && (
        <ReturnModal
          product={result.product}
          sale={selected}
          onClose={() => setSelected(null)}
          onSaved={(r) => {
            setSelected(null);
            setSuccess(
              `Devolución registrada (${invoiceCode(selected.invoiceNumber)}): entrega ${formatMoney(r.refundAmount)} por ${paymentMethodLabels[r.paymentMethod]} al cliente. La pantalla volvió al inventario.`,
            );
            void search(result.product.barcode, true);
          }}
        />
      )}
    </div>
  );
}
