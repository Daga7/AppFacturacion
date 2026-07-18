import type { ReactNode } from "react";

export type BadgeTone = "success" | "danger" | "warning" | "info" | "neutral";

const tones: Record<BadgeTone, string> = {
  success: "bg-emerald-900/30 text-emerald-400",
  danger: "bg-red-900/30 text-red-400",
  warning: "bg-yellow-900/30 text-yellow-400",
  info: "bg-brand/20 text-brand-light",
  neutral: "bg-slate-800 text-slate-400",
};

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}
