import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

interface Product {
  id: string; name: string; salePrice: number;
  category: { name: string };
}
interface SaleDetail {
  id: string; product: Product; quantity: number;
  unitPrice: number; discount: number; subtotal: number;
}
interface SalePayment {
  id: string; amount: number; paymentMethod: string;
}
interface Sale {
  id: string; invoiceNumber: number; total: number;
  isCredit: boolean; status: string;
  customer?: { firstName: string; lastName?: string };
  user: { id: string; username: string };
  branch: { id: string; name: string };
  details: SaleDetail[]; payments: SalePayment[];
  createdAt: string;
}

const methodLabels: Record<string, string> = { CASH: "Efectivo", NEQUI: "Nequi", BANCOLOMBIA: "Bancolombia" };

export default function Facturacion() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Sale[]>("/sales?limit=50");
      setSales(data);
    } catch { setError("Error al cargar ventas"); }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSales();
  }, [loadSales]);

  const handleCancel = async (id: string) => {
    if (!confirm("Cancelar esta venta? Se revertirá el inventario.")) return;
    try {
      await api.post(`/sales/${id}/cancel`);
      loadSales();
    } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Facturación</h2>
        <span className="text-sm text-slate-400">{sales.length} ventas</span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-3 underline">Cerrar</button>
        </div>
      )}

      {selectedSale ? (
        <div>
          <button
            onClick={() => setSelectedSale(null)}
            className="mb-4 text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← Volver a ventas
          </button>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">
                  Factura #{selectedSale.invoiceNumber}
                </h3>
                <p className="text-sm text-slate-400">
                  {new Date(selectedSale.createdAt).toLocaleString()} — {selectedSale.branch.name}
                </p>
                <p className="text-sm text-slate-400">
                  Atendido por: {selectedSale.user.username}
                  {selectedSale.customer && ` | Cliente: ${selectedSale.customer.firstName} ${selectedSale.customer.lastName ?? ""}`}
                </p>
              </div>
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                selectedSale.status === "COMPLETED" ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"
              }`}>
                {selectedSale.status === "COMPLETED" ? "Completada" : "Cancelada"}
              </span>
            </div>

            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-800">
                    <th className="pb-2 font-medium">Producto</th>
                    <th className="pb-2 font-medium text-right">Cant.</th>
                    <th className="pb-2 font-medium text-right">P. Unit.</th>
                    <th className="pb-2 font-medium text-right">Desc.</th>
                    <th className="pb-2 font-medium text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSale.details.map((d) => (
                    <tr key={d.id} className="border-b border-slate-800/50">
                      <td className="py-2 text-white">{d.product?.name}</td>
                      <td className="py-2 text-right text-slate-300">{d.quantity}</td>
                      <td className="py-2 text-right text-slate-300">${d.unitPrice}</td>
                      <td className="py-2 text-right text-slate-300">${d.discount}</td>
                      <td className="py-2 text-right text-white font-medium">${d.subtotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col items-end gap-1 mb-6">
              <p className="text-2xl font-bold text-white">Total: ${selectedSale.total}</p>
              {selectedSale.isCredit && <p className="text-sm text-yellow-400">Venta a crédito</p>}
            </div>

            <div className="border-t border-slate-800 pt-4">
              <h4 className="text-sm font-medium text-slate-400 mb-3">Pagos</h4>
              <div className="space-y-2">
                {selectedSale.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span className="text-slate-300">{methodLabels[p.paymentMethod] ?? p.paymentMethod}</span>
                    <span className="text-white font-medium">${p.amount}</span>
                  </div>
                ))}
              </div>
            </div>

            {selectedSale.status === "COMPLETED" && (
              <div className="border-t border-slate-800 pt-4 mt-4">
                <button
                  onClick={() => handleCancel(selectedSale.id)}
                  className="px-4 py-2 bg-red-900/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-900/30 transition-colors"
                >
                  Cancelar venta
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          {loading ? (
            <p className="text-slate-400">Cargando...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-800">
                    <th className="pb-3 font-medium">Factura</th>
                    <th className="pb-3 font-medium">Fecha</th>
                    <th className="pb-3 font-medium">Sucursal</th>
                    <th className="pb-3 font-medium">Usuario</th>
                    <th className="pb-3 font-medium">Cliente</th>
                    <th className="pb-3 font-medium text-right">Total</th>
                    <th className="pb-3 font-medium">Estado</th>
                    <th className="pb-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-900/50 cursor-pointer" onClick={() => setSelectedSale(s)}>
                      <td className="py-3 text-white font-medium">#{s.invoiceNumber}</td>
                      <td className="py-3 text-slate-400">{new Date(s.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 text-slate-300">{s.branch.name}</td>
                      <td className="py-3 text-slate-400">{s.user.username}</td>
                      <td className="py-3 text-slate-400">{s.customer ? `${s.customer.firstName} ${s.customer.lastName ?? ""}` : "—"}</td>
                      <td className="py-3 text-right text-white font-medium">${s.total}</td>
                      <td className="py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          s.status === "COMPLETED" ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"
                        }`}>
                          {s.status === "COMPLETED" ? "Ok" : "Canc."}
                        </span>
                      </td>
                      <td className="py-3 text-right text-brand-light text-xs">Ver →</td>
                    </tr>
                  ))}
                  {sales.length === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-500">No hay ventas registradas</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
