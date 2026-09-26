import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { offlineUrls } from "../lib/offline/cashierData";
import { useConnection } from "../lib/offline/connection";
import { useOfflineQueue } from "../lib/offline/queue";
import { overlayCashSession } from "../lib/offline/overlay";
import { openCashOperation, submitOperation } from "../lib/offline/operations";
import type { CashSession, CashSummary } from "../lib/types";
import { formatDateTime, formatMoney, formatTime } from "../lib/format";
import { BigOptionCard } from "../components/ui/BigOptionCard";
import { UnlockIcon, ReceiptIcon, LockIcon, ReturnIcon } from "../components/ui/icons";
import { Alert } from "../components/ui/Alert";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Modal } from "../components/ui/Modal";
import { AmountModal } from "../components/caja/AmountModal";
import { CashSummaryView } from "../components/caja/CashSummaryView";

// Pantalla del cajero: flujo obligatorio abrir caja → registrar ventas (y
// devoluciones) → cerrar caja. Las acciones fuera de secuencia muestran un
// aviso. Sin internet se puede abrir caja y vender; las devoluciones y el
// cierre necesitan conexión, y cerrar además que todo lo registrado sin
// internet ya se haya enviado.
export default function Caja() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const online = useConnection((s) => s.online);
  const dataSavedAt = useConnection((s) => s.dataSavedAt);
  const operations = useOfflineQueue((s) => s.operations);
  const version = useOfflineQueue((s) => s.version);

  // Caja según el servidor (o la copia guardada); encima, la abierta sin internet.
  const [serverSession, setSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"open" | "close" | null>(null);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      setSession(await api.get<CashSession | null>(offlineUrls.cash, { offline: true }));
    } catch { setNotice("Error al consultar el estado de la caja"); }
    setLoading(false);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { loadSession(); }, [loadSession, version]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleOpen = async (amount: number) => {
    setSaving(true);
    setModalError(null);
    try {
      const outcome = await submitOperation(openCashOperation(amount));
      setModal(null);
      setNotice(null);
      if (outcome.queued) {
        setSuccess("Caja abierta sin conexión: se enviará sola cuando vuelva el internet");
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Error al abrir la caja");
    }
    setSaving(false);
  };

  const handleClose = async (amount: number) => {
    setSaving(true);
    setModalError(null);
    try {
      const result = await api.post<CashSummary>("/cash/close", { closingAmount: amount });
      setSummary(result);
      setSession(null);
      setModal(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Error al cerrar la caja");
    }
    setSaving(false);
  };

  const session = overlayCashSession(serverSession, operations, user?.branchId ?? "");
  const isOpen = session !== null;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8 mt-6">
        <h2 className="text-2xl font-bold text-white">Hola, {user?.username}</h2>
        <div className="flex items-center justify-center gap-2 mt-2">
          <p className="text-slate-400 text-sm">{user?.branchName}</p>
          {!loading && (
            isOpen ? (
              <StatusBadge tone="success">
                Caja abierta desde {formatTime(session.openedAt)} · base {formatMoney(session.openingAmount)}
                {session.pending && " · sin enviar"}
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Caja cerrada</StatusBadge>
            )
          )}
        </div>
        {dataSavedAt && (
          <p className="text-xs text-slate-500 mt-2">
            Datos guardados para trabajar sin internet: {formatDateTime(new Date(dataSavedAt).toISOString())}
          </p>
        )}
      </div>

      {notice && <Alert kind="error" message={notice} onClose={() => setNotice(null)} />}
      {success && <Alert kind="success" message={success} onClose={() => setSuccess(null)} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <BigOptionCard
          icon={<UnlockIcon />}
          title="Abrir caja"
          subtitle={isOpen ? "La caja ya está abierta" : "Registra la base en efectivo del día"}
          onClick={() => {
            if (isOpen) { setNotice("La caja ya está abierta; ciérrala para abrir una nueva jornada"); return; }
            setModalError(null);
            setModal("open");
          }}
        />
        <BigOptionCard
          icon={<ReceiptIcon />}
          title="Registrar ventas"
          subtitle={isOpen ? "Facturación, préstamos y clientes" : "Disponible al abrir la caja"}
          onClick={() => {
            if (!isOpen) { setNotice("Primero debes abrir la caja para registrar ventas"); return; }
            navigate("/facturacion");
          }}
        />
        <BigOptionCard
          icon={<ReturnIcon />}
          title="Devoluciones"
          subtitle={isOpen ? "Pantallas vendidas en los últimos 7 días" : "Disponible al abrir la caja"}
          onClick={() => {
            if (!isOpen) { setNotice("Primero debes abrir la caja para registrar devoluciones"); return; }
            if (!online) { setNotice("Las devoluciones solo se pueden hacer con internet"); return; }
            navigate("/devoluciones");
          }}
        />
        <BigOptionCard
          icon={<LockIcon />}
          title="Cerrar caja"
          subtitle={isOpen ? "Cuadra y cierra el turno" : "Disponible al abrir la caja"}
          onClick={() => {
            if (!isOpen) { setNotice("No puedes cerrar una caja que no has abierto"); return; }
            if (!online) { setNotice("Para cerrar la caja necesitas internet"); return; }
            if (operations.length > 0) {
              setNotice(
                `Hay ${operations.length} registro(s) hechos sin internet que aún no se envían; espera a que se envíen para cerrar la caja`,
              );
              return;
            }
            setModalError(null);
            setModal("close");
          }}
        />
      </div>

      {modal === "open" && (
        <AmountModal
          title="Abrir caja"
          question="¿Con cuánto efectivo (base) inicias el día?"
          submitLabel="Abrir caja"
          saving={saving}
          error={modalError}
          onSubmit={handleOpen}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "close" && (
        <AmountModal
          title="Cerrar caja"
          question="¿Con cuánto efectivo finalizas el día? Cuenta el dinero de la caja e ingresa el total."
          submitLabel="Cerrar caja"
          saving={saving}
          error={modalError}
          onSubmit={handleClose}
          onClose={() => setModal(null)}
        />
      )}

      {summary && (
        <Modal title="Resumen del cierre de caja" onClose={() => setSummary(null)} maxWidth="max-w-2xl">
          <CashSummaryView summary={summary} />
        </Modal>
      )}
    </div>
  );
}
