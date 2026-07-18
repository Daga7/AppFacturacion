// Tipos de las respuestas de /reports/*, compartidos por los paneles de Informes.

export interface ReportPeriod {
  since: string;
  days: number;
}

export interface SalesSummary {
  period: ReportPeriod;
  summary: { totalSales: number; totalRevenue: number; avgTicket: number };
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
  summary: { totalRevenue: number; totalTickets: number; totalProfit: number };
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
}

export interface ProfitSummary {
  period: ReportPeriod;
  rows: ProfitRow[];
  totals: { revenue: number; cost: number; profit: number };
}
