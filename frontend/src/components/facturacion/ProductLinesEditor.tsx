import type { Product } from "../../lib/types";
import { formatMoney } from "../../lib/format";
import { inputCls } from "../ui/inputs";
import { emptySaleLine, lineSubtotal, type SaleLine } from "./saleLines";

// Editor reutilizable de líneas de productos (producto + cantidad + precio +
// descuento). Lo comparten Nueva Venta, Generar Préstamo y la edición de
// ventas del administrador.

interface ProductLinesEditorProps {
  products: Product[];
  lines: SaleLine[];
  onChange: (lines: SaleLine[]) => void;
  availability?: (productId: string) => number;
  showDiscount?: boolean;
}

export function ProductLinesEditor({
  products,
  lines,
  onChange,
  availability,
  showDiscount = true,
}: ProductLinesEditorProps) {
  const update = (i: number, patch: Partial<SaleLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const selectProduct = (i: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    update(i, {
      productId,
      unitPrice: product ? String(product.salePrice) : "",
    });
  };

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-center">
          <select
            value={line.productId}
            onChange={(e) => selectProduct(i, e.target.value)}
            className={`${inputCls} flex-1 min-w-48`}
          >
            <option value="">Seleccionar producto</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.barcode})
                {availability ? ` — disp: ${availability(p.id)}` : ""}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            placeholder="Cant."
            value={line.quantity}
            onChange={(e) => update(i, { quantity: e.target.value })}
            className={`${inputCls} w-20`}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Precio"
            value={line.unitPrice}
            onChange={(e) => update(i, { unitPrice: e.target.value })}
            className={`${inputCls} w-28`}
          />
          {showDiscount && (
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Desc."
              value={line.discount}
              onChange={(e) => update(i, { discount: e.target.value })}
              className={`${inputCls} w-24`}
            />
          )}
          <span className="text-sm text-slate-300 font-mono w-24 text-right">
            {line.productId ? formatMoney(lineSubtotal(line)) : ""}
          </span>
          {lines.length > 1 && (
            <button
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
              className="text-slate-400 hover:text-red-400 text-sm px-1"
              aria-label="Quitar producto"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() => onChange([...lines, emptySaleLine()])}
        className="text-sm text-brand-light hover:underline"
      >
        + Agregar otro producto
      </button>
    </div>
  );
}
