// Modelo y helpers de las líneas de producto de una venta/préstamo.
// Separados del componente editor para poder reutilizarlos en formularios.

export interface SaleLine {
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
}

export const emptySaleLine = (): SaleLine => ({
  productId: "",
  quantity: "1",
  unitPrice: "",
  discount: "0",
});

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
): { details: { productId: string; quantity: number; unitPrice: number; discount: number }[] } | { error: string } {
  const details = lines
    .filter((l) => l.productId)
    .map((l) => ({
      productId: l.productId,
      quantity: parseInt(l.quantity, 10),
      unitPrice: parseFloat(l.unitPrice),
      discount: parseFloat(l.discount) || 0,
    }));
  if (details.length === 0) return { error: "Agrega al menos un producto" };
  if (details.some((d) => !d.quantity || d.quantity < 1)) return { error: "Hay cantidades inválidas" };
  if (details.some((d) => isNaN(d.unitPrice) || d.unitPrice < 0)) return { error: "Hay precios inválidos" };
  const ids = details.map((d) => d.productId);
  if (new Set(ids).size !== ids.length) return { error: "No repitas el mismo producto en varias filas" };
  return { details };
}
