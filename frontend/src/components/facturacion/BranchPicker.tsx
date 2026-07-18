import type { BranchInfo } from "../../lib/types";
import { BigOptionCard } from "../ui/BigOptionCard";
import { StoreIcon } from "../ui/icons";

interface BranchPickerProps {
  branches: BranchInfo[];
  onSelect: (branch: BranchInfo) => void;
}

// Selección de punto de venta: una tarjeta grande por sede con ícono de local.
export function BranchPicker({ branches, onSelect }: BranchPickerProps) {
  return (
    <div>
      <p className="text-slate-400 text-sm mb-4">Selecciona el punto de venta</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {branches.map((b) => (
          <BigOptionCard
            key={b.id}
            icon={<StoreIcon />}
            title={b.name}
            subtitle="Ver ventas de este punto"
            onClick={() => onSelect(b)}
          />
        ))}
      </div>
    </div>
  );
}
