import type { Customer, Loan } from "../../lib/types";
import { formatMoney } from "../../lib/format";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";

// Deuda consolidada de un cliente: todos sus préstamos activos agrupados.
export interface CustomerDebt {
  customer: Customer;
  loans: Loan[];
  totalPending: number;
  productCount: number;
}

interface PendingCustomersListProps {
  loans: Loan[];
  onSelect: (debt: CustomerDebt) => void;
}

// Lista de "Clientes Pendientes": una sola tarjeta por cliente con el total
// que debe, sin importar cuántos préstamos tenga.
export function PendingCustomersList({ loans, onSelect }: PendingCustomersListProps) {
  const byCustomer = new Map<string, CustomerDebt>();
  for (const loan of loans) {
    const existing = byCustomer.get(loan.customerId);
    const productCount = loan.sale?.details.reduce((sum, d) => sum + d.quantity, 0) ?? 0;
    if (existing) {
      existing.loans.push(loan);
      existing.totalPending += Number(loan.pendingAmount);
      existing.productCount += productCount;
    } else {
      byCustomer.set(loan.customerId, {
        customer: loan.customer,
        loans: [loan],
        totalPending: Number(loan.pendingAmount),
        productCount,
      });
    }
  }
  const debts = [...byCustomer.values()].sort((a, b) => b.totalPending - a.totalPending);

  if (debts.length === 0) return <EmptyState message="No hay clientes con préstamos activos" />;

  return (
    <div className="space-y-2">
      {debts.map((debt) => (
        <Card
          key={debt.customer.id}
          onClick={() => onSelect(debt)}
          className="p-4 flex items-center gap-4 hover:bg-slate-800/40"
        >
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">
              {debt.customer.firstName} {debt.customer.lastName ?? ""}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {debt.loans.length} préstamo{debt.loans.length === 1 ? "" : "s"} ·{" "}
              {debt.productCount} producto{debt.productCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-slate-500">Monto pendiente</p>
            <p className="text-lg font-bold text-white">{formatMoney(debt.totalPending)}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
