// Helpers de formato compartidos por toda la app.

export const formatMoney = (value: number | string) =>
  `$${Number(value).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { dateStyle: "medium" });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });

// Número de factura al estilo "F0001" (único por sucursal).
export const invoiceCode = (n: number) => `F${String(n).padStart(4, "0")}`;
