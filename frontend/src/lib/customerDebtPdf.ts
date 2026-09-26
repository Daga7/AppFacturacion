import type { Loan } from "./types";
import { APP_NAME } from "./constants";
import { formatMoney, formatDate, saleCode } from "./format";

// Estado de cuenta de un cliente para enviárselo por WhatsApp/Telegram: qué
// mercancía tiene pendiente, cuánto ha abonado y cuánto debe. jsPDF y autotable
// se cargan de forma diferida, igual que en la lista de compras.
export async function downloadCustomerDebtPdf(
  customerName: string,
  loans: Loan[],
  options: { phone?: string | null; branchName?: string } = {},
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF();
  const today = new Date().toLocaleDateString("es-CO", {
    dateStyle: "long",
    timeZone: "America/Bogota",
  });

  // Encabezado
  doc.setFontSize(16);
  doc.text("Estado de cuenta", 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text(customerName, 14, 26);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(APP_NAME, 14, 33);
  const meta = [
    options.branchName ? `Sede: ${options.branchName}` : null,
    options.phone ? `Tel: ${options.phone}` : null,
    `Generado: ${today}`,
  ]
    .filter(Boolean)
    .join(" · ");
  doc.text(meta, 14, 39);

  // Una fila por producto pendiente, agrupando visualmente por préstamo.
  const rows: (string | number)[][] = [];
  let totalPending = 0;
  let totalAbonado = 0;

  const sorted = [...loans].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const loan of sorted) {
    const abonado = loan.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    totalPending += Number(loan.pendingAmount);
    totalAbonado += abonado;

    const factura = loan.sale ? saleCode(loan.sale) : "—";
    const details = loan.sale?.details ?? [];

    if (details.length === 0) {
      rows.push([
        formatDate(loan.createdAt),
        factura,
        "—",
        "",
        formatMoney(loan.originalAmount),
        formatMoney(abonado),
        formatMoney(loan.pendingAmount),
      ]);
      continue;
    }

    details.forEach((d, i) => {
      // Los montos del préstamo se escriben solo en la primera fila para que
      // no parezca que cada producto tiene su propio saldo.
      rows.push([
        i === 0 ? formatDate(loan.createdAt) : "",
        i === 0 ? factura : "",
        d.product?.name ?? "—",
        String(d.quantity),
        i === 0 ? formatMoney(loan.originalAmount) : "",
        i === 0 ? formatMoney(abonado) : "",
        i === 0 ? formatMoney(loan.pendingAmount) : "",
      ]);
    });
  }

  autoTable(doc, {
    startY: 45,
    head: [["Fecha", "Factura", "Producto", "Cant.", "Valor", "Abonado", "Debe"]],
    body: rows,
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59] }, // slate-800, coherente con la app
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 18 },
      2: { cellWidth: 55 },
      3: { halign: "center", cellWidth: 14 },
      4: { halign: "right", cellWidth: 24 },
      5: { halign: "right", cellWidth: 24 },
      6: { halign: "right", cellWidth: 24 },
    },
  });

  // Totales debajo de la tabla.
  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? 45;

  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(`Total abonado: ${formatMoney(totalAbonado)}`, 14, finalY + 10);
  doc.setFontSize(13);
  doc.setTextColor(0);
  doc.text(`SALDO PENDIENTE: ${formatMoney(totalPending)}`, 14, finalY + 19);

  doc.setFontSize(9);
  doc.setTextColor(130);
  doc.text(
    "Este documento es informativo y refleja el saldo a la fecha de generación.",
    14,
    finalY + 28,
  );

  const slug = customerName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`deuda-${slug || "cliente"}-${stamp}.pdf`);
}
