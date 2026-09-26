-- Trabajo sin internet del cajero: operaciones ya recibidas desde los
-- dispositivos (para no duplicar reenvíos) y avisos para el administrador de
-- lo que no cuadró al sincronizar. Solo agrega tablas; no toca datos.

-- CreateEnum
CREATE TYPE "SyncOperationType" AS ENUM ('OPEN_CASH', 'CREATE_SALE', 'LOAN_PAYMENT', 'RETURN_LOAN');

-- CreateEnum
CREATE TYPE "OfflineIssueType" AS ENUM ('NEGATIVE_STOCK', 'OVERPAYMENT', 'LOAN_NOT_FOUND', 'LOAN_ALREADY_CLOSED', 'CASH_ALREADY_OPEN', 'NO_CASH_SESSION', 'REJECTED');

-- CreateTable
CREATE TABLE "SyncedOperation" (
    "id" TEXT NOT NULL,
    "type" "SyncOperationType" NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncedOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineIssue" (
    "id" TEXT NOT NULL,
    "type" "OfflineIssueType" NOT NULL,
    "message" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "saleId" TEXT,
    "loanId" TEXT,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfflineIssue_resolvedAt_idx" ON "OfflineIssue"("resolvedAt");

-- AddForeignKey
ALTER TABLE "OfflineIssue" ADD CONSTRAINT "OfflineIssue_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineIssue" ADD CONSTRAINT "OfflineIssue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineIssue" ADD CONSTRAINT "OfflineIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

