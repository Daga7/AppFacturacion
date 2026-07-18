import type { ReactNode } from "react";
import { Card } from "./Card";

interface BigOptionCardProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
}

// Tarjeta grande de selección (p. ej. elegir punto de venta).
export function BigOptionCard({ icon, title, subtitle, onClick }: BigOptionCardProps) {
  return (
    <Card
      onClick={onClick}
      className="p-8 flex flex-col items-center gap-4 text-center hover:bg-slate-800/50"
    >
      <div className="w-20 h-20 rounded-2xl bg-brand/15 text-brand-light flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-white text-lg font-semibold">{title}</p>
        {subtitle && <p className="text-slate-400 text-sm mt-1">{subtitle}</p>}
      </div>
    </Card>
  );
}
