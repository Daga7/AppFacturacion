interface AlertProps {
  kind: "error" | "success";
  message: string;
  onClose: () => void;
}

export function Alert({ kind, message, onClose }: AlertProps) {
  const cls =
    kind === "error"
      ? "bg-red-900/30 border-red-800 text-red-300"
      : "bg-emerald-900/30 border-emerald-800 text-emerald-300";
  return (
    <div className={`mb-4 p-3 border rounded-lg text-sm ${cls}`}>
      {message}
      <button onClick={onClose} className="ml-3 underline">
        Cerrar
      </button>
    </div>
  );
}
