-- CreateTable
CREATE TABLE "ShiftReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "busyness" INTEGER NOT NULL,
    "whatWentWell" TEXT NOT NULL,
    "whatDidntGoWell" TEXT NOT NULL,
    "mmSellingChats" TEXT,
    "revenueCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftReport_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftReport_shiftId_key" ON "ShiftReport"("shiftId");

-- CreateIndex
CREATE INDEX "ShiftReport_createdById_idx" ON "ShiftReport"("createdById");
