import type { Product } from "../../lib/types";
import { formatMoney } from "../../lib/format";
import { inputCls } from "../ui/inputs";
import {
  emptySaleLine,
  lineSubtotal,
  wholesalePriceOf,
  type SaleLine,
  type SaleMode,
} from "./saleLines";

// Editor reutilizable de líneas de productos. Se escanea o escribe el código
// de barras y los datos del producto se cargan solos.
// Lo comparten Nueva Venta, Generar Préstamo y la edición de ventas del admin.
//
// El modo lo fija el formulario completo, no cada línea: en MAYOR el precio
// llega de la base de datos al escanear; en DETAL lo digita el cajero.

interface ProductLinesEditorProps {
  products: Product[];
  lines: SaleLine[];
  onChange: (lines: SaleLine[]) => void;
  availability?: (productId: string) => number;
  showDiscount?: boolean;
  mode?: SaleMode;
}

export function ProductLinesEditor({
  products,
  lines,
  onChange,
  availability,
  showDiscount = true,
  mode = "MAYOR",
}: ProductLinesEditorProps) {
  const update = (i: number, patch: Partial<SaleLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  // Al escanear/escribir el código se busca el producto y se autocompletan
  // sus datos; si deja de coincidir, la línea queda sin producto.
  // En venta al detal el precio queda vacío para que el cajero lo escriba.
  const handleBarcode = (i: number, barcode: string) => {
    const product = products.find((p) => p.barcode === barcode.trim());
    update(i, {
      barcode,
      productId: product?.id ?? "",
      unitPrice:
        mode === "MAYOR" && product
          ? String(wholesalePriceOf(product))
          : lines[i].unitPrice,
    });
  };

  // El lector de códigos envía Enter al final; evitamos que dispare submits.
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.preventDefault();
  };

  const labelCls = "text-xs text-slate-500";

  return (
    <div className="space-y-2">
      <div className="hidden md:flex gap-2 items-end">
        <span className={`${labelCls} w-44`}>Código de barras</span>
        <span className={`${labelCls} flex-1 min-w-40`}>Producto</span>
        <span className={`${labelCls} w-20`}>Cantidad</span>
        <span className={`${labelCls} w-28`}>
          {mode === "DETAL" ? "Precio (manual)" : "Precio"}
        </span>
        {showDiscount && <span className={`${labelCls} w-24`}>Desc. (opcional)</span>}
        <span className={`${labelCls} w-24 text-right`}>Subtotal</span>
        {lines.length > 1 && <span className="w-6" />}
      </div>

      {lines.map((line, i) => {
        const product = products.find((p) => p.id === line.productId);
        return (
          <div key={i} className="flex flex-wrap gap-2 items-center">
            <input
              value={line.barcode}
              onChange={(e) => handleBarcode(i, e.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              inputMode="numeric"
              placeholder="Escanea o escribe el código"
              className={`${inputCls} w-44 font-mono`}
            />
            <div className="flex-1 min-w-40 px-3 py-2 bg-slate-800/60 border border-slate-800 rounded-lg text-sm truncate">
              {product ? (
                <span className="text-white">
                  {product.name}
                  {availability && (
                    <span className="text-slate-500"> · disp: {availability(product.id)}</span>
                  )}
                </span>
              ) : line.barcode.trim() ? (
                <span className="text-red-400">Código no encontrado</span>
              ) : (
                <span className="text-slate-500">Producto</span>
              )}
            </div>
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
              placeholder={mode === "DETAL" ? "Escribe el precio" : "Precio"}
              value={line.unitPrice}
              onChange={(e) => update(i, { unitPrice: e.target.value })}
              autoFocus={mode === "DETAL" && !!line.productId && !line.unitPrice}
              className={`${inputCls} w-28 ${
                mode === "DETAL" && line.productId && !line.unitPrice
                  ? "border-amber-500/60"
                  : ""
              }`}
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
                className="text-slate-400 hover:text-red-400 text-sm px-1 w-6"
                aria-label="Quitar producto"
              >
                ✕
              </button>
            )}
            {showDiscount && (parseFloat(line.discount) || 0) > 0 && (
              <input
                placeholder="Motivo del descuento (opcional)"
                value={line.discountReason}
                onChange={(e) => update(i, { discountReason: e.target.value })}
                className={`${inputCls} w-full`}
              />
            )}
          </div>
        );
      })}
      <button
        onClick={() => onChange([...lines, emptySaleLine()])}
        className="text-sm text-brand-light hover:underline"
      >
        + Agregar otro producto
      </button>
    </div>
  );
}
