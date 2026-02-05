-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BonusRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'manual',
    "thresholdCents" INTEGER,
    "targetThreshold" INTEGER,
    "percentageBps" INTEGER,
    "flatAmountCents" INTEGER,
    "multiplier" REAL NOT NULL DEFAULT 1.0,
    "creatorId" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BonusRule_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BonusRule" ("createdAt", "flatAmountCents", "id", "isActive", "name", "percentageBps", "thresholdCents", "type") SELECT "createdAt", "flatAmountCents", "id", "isActive", "name", "percentageBps", "thresholdCents", "type" FROM "BonusRule";
DROP TABLE "BonusRule";
ALTER TABLE "new_BonusRule" RENAME TO "BonusRule";
CREATE INDEX "BonusRule_creatorId_idx" ON "BonusRule"("creatorId");
CREATE INDEX "BonusRule_startDate_endDate_idx" ON "BonusRule"("startDate", "endDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
