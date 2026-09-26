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
  retailPrice: number;
  wholesalePrice: number;
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
  // Registrado sin internet y aún sin enviar al servidor.
  pending?: boolean;
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
  pending?: boolean;
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
  // Devoluciones hechas sobre la venta (módulo de devoluciones del cajero).
  returns?: SaleReturn[];
  cashSessionId?: string | null;
  createdAt: string;
  // Hecha sin internet: aún no tiene número de factura.
  pending?: boolean;
}

// Devolución de unidades de una línea de venta de contado.
export interface SaleReturn {
  id: string;
  saleId: string;
  saleDetailId: string;
  productId: string;
  quantity: number;
  refundAmount: number;
  paymentMethod: PaymentMethod;
  reason?: string | null;
  createdAt: string;
}

// Resultado de buscar por código de barras qué ventas de contado recientes
// de la sede se pueden devolver (los préstamos no aparecen, solo se cuentan).
export interface ReturnLookup {
  product: Product;
  since: string;
  windowDays: number;
  loans: number;
  sales: ReturnableSale[];
}

export interface ReturnableSale {
  saleId: string;
  saleDetailId: string;
  invoiceNumber: number;
  createdAt: string;
  customerName: string | null;
  seller: string;
  quantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  unitPaid: number;
  paymentMethods: PaymentMethod[];
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
  pending?: boolean;
}

export interface CashSummary {
  session: CashSession;
  salesCount: number;
  // "Ventas del día": todo lo recibido (efectivo + transferencias), abonos y
  // pedidos especiales incluidos. Los préstamos no suman aquí.
  totalSales: number;
  // Lo cobrado en las ventas del turno (incluida la cuota inicial de préstamos).
  salesReceived: number;
  // Recibido por medio de pago: ventas + abonos + pedidos especiales.
  cashReceived: number;
  nequiReceived: number;
  bancolombiaReceived: number;
  transferReceived: number;
  loans: { count: number; total: number };
  discounts: { count: number; total: number };
  specialOrders: {
    count: number;
    total: number;
    cash: number;
    nequi: number;
    bancolombia: number;
  };
  // Abonos a préstamos recibidos en el turno: los clientes que pagaron
  // mercancía pendiente.
  loanPayments: {
    count: number;
    total: number;
    cash: number;
    nequi: number;
    bancolombia: number;
    rows: LoanPaymentRow[];
  };
  // Devoluciones del turno: el efectivo devuelto se resta del esperado.
  returns: {
    count: number;
    total: number;
    cash: number;
    nequi: number;
    bancolombia: number;
    rows: ReturnRow[];
  };
  expectedCash: number;
  difference: number | null;
}

export interface ReturnRow {
  productName: string;
  quantity: number;
  amount: number;
  paymentMethod: PaymentMethod;
  invoiceNumber: number;
  reason?: string | null;
  user: string;
  createdAt: string;
}

export interface LoanPaymentRow {
  customerName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  pendingAfter: number;
  settled: boolean;
  products: string;
  createdAt: string;
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

// Estado compartido por solicitudes de traslado (#2) y de precio (#5).
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export const requestStatusLabels: Record<RequestStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
};

type UserRef = { id: string; username: string };

// #2 Solicitud de traslado entre sucursales.
export interface TransferRequest {
  id: string;
  fromBranchId: string;
  toBranchId: string;
  productId: string;
  quantity: number;
  status: RequestStatus;
  note?: string | null;
  requestedBy: UserRef;
  resolvedBy?: UserRef | null;
  resolvedAt?: string | null;
  product: Product;
  fromBranch: BranchInfo;
  toBranch: BranchInfo;
  createdAt: string;
}

// Garantía con el proveedor: mercancía defectuosa de una sede que se le
// devuelve al proveedor. Sale del inventario cuando el administrador aprueba.
export interface WarrantyClaim {
  id: string;
  branchId: string;
  productId: string;
  quantity: number;
  reason: string;
  supplier?: string | null;
  status: RequestStatus;
  requestedBy: UserRef;
  resolvedBy?: UserRef | null;
  resolvedAt?: string | null;
  product: Product;
  branch: BranchInfo;
  createdAt: string;
}

// #3 Pedido especial.
export type SpecialOrderStatus =
  | "DEPOSITED"
  | "ORDERED"
  | "ARRIVED"
  | "PICKED_UP";

export const specialOrderStatusLabels: Record<SpecialOrderStatus, string> = {
  DEPOSITED: "Abonado",
  ORDERED: "Pedido hecho",
  ARRIVED: "En el local",
  PICKED_UP: "Recogido",
};

export interface SpecialOrderPayment {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  kind: "DEPOSIT" | "FINAL";
  createdAt: string;
}

export interface SpecialOrder {
  id: string;
  customerName: string;
  partName: string;
  description?: string | null;
  totalAmount: number;
  depositedAmount: number;
  // Costo del repuesto: solo llega en la respuesta para ADMIN (para los demás
  // roles el backend lo omite). Se usa para la ganancia.
  cost?: number | null;
  status: SpecialOrderStatus;
  estimatedArrival?: string | null;
  branch: BranchInfo;
  createdBy: UserRef;
  payments: SpecialOrderPayment[];
  createdAt: string;
}

// #4 Lista de compras: ítem guardado y recomendación automática.
export interface PurchaseListItem {
  id: string;
  productId?: string | null;
  label?: string | null;
  quantity?: number | null;
  note?: string | null;
  source: "MANUAL" | "AUTO";
  resolved: boolean;
  branchId?: string | null;
  product?: Product | null;
  branch?: BranchInfo | null;
  createdBy: UserRef;
  createdAt: string;
}

export interface PurchaseRecommendation {
  productId: string;
  productName: string;
  categoryName: string;
  branchId: string;
  branchName: string;
  currentStock: number;
  soldLastPeriod: number;
  dailyVelocity: number;
  daysUntilEmpty: number | null;
  reasons: string[];
}

// #5 Solicitud de cambio de precio.
export interface PriceChangeRequest {
  id: string;
  productId: string;
  currentPrice: number;
  suggestedPrice: number;
  reason?: string | null;
  status: RequestStatus;
  requestedBy: UserRef;
  resolvedBy?: UserRef | null;
  resolvedAt?: string | null;
  product: Product;
  createdAt: string;
}

// Aviso de algo registrado sin internet que no cuadró al enviarse.
export type OfflineIssueType =
  | "NEGATIVE_STOCK"
  | "OVERPAYMENT"
  | "LOAN_NOT_FOUND"
  | "LOAN_ALREADY_CLOSED"
  | "CASH_ALREADY_OPEN"
  | "NO_CASH_SESSION"
  | "REJECTED";

export interface OfflineIssue {
  id: string;
  type: OfflineIssueType;
  message: string;
  occurredAt: string;
  saleId?: string | null;
  loanId?: string | null;
  branch: BranchInfo;
  user: UserRef;
  resolvedAt?: string | null;
  resolvedBy?: UserRef | null;
  createdAt: string;
}
