import type { Sale } from "../../lib/types";
import { paymentMethodLabels } from "../../lib/types";
import { formatMoney, formatTime, invoiceCode } from "../../lib/format";
import { Card } from "../ui/Card";
import { StatusBadge } from "../ui/StatusBadge";
import { EmptyState } from "../ui/EmptyState";

// Lista de ventas en tarjetas: código de factura, hora, resumen y total.
// La comparten "Ventas de hoy" (vendedor) y el histórico del administrador.

function paymentSummary(sale: Sale): string {
  if (sale.isCredit) return "Crédito";
  if (sale.payments.length === 0) return "—";
  const first = paymentMethodLabels[sale.payments[0].paymentMethod];
  return sale.payments.length > 1 ? `${first} +${sale.payments.length - 1}` : first;
}

interface SalesListProps {
  sales: Sale[];
  onSelect: (sale: Sale) => void;
  emptyMessage?: string;
}

export function SalesList({ sales, onSelect, emptyMessage = "No hay ventas registradas" }: SalesListProps) {
  if (sales.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <div className="space-y-2">
      {sales.map((s) => {
        const productCount = s.details.reduce((sum, d) => sum + d.quantity, 0);
        return (
          <Card
            key={s.id}
            onClick={() => onSelect(s)}
            className="p-4 flex items-center gap-4 hover:bg-slate-800/40"
          >
            <div className="w-20 shrink-0">
              <p className="text-white font-semibold">{invoiceCode(s.invoiceNumber)}</p>
              <p className="text-xs text-slate-500">{formatTime(s.createdAt)}</p>
            </div>
            <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
              <span className="text-sm text-slate-300">
                {productCount} producto{productCount === 1 ? "" : "s"}
              </span>
              <span className="text-sm text-slate-400">{paymentSummary(s)}</span>
              {s.status === "CANCELLED" && <StatusBadge tone="danger">Cancelada</StatusBadge>}
              {s.isCredit && s.status === "COMPLETED" && (
                <StatusBadge tone="warning">
                  {s.loan?.loanStatus === "PAID" ? "Crédito pagado" : "Crédito activo"}
                </StatusBadge>
              )}
            </div>
            <p className={`text-lg font-bold ${s.status === "CANCELLED" ? "text-slate-500 line-through" : "text-white"}`}>
              {formatMoney(s.total)}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
