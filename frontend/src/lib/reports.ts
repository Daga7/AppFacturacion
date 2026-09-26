// Tipos de las respuestas de /reports/*, compartidos por los paneles de Informes.
// Todos los montos vienen netos de devoluciones (lo devuelto al cliente ya
// está restado de la venta original).

export interface ReportPeriod {
  since: string;
  days: number;
}

export interface SalesSummary {
  period: ReportPeriod;
  // refunded: lo devuelto a los clientes de estas ventas (ya descontado).
  summary: { totalSales: number; totalRevenue: number; avgTicket: number; refunded: number };
  byDay: Record<string, { count: number; total: number }>;
}

export interface TopProducts {
  period: ReportPeriod;
  top: { productId: string; name: string; quantity: number; total: number }[];
}

export interface InventoryStatus {
  summary: { totalProducts: number; totalUnits: number; lowStock: number; outOfStock: number };
  byCategory: Record<string, { count: number; units: number }>;
}

export type PaymentMethodBreakdown = Record<
  string,
  { count: number; total: number; share: number }
>;

export interface PaymentSummary {
  period: ReportPeriod;
  byMethod: PaymentMethodBreakdown;
  grandTotal: number;
}

export interface GeneralSummary {
  period: ReportPeriod;
  summary: { totalRevenue: number; totalTickets: number; totalProfit: number; refunded: number };
  // Ganancia de pedidos especiales entregados y costeados (incluida en
  // totalProfit). Solo aparece en el informe general (perfil admin).
  specialOrders: { count: number; profit: number };
  byMethod: PaymentMethodBreakdown;
  grandTotalPayments: number;
  byBranch: Record<string, { tickets: number; revenue: number }>;
}

export interface ProfitRow {
  saleId: string;
  invoiceNumber: number;
  branch: string;
  createdAt: string;
  total: number;
  cost: number;
  profit: number;
  // Devuelto al cliente (ya descontado de total).
  returned: number;
}

export interface ProfitSummary {
  period: ReportPeriod;
  rows: ProfitRow[];
  totals: { revenue: number; cost: number; profit: number };
}

export interface ProfitTotal {
  period: ReportPeriod;
  revenue: number;
  cost: number;
  profit: number;
}
