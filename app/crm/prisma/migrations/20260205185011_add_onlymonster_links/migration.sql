-- CreateTable
CREATE TABLE "OnlyMonsterTrialLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "omId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "claims" INTEGER NOT NULL,
    "claimsLimit" INTEGER,
    "durationDays" INTEGER,
    "expiresAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "omCreatedAt" DATETIME,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawData" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnlyMonsterTrialLink_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OnlyMonsterTrackingLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "omId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "subscribers" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "omCreatedAt" DATETIME,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawData" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnlyMonsterTrackingLink_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OnlyMonsterTrialLink_omId_key" ON "OnlyMonsterTrialLink"("omId");

-- CreateIndex
CREATE INDEX "OnlyMonsterTrialLink_creatorId_idx" ON "OnlyMonsterTrialLink"("creatorId");

-- CreateIndex
CREATE INDEX "OnlyMonsterTrialLink_isActive_idx" ON "OnlyMonsterTrialLink"("isActive");

-- CreateIndex
CREATE INDEX "OnlyMonsterTrialLink_lastSyncedAt_idx" ON "OnlyMonsterTrialLink"("lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OnlyMonsterTrackingLink_omId_key" ON "OnlyMonsterTrackingLink"("omId");

-- CreateIndex
CREATE INDEX "OnlyMonsterTrackingLink_creatorId_idx" ON "OnlyMonsterTrackingLink"("creatorId");

-- CreateIndex
CREATE INDEX "OnlyMonsterTrackingLink_isActive_idx" ON "OnlyMonsterTrackingLink"("isActive");

-- CreateIndex
CREATE INDEX "OnlyMonsterTrackingLink_lastSyncedAt_idx" ON "OnlyMonsterTrackingLink"("lastSyncedAt");
