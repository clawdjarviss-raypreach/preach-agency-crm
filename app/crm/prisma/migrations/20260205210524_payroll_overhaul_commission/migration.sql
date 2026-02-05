-- AlterTable
ALTER TABLE "Payroll" ADD COLUMN "commissionCents" INTEGER;
ALTER TABLE "Payroll" ADD COLUMN "grossSalesCents" INTEGER;
ALTER TABLE "Payroll" ADD COLUMN "netSalesCents" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "supervisorId" TEXT,
    "hourlyRateCents" INTEGER,
    "commissionBps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "hourlyRateCents", "id", "name", "passwordHash", "role", "status", "supervisorId", "updatedAt") SELECT "createdAt", "email", "hourlyRateCents", "id", "name", "passwordHash", "role", "status", "supervisorId", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
