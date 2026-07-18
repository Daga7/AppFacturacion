import type { ReactNode } from "react";
import { Card } from "./Card";

interface PanelProps {
  title: string;
  children: ReactNode;
  className?: string;
}

// Panel con título: contenedor estándar de las secciones de informes.
export function Panel({ title, children, className = "" }: PanelProps) {
  return (
    <Card className={`p-5 ${className}`}>
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      {children}
    </Card>
  );
}
