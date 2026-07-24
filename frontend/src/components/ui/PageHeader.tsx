import type { ReactNode } from "react";

// Encabezado estándar de página: título a la izquierda y controles (selector
// de sede, botones) a la derecha. Mismo patrón que Facturación e Informes.
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
