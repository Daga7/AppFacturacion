import type { PurchaseListItem } from "./types";
import { APP_NAME } from "./constants";

// Genera y descarga un PDF con la lista de compras. jsPDF y autotable se cargan
// de forma diferida (import dinámico) para no engordar el bundle inicial —
// mismo criterio que la importación de xlsx en Inventario.
export async function downloadPurchaseListPdf(
  items: PurchaseListItem[],
  branchName?: string,
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF();
  const today = new Date().toLocaleDateString("es-CO", { dateStyle: "long" });

  // Encabezado
  doc.setFontSize(16);
  doc.text("Lista de compras", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(APP_NAME, 14, 25);
  doc.text(
    `${branchName ? `Sede: ${branchName} · ` : ""}Generado: ${today}`,
    14,
    31,
  );

  const itemName = (i: PurchaseListItem) =>
    i.product?.name ?? i.label ?? "—";

  // Columnas pensadas para el proveedor: qué es, si lo sugirió el sistema o el
  // vendedor, la observación y la cantidad a comprar.
  const rows = items.map((i) => [
    itemName(i),
    i.source === "AUTO" ? "Sugerido" : "Manual",
    i.note ?? "",
    i.quantity != null ? String(i.quantity) : "—",
  ]);

  autoTable(doc, {
    startY: 37,
    head: [["Producto", "Origen", "Observaciones", "Cantidad"]],
    body: rows,
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59] }, // slate-800, coherente con la app
    columnStyles: {
      0: { cellWidth: 65 },
      2: { cellWidth: 60 },
      3: { halign: "center", cellWidth: 25 },
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`lista-compras-${stamp}.pdf`);
}
