import type { ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}

// Ventana flotante genérica: overlay oscuro, cierra al hacer clic fuera.
export function Modal({ title, onClose, children, maxWidth = "max-w-lg" }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-slate-900 border border-slate-700 rounded-xl p-6 w-full ${maxWidth} max-h-[90vh] overflow-y-auto space-y-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h4 className="text-white font-semibold text-lg">{title}</h4>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
