import { useState } from "react";
import { api } from "../../lib/api";
import type { Customer } from "../../lib/types";
import { Modal } from "../ui/Modal";
import { inputCls, primaryBtnCls, secondaryBtnCls, dangerBtnCls } from "../ui/inputs";

interface CustomerEditModalProps {
  customer: Customer;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
  onDeleted: (customerId: string) => void;
}

// Edición y borrado de un cliente. Solo lo abre el admin (ver Facturacion.tsx).
// El borrado es total: además del cliente se elimina en el backend todo lo
// enlazado a él (ventas, pagos, préstamos, abonos), así que exige escribir el
// nombre completo para confirmar antes de dejar disparar la petición.
export function CustomerEditModal({
  customer,
  onClose,
  onSaved,
  onDeleted,
}: CustomerEditModalProps) {
  const [form, setForm] = useState({
    firstName: customer.firstName,
    lastName: customer.lastName ?? "",
    phone: customer.phone ?? "",
    address: customer.address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fullName = `${customer.firstName} ${customer.lastName ?? ""}`.trim();

  const handleSave = async () => {
    if (!form.firstName.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patch<Customer>(`/customers/${customer.id}`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar los cambios");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (confirmText.trim() !== fullName) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/customers/${customer.id}`);
      onDeleted(customer.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al borrar el cliente");
      setDeleting(false);
    }
  };

  return (
    <Modal title={`Editar cliente: ${fullName}`} onClose={onClose}>
      {!confirmingDelete ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              placeholder="Nombre"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className={inputCls}
            />
            <input
              placeholder="Apellido (opcional)"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className={inputCls}
            />
            <input
              placeholder="Teléfono"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputCls}
            />
            <input
              placeholder="Dirección"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className={inputCls}
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-4">
            <button
              onClick={() => setConfirmingDelete(true)}
              className={dangerBtnCls}
            >
              Borrar cliente
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className={secondaryBtnCls}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className={primaryBtnCls}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-red-950/40 border border-red-900 rounded-lg p-4 space-y-2">
            <p className="text-red-300 font-medium">Esta acción no se puede deshacer.</p>
            <p className="text-sm text-red-200/80">
              Se borrará <strong>{fullName}</strong> y también todo lo enlazado a este
              cliente: sus ventas, los detalles y pagos de esas ventas, sus préstamos y
              los abonos que haya hecho. El historial de facturas desaparece por
              completo.
            </p>
          </div>

          <div>
            <label className="text-sm text-slate-400">
              Escribe <strong className="text-white">{fullName}</strong> para confirmar
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className={`${inputCls} mt-1`}
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
            <button
              onClick={() => {
                setConfirmingDelete(false);
                setConfirmText("");
                setError(null);
              }}
              className={secondaryBtnCls}
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting || confirmText.trim() !== fullName}
              className={dangerBtnCls}
            >
              {deleting ? "Borrando..." : "Borrar definitivamente"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
