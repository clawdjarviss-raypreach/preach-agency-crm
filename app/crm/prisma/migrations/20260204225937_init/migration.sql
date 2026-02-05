-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "supervisorId" TEXT,
    "hourlyRateCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "platformId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChatterCreator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatterId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" DATETIME,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ChatterCreator_chatterId_fkey" FOREIGN KEY ("chatterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChatterCreator_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatterId" TEXT NOT NULL,
    "clockIn" DATETIME NOT NULL,
    "clockOut" DATETIME,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shift_chatterId_fkey" FOREIGN KEY ("chatterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Payroll" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatterId" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "hoursWorkedMinutes" INTEGER NOT NULL,
    "basePayCents" INTEGER NOT NULL,
    "bonusTotalCents" INTEGER NOT NULL DEFAULT 0,
    "deductionsCents" INTEGER NOT NULL DEFAULT 0,
    "netPayCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    CONSTRAINT "Payroll_chatterId_fkey" FOREIGN KEY ("chatterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payroll_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "PayPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BonusRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "thresholdCents" INTEGER,
    "percentageBps" INTEGER,
    "flatAmountCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Bonus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrollId" TEXT NOT NULL,
    "bonusRuleId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bonus_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "Payroll" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Bonus_bonusRuleId_fkey" FOREIGN KEY ("bonusRuleId") REFERENCES "BonusRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KpiSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatterId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "snapshotDate" DATETIME NOT NULL,
    "revenueCents" INTEGER,
    "messagesSent" INTEGER,
    "messagesReceived" INTEGER,
    "tipsReceivedCents" INTEGER,
    "ppvRevenueCents" INTEGER,
    "subsRenewed" INTEGER,
    "newSubs" INTEGER,
    "avgResponseTimeSec" INTEGER,
    "source" TEXT NOT NULL,
    "rawData" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KpiSnapshot_chatterId_fkey" FOREIGN KEY ("chatterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KpiSnapshot_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL,
    "recordsFetched" INTEGER,
    "recordsInserted" INTEGER,
    "errors" JSONB,
    "triggeredById" TEXT,
    CONSTRAINT "SyncLog_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Creator_platform_username_key" ON "Creator"("platform", "username");

-- CreateIndex
CREATE INDEX "ChatterCreator_chatterId_creatorId_idx" ON "ChatterCreator"("chatterId", "creatorId");

-- CreateIndex
CREATE INDEX "PayPeriod_startDate_endDate_idx" ON "PayPeriod"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payroll_chatterId_payPeriodId_key" ON "Payroll"("chatterId", "payPeriodId");

-- CreateIndex
CREATE INDEX "Bonus_payrollId_idx" ON "Bonus"("payrollId");

-- CreateIndex
CREATE INDEX "KpiSnapshot_chatterId_snapshotDate_idx" ON "KpiSnapshot"("chatterId", "snapshotDate");

-- CreateIndex
CREATE INDEX "KpiSnapshot_creatorId_snapshotDate_idx" ON "KpiSnapshot"("creatorId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiSnapshot_chatterId_creatorId_snapshotDate_key" ON "KpiSnapshot"("chatterId", "creatorId", "snapshotDate");
