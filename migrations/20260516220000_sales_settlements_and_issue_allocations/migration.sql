-- AlterTable
ALTER TABLE "FinanceLedger" ADD COLUMN "settlementId" TEXT;

-- CreateTable
CREATE TABLE "DataEntryIssueAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataEntryId" TEXT NOT NULL,
    "issueRecordId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "marketplace" TEXT,
    "stashType" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MonthlySettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courierId" TEXT NOT NULL,
    "periodFrom" DATETIME NOT NULL,
    "periodTo" DATETIME NOT NULL,
    "soldQuantity" INTEGER NOT NULL,
    "uploadedQuantity" INTEGER NOT NULL,
    "disputeCount" INTEGER NOT NULL,
    "openDisputeCount" INTEGER NOT NULL DEFAULT 0,
    "ticketCount" INTEGER NOT NULL,
    "disputePercent" REAL NOT NULL,
    "openDisputePercent" REAL NOT NULL DEFAULT 0,
    "courierStatusName" TEXT NOT NULL,
    "courierStatusRuleId" TEXT,
    "totalDisputeWriteOff" REAL NOT NULL DEFAULT 0,
    "bonusAmount" REAL NOT NULL DEFAULT 0,
    "requestedBankPayout" REAL NOT NULL DEFAULT 0,
    "finalBankPayout" REAL NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SettlementDisputeWriteOff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settlementId" TEXT NOT NULL,
    "issueRecordId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "decisionId" TEXT,
    "retailPrice" REAL NOT NULL,
    "couponPercent" REAL,
    "statusRuleName" TEXT NOT NULL,
    "writeOffAmount" REAL NOT NULL,
    "calculationData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "DataEntryIssueAllocation_issueRecordId_key" ON "DataEntryIssueAllocation"("issueRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementDisputeWriteOff_issueRecordId_key" ON "SettlementDisputeWriteOff"("issueRecordId");
