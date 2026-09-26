import type { Loan } from "../../lib/types";
import { formatMoney, formatDateTime, saleCode } from "../../lib/format";
import { Card } from "../ui/Card";
import { StatusBadge } from "../ui/StatusBadge";
import { EmptyState } from "../ui/EmptyState";

interface LoansListProps {
  loans: Loan[];
  onSelect: (loan: Loan) => void;
  emptyMessage?: string;
}

// Lista de préstamos en tarjetas: cliente, venta asociada y saldo pendiente.
// La comparten "Préstamos generados" y "Clientes Pendientes".
export function LoansList({ loans, onSelect, emptyMessage = "No hay préstamos registrados" }: LoansListProps) {
  if (loans.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <div className="space-y-2">
      {loans.map((l) => {
        const productCount = l.sale?.details.reduce((sum, d) => sum + d.quantity, 0) ?? 0;
        return (
          <Card
            key={l.id}
            onClick={() => onSelect(l)}
            className="p-4 flex items-center gap-4 hover:bg-slate-800/40"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-white font-medium">
                  {l.customer.firstName} {l.customer.lastName ?? ""}
                </p>
                {l.loanStatus === "PAID" ? (
                  <StatusBadge tone="success">Pagado</StatusBadge>
                ) : (
                  <StatusBadge tone="warning">Activo</StatusBadge>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {l.sale ? `${saleCode(l.sale)} · ${l.sale.branch.name} · ` : ""}
                {formatDateTime(l.createdAt)} · {productCount} producto{productCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-500">
                {l.loanStatus === "PAID" ? "Monto original" : "Monto pendiente"}
              </p>
              <p className={`text-lg font-bold ${l.loanStatus === "PAID" ? "text-slate-400" : "text-white"}`}>
                {formatMoney(l.loanStatus === "PAID" ? l.originalAmount : l.pendingAmount)}
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
