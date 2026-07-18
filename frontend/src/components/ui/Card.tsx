import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

// Contenedor base del sistema: panel oscuro con borde y esquinas redondeadas.
export function Card({ children, className = "", onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-slate-900 border border-slate-800 rounded-xl ${
        onClick ? "cursor-pointer hover:border-slate-600 transition-colors" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
