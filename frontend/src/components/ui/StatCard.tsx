import type { ReactNode } from "react";
import { Card } from "./Card";

type StatTone = "default" | "success" | "info" | "warning" | "danger";

const tones: Record<StatTone, string> = {
  default: "text-white",
  success: "text-emerald-400",
  info: "text-blue-400",
  warning: "text-yellow-400",
  danger: "text-red-400",
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: StatTone;
}

// Tarjeta de estadística: etiqueta, valor grande y nota al pie.
export function StatCard({ label, value, hint, tone = "default" }: StatCardProps) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </Card>
  );
}
