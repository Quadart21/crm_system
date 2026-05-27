-- AlterTable
ALTER TABLE "IssueRecord" ADD COLUMN "couponPercent" REAL;
ALTER TABLE "IssueRecord" ADD COLUMN "calculationData" TEXT;

-- AlterTable
ALTER TABLE "CourierStatusRule" ADD COLUMN "returnRules" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "CourierStatusRule" ADD COLUMN "returnLogic" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "CourierStatusRule" ADD COLUMN "returnPercent" REAL NOT NULL DEFAULT 0;
ALTER TABLE "CourierStatusRule" ADD COLUMN "couponRules" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "CourierStatusRule" ADD COLUMN "couponLogic" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "CourierStatusRule" ADD COLUMN "couponPercent" REAL NOT NULL DEFAULT 0;
ALTER TABLE "CourierStatusRule" ADD COLUMN "manualMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CourierStatusRule" ADD COLUMN "workBlocked" BOOLEAN NOT NULL DEFAULT false;
