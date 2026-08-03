// Modelo y helpers de las líneas de producto de una venta/préstamo.
// Separados del componente editor para poder reutilizarlos en formularios.

// Tipo de precio con el que se cobra una linea. Por defecto siempre "MAYOR".
export type PriceType = "MAYOR" | "DETAL";

export interface SaleLine {
  productId: string;
  barcode: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  discountReason: string;
  priceType: PriceType;
}

export const emptySaleLine = (): SaleLine => ({
  productId: "",
  barcode: "",
  quantity: "1",
  unitPrice: "",
  discount: "0",
  discountReason: "",
  priceType: "MAYOR",
});

// Precio del producto segun el tipo elegido. Si el producto todavia no tiene
// los precios nuevos cargados, cae al salePrice historico.
export const priceFor = (
  product: { retailPrice?: number; wholesalePrice?: number; salePrice: number },
  type: PriceType,
): number => {
  const value = type === "DETAL" ? product.retailPrice : product.wholesalePrice;
  return value ?? product.salePrice;
};

export const lineSubtotal = (l: SaleLine) => {
  const qty = parseInt(l.quantity, 10) || 0;
  const price = parseFloat(l.unitPrice) || 0;
  const disc = parseFloat(l.discount) || 0;
  return qty * price - disc;
};

export const linesTotal = (lines: SaleLine[]) =>
  lines.filter((l) => l.productId).reduce((sum, l) => sum + lineSubtotal(l), 0);

// Devuelve los detalles listos para la API, o un mensaje de error.
export function parseLines(
  lines: SaleLine[],
): { details: { productId: string; quantity: number; unitPrice: number; discount: number; discountReason?: string }[] } | { error: string } {
  const details = lines
    .filter((l) => l.productId)
    .map((l) => ({
      productId: l.productId,
      quantity: parseInt(l.quantity, 10),
      unitPrice: parseFloat(l.unitPrice),
      discount: parseFloat(l.discount) || 0,
      discountReason: l.discountReason.trim() || undefined,
    }));
  if (details.length === 0) return { error: "Agrega al menos un producto" };
  if (details.some((d) => !d.quantity || d.quantity < 1)) return { error: "Hay cantidades inválidas" };
  if (details.some((d) => isNaN(d.unitPrice) || d.unitPrice < 0)) return { error: "Hay precios inválidos" };
  const ids = details.map((d) => d.productId);
  if (new Set(ids).size !== ids.length) return { error: "No repitas el mismo producto en varias filas" };
  return { details };
}
