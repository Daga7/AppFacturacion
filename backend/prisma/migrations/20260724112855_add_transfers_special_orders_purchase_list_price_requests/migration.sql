-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SpecialOrderStatus" AS ENUM ('DEPOSITED', 'ORDERED', 'ARRIVED', 'PICKED_UP');

-- CreateEnum
CREATE TYPE "SpecialOrderPaymentKind" AS ENUM ('DEPOSIT', 'FINAL');

-- CreateEnum
CREATE TYPE "PurchaseListSource" AS ENUM ('MANUAL', 'AUTO');

-- CreateTable
CREATE TABLE "BranchTransferRequest" (
    "id" TEXT NOT NULL,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "transferGroupId" TEXT,
    "requestedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchTransferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialOrder" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "description" TEXT,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "depositedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "SpecialOrderStatus" NOT NULL DEFAULT 'DEPOSITED',
    "estimatedArrival" TIMESTAMP(3),
    "branchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialOrderPayment" (
    "id" TEXT NOT NULL,
    "specialOrderId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "kind" "SpecialOrderPaymentKind" NOT NULL,
    "cashSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecialOrderPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseListItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "label" TEXT,
    "note" TEXT,
    "source" "PurchaseListSource" NOT NULL DEFAULT 'MANUAL',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "branchId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChangeRequest" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "currentPrice" DECIMAL(65,30) NOT NULL,
    "suggestedPrice" DECIMAL(65,30) NOT NULL,
    "reason" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchTransferRequest_status_idx" ON "BranchTransferRequest"("status");

-- CreateIndex
CREATE INDEX "BranchTransferRequest_fromBranchId_status_idx" ON "BranchTransferRequest"("fromBranchId", "status");

-- CreateIndex
CREATE INDEX "SpecialOrder_branchId_status_idx" ON "SpecialOrder"("branchId", "status");

-- CreateIndex
CREATE INDEX "SpecialOrderPayment_cashSessionId_idx" ON "SpecialOrderPayment"("cashSessionId");

-- CreateIndex
CREATE INDEX "PurchaseListItem_resolved_idx" ON "PurchaseListItem"("resolved");

-- CreateIndex
CREATE INDEX "PriceChangeRequest_status_idx" ON "PriceChangeRequest"("status");

-- AddForeignKey
ALTER TABLE "BranchTransferRequest" ADD CONSTRAINT "BranchTransferRequest_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTransferRequest" ADD CONSTRAINT "BranchTransferRequest_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTransferRequest" ADD CONSTRAINT "BranchTransferRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTransferRequest" ADD CONSTRAINT "BranchTransferRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTransferRequest" ADD CONSTRAINT "BranchTransferRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialOrder" ADD CONSTRAINT "SpecialOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialOrder" ADD CONSTRAINT "SpecialOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialOrderPayment" ADD CONSTRAINT "SpecialOrderPayment_specialOrderId_fkey" FOREIGN KEY ("specialOrderId") REFERENCES "SpecialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialOrderPayment" ADD CONSTRAINT "SpecialOrderPayment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseListItem" ADD CONSTRAINT "PurchaseListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseListItem" ADD CONSTRAINT "PurchaseListItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseListItem" ADD CONSTRAINT "PurchaseListItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChangeRequest" ADD CONSTRAINT "PriceChangeRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChangeRequest" ADD CONSTRAINT "PriceChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChangeRequest" ADD CONSTRAINT "PriceChangeRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

