-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "login" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "handBalance" REAL NOT NULL DEFAULT 0,
    "depositBalance" REAL NOT NULL DEFAULT 0,
    "bankBalance" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CityProductSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cityId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PriceRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cityId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "price" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StashType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cityId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surcharge" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Marketplace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "remainingGram" REAL NOT NULL,
    "costPerGram" REAL NOT NULL DEFAULT 0,
    "fasEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fasCost" REAL NOT NULL DEFAULT 0,
    "fasPackages" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "courierId" TEXT,
    "issuedAt" DATETIME,
    "closedAt" DATETIME,
    "closeReason" TEXT,
    "retailCloseSum" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DataEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courierId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'RETAIL',
    "weightPerAddr" REAL NOT NULL,
    "stashTypeName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "mpDistribution" TEXT NOT NULL,
    "grossWeight" REAL NOT NULL,
    "earnings" REAL NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IssueRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "batchId" TEXT,
    "dataEntryId" TEXT,
    "weight" REAL NOT NULL,
    "marketplace" TEXT,
    "stashType" TEXT,
    "retailPrice" REAL NOT NULL,
    "problemIds" TEXT NOT NULL,
    "otherText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "decisionId" TEXT,
    "calcType" TEXT,
    "writeOff" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Penalty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courierId" TEXT NOT NULL,
    "issueId" TEXT,
    "amount" REAL NOT NULL,
    "applyCourierStatus" BOOLEAN NOT NULL DEFAULT false,
    "stashDeduction" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "bankWrittenOff" REAL NOT NULL DEFAULT 0,
    "depositWrittenOff" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FinanceProcessing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataEntryId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "remainingGram" REAL NOT NULL,
    "earnings" REAL NOT NULL,
    "maxHand" REAL NOT NULL,
    "handAmount" REAL NOT NULL DEFAULT 0,
    "depositAmount" REAL NOT NULL DEFAULT 0,
    "bankAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

-- CreateTable
CREATE TABLE "FinanceLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProblemType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DisputeDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "calcType" TEXT NOT NULL,
    "percent" REAL NOT NULL DEFAULT 0,
    "manualAmount" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CourierStatusRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "minPercent" REAL NOT NULL,
    "maxPercent" REAL,
    "description" TEXT NOT NULL,
    "paysWhat" TEXT NOT NULL,
    "blockPayouts" BOOLEAN NOT NULL DEFAULT false,
    "payoutLimit" REAL,
    "depositRequired" REAL NOT NULL DEFAULT 0,
    "extraCriteria" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "userLogin" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_login_key" ON "Employee"("login");

-- CreateIndex
CREATE UNIQUE INDEX "City_name_key" ON "City"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CityProductSetting_cityId_productId_mode_key" ON "CityProductSetting"("cityId", "productId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "PriceRate_cityId_productId_mode_weight_key" ON "PriceRate"("cityId", "productId", "mode", "weight");

-- CreateIndex
CREATE UNIQUE INDEX "Marketplace_name_key" ON "Marketplace"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceProcessing_dataEntryId_key" ON "FinanceProcessing"("dataEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemType_name_key" ON "ProblemType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DisputeDecision_name_key" ON "DisputeDecision"("name");
