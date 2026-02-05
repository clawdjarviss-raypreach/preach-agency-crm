-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatterId" TEXT NOT NULL,
    "clockIn" DATETIME NOT NULL,
    "clockOut" DATETIME,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shift_chatterId_fkey" FOREIGN KEY ("chatterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shift_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Shift" ("approvedAt", "approvedById", "breakMinutes", "chatterId", "clockIn", "clockOut", "createdAt", "id", "notes") SELECT "approvedAt", "approvedById", "breakMinutes", "chatterId", "clockIn", "clockOut", "createdAt", "id", "notes" FROM "Shift";
DROP TABLE "Shift";
ALTER TABLE "new_Shift" RENAME TO "Shift";
CREATE INDEX "Shift_chatterId_idx" ON "Shift"("chatterId");
CREATE INDEX "Shift_approvedById_idx" ON "Shift"("approvedById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
