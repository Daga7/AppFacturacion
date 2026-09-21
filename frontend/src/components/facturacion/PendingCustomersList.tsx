import { useState } from "react";
import type { Customer, Loan } from "../../lib/types";
import { formatMoney } from "../../lib/format";
import { downloadCustomerDebtPdf } from "../../lib/customerDebtPdf";
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

  return <DebtCards debts={debts} onSelect={onSelect} />;
}

// Tarjetas de deuda, cada una con su botón para descargar el estado de cuenta
// del cliente en PDF y enviárselo.
function DebtCards({ debts, onSelect }: { debts: CustomerDebt[]; onSelect: (debt: CustomerDebt) => void }) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (debt: CustomerDebt) => {
    setDownloadingId(debt.customer.id);
    try {
      await downloadCustomerDebtPdf(
        `${debt.customer.firstName} ${debt.customer.lastName ?? ""}`.trim(),
        debt.loans,
        {
          phone: debt.customer.phone,
          branchName: debt.loans[0]?.sale?.branch.name,
        },
      );
    } catch {
      alert("No se pudo generar el PDF");
    }
    setDownloadingId(null);
  };

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
          <button
            onClick={(e) => {
              // No abrir el modal al descargar.
              e.stopPropagation();
              download(debt);
            }}
            disabled={downloadingId === debt.customer.id}
            title="Descargar la lista de lo que debe"
            aria-label={`Descargar la lista de lo que debe ${debt.customer.firstName}`}
            className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            {downloadingId === debt.customer.id ? "..." : "⬇ PDF"}
          </button>
        </Card>
      ))}
    </div>
  );
}
