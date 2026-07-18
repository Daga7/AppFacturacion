import { useState } from "react";
import { Modal } from "../ui/Modal";
import { inputCls, primaryBtnCls, secondaryBtnCls } from "../ui/inputs";

interface AmountModalProps {
  title: string;
  question: string;
  submitLabel: string;
  saving: boolean;
  error?: string | null;
  onSubmit: (amount: number) => void;
  onClose: () => void;
}

// Modal genérico para pedir un monto en efectivo (apertura y cierre de caja).
export function AmountModal({ title, question, submitLabel, saving, error, onSubmit, onClose }: AmountModalProps) {
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = () => {
    const value = parseFloat(amount);
    if (isNaN(value) || value < 0) {
      setLocalError("Ingresa un monto válido (puede ser 0)");
      return;
    }
    setLocalError(null);
    onSubmit(value);
  };

  return (
    <Modal title={title} onClose={onClose} maxWidth="max-w-md">
      <p className="text-sm text-slate-300">{question}</p>
      <input
        type="number"
        min="0"
        step="0.01"
        placeholder="$ 0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
        className={`${inputCls} w-full text-lg font-mono`}
        autoFocus
      />
      {(localError || error) && <p className="text-sm text-red-400">{localError ?? error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={saving} className={primaryBtnCls}>
          {saving ? "Guardando..." : submitLabel}
        </button>
        <button onClick={onClose} className={secondaryBtnCls}>Cancelar</button>
      </div>
    </Modal>
  );
}
