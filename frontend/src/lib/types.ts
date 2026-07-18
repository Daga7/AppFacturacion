// Tipos de dominio compartidos entre módulos (inventario, facturación, informes).

export interface BranchInfo {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  purchasePrice: number;
  salePrice: number;
  isActive: boolean;
  category: Category;
  inventories?: { amount: number; branchId: string; branch: BranchInfo }[];
}

export interface Customer {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  address?: string | null;
  type: "REGULAR" | "SPECIAL";
  branchId: string;
  branch?: BranchInfo;
}

export type PaymentMethod = "CASH" | "NEQUI" | "BANCOLOMBIA";

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  NEQUI: "Nequi",
  BANCOLOMBIA: "Bancolombia",
};

export interface SaleDetail {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountReason?: string | null;
  subtotal: number;
  product: Product;
}

export interface SalePayment {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
}

export interface LoanPayment {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
}

export interface Loan {
  id: string;
  originalAmount: number;
  pendingAmount: number;
  loanStatus: "ACTIVE" | "PAID";
  customerId: string;
  customer: Customer;
  payments: LoanPayment[];
  sale?: Sale;
  createdAt: string;
}

// En /sales el préstamo viene sin el cliente anidado (ya está en sale.customer).
export interface SaleLoan {
  id: string;
  originalAmount: number;
  pendingAmount: number;
  loanStatus: "ACTIVE" | "PAID";
  payments: LoanPayment[];
}

export interface Sale {
  id: string;
  invoiceNumber: number;
  total: number;
  isCredit: boolean;
  status: "COMPLETED" | "CANCELLED";
  customer?: Customer | null;
  user?: { id: string; username: string };
  branch: BranchInfo;
  details: SaleDetail[];
  payments: SalePayment[];
  loan?: SaleLoan | null;
  cashSessionId?: string | null;
  createdAt: string;
}

// Sesión de caja de una sucursal (apertura → ventas → cierre).
export interface CashSession {
  id: string;
  openingAmount: number;
  closingAmount?: number | null;
  status: "OPEN" | "CLOSED";
  branch: BranchInfo;
  openedBy?: { id: string; username: string };
  openedAt: string;
  closedAt?: string | null;
}

export interface CashSummary {
  session: CashSession;
  salesCount: number;
  totalSales: number;
  cashReceived: number;
  nequiReceived: number;
  bancolombiaReceived: number;
  transferReceived: number;
  loans: { count: number; total: number };
  discounts: { count: number; total: number };
  expectedCash: number;
  difference: number | null;
}

export interface DiscountDetail {
  saleId: string;
  invoiceNumber: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  originalPrice: number;
  discountedPrice: number;
  discount: number;
  reason?: string | null;
  user: string;
  createdAt: string;
}
