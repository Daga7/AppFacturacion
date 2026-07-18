import { useState } from "react";
import { api } from "../../lib/api";
import type { Customer } from "../../lib/types";
import { Card } from "../ui/Card";
import { inputCls, ghostBtnCls } from "../ui/inputs";

interface CustomerFormProps {
  branchId: string;
  onSaved: (customer: Customer) => void;
}

const empty = { firstName: "", lastName: "", phone: "", address: "" };

export function CustomerForm({ branchId, onSaved }: CustomerFormProps) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.firstName.trim()) { setError("El nombre es obligatorio"); return; }
    setSaving(true);
    setError(null);
    try {
      const customer = await api.post<Customer>("/customers", {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        // Todo cliente que puede pedir préstamo se registra como especial.
        type: "SPECIAL",
        branchId,
      });
      setForm(empty);
      onSaved(customer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el cliente");
    }
    setSaving(false);
  };

  return (
    <Card className="p-4 space-y-3">
      <h4 className="text-white font-medium">Crear cliente</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input placeholder="Nombre" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputCls} />
        <input placeholder="Apellido (opcional)" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputCls} />
        <input placeholder="Teléfono" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
        <input placeholder="Dirección" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={handleSubmit} disabled={saving} className={ghostBtnCls}>
        {saving ? "Guardando..." : "+ Crear cliente"}
      </button>
    </Card>
  );
}
