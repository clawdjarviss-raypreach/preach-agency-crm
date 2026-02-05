/*
  Warnings:

  - You are about to drop the `OnlyMonsterTrackingLink` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OnlyMonsterTrialLink` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `creatorId` to the `ShiftReport` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "OnlyMonsterTrackingLink_lastSyncedAt_idx";

-- DropIndex
DROP INDEX "OnlyMonsterTrackingLink_isActive_idx";

-- DropIndex
DROP INDEX "OnlyMonsterTrackingLink_creatorId_idx";

-- DropIndex
DROP INDEX "OnlyMonsterTrackingLink_omId_key";

-- DropIndex
DROP INDEX "OnlyMonsterTrialLink_lastSyncedAt_idx";

-- DropIndex
DROP INDEX "OnlyMonsterTrialLink_isActive_idx";

-- DropIndex
DROP INDEX "OnlyMonsterTrialLink_creatorId_idx";

-- DropIndex
DROP INDEX "OnlyMonsterTrialLink_omId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OnlyMonsterTrackingLink";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OnlyMonsterTrialLink";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShiftReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "busyness" INTEGER NOT NULL,
    "whatWentWell" TEXT NOT NULL,
    "whatDidntGoWell" TEXT NOT NULL,
    "mmSellingChats" TEXT,
    "revenueCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftReport_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftReport_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ShiftReport" ("busyness", "createdAt", "createdById", "id", "mmSellingChats", "revenueCents", "shiftId", "whatDidntGoWell", "whatWentWell") SELECT "busyness", "createdAt", "createdById", "id", "mmSellingChats", "revenueCents", "shiftId", "whatDidntGoWell", "whatWentWell" FROM "ShiftReport";
DROP TABLE "ShiftReport";
ALTER TABLE "new_ShiftReport" RENAME TO "ShiftReport";
CREATE UNIQUE INDEX "ShiftReport_shiftId_key" ON "ShiftReport"("shiftId");
CREATE INDEX "ShiftReport_createdById_idx" ON "ShiftReport"("createdById");
CREATE INDEX "ShiftReport_creatorId_idx" ON "ShiftReport"("creatorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
