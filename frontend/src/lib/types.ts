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
  createdAt: string;
}
