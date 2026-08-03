import type { Product } from "../../lib/types";
import { formatMoney } from "../../lib/format";
import { inputCls } from "../ui/inputs";
import {
  emptySaleLine,
  lineSubtotal,
  priceFor,
  type PriceType,
  type SaleLine,
} from "./saleLines";

// Editor reutilizable de líneas de productos. Se escanea o escribe el código
// de barras y los datos del producto (nombre y precio) se cargan solos.
// Lo comparten Nueva Venta, Generar Préstamo y la edición de ventas del admin.

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

  // Al escanear/escribir el código se busca el producto y se autocompletan
  // sus datos; si deja de coincidir, la línea queda sin producto.
  const handleBarcode = (i: number, barcode: string) => {
    const product = products.find((p) => p.barcode === barcode.trim());
    update(i, {
      barcode,
      productId: product?.id ?? "",
      unitPrice: product
        ? String(priceFor(product, lines[i].priceType))
        : lines[i].unitPrice,
    });
  };

  // Al cambiar entre Mayor y Detal se recalcula el precio de esa linea.
  const handlePriceType = (i: number, priceType: PriceType) => {
    const product = products.find((p) => p.id === lines[i].productId);
    update(i, {
      priceType,
      unitPrice: product ? String(priceFor(product, priceType)) : lines[i].unitPrice,
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
        <span className={`${labelCls} w-32`}>Tipo precio</span>
        <span className={`${labelCls} w-28`}>Precio</span>
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
            <div className="flex w-32 rounded-lg overflow-hidden border border-slate-800">
              {(["MAYOR", "DETAL"] as PriceType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handlePriceType(i, type)}
                  aria-pressed={line.priceType === type}
                  className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                    line.priceType === type
                      ? "bg-brand text-white"
                      : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {type === "MAYOR" ? "Mayor" : "Detal"}
                </button>
              ))}
            </div>
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
