import type { Customer } from "../../lib/types";
import { Card } from "../ui/Card";
import { StatusBadge } from "../ui/StatusBadge";
import { EmptyState } from "../ui/EmptyState";

interface CustomersListProps {
  customers: Customer[];
  // Si se pasa, cada cliente es clickeable (lo usa el admin para editar/borrar).
  onSelect?: (customer: Customer) => void;
}

export function CustomersList({ customers, onSelect }: CustomersListProps) {
  if (customers.length === 0) return <EmptyState message="No hay clientes registrados" />;

  return (
    <div className="space-y-2">
      {customers.map((c) => (
        <Card
          key={c.id}
          onClick={onSelect ? () => onSelect(c) : undefined}
          className="p-4 flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="text-white font-medium truncate">
              {c.firstName} {c.lastName ?? ""}
            </p>
            <p className="text-xs text-slate-400 truncate">
              {[c.phone, c.address].filter(Boolean).join(" · ") || "Sin datos de contacto"}
            </p>
          </div>
          <StatusBadge tone={c.type === "SPECIAL" ? "info" : "neutral"}>
            {c.type === "SPECIAL" ? "Especial" : "Regular"}
          </StatusBadge>
        </Card>
      ))}
    </div>
  );
}
