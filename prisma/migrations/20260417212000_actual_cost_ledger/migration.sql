-- CreateEnum
CREATE TYPE "ActualCostCategory" AS ENUM (
    'LABOR',
    'MATERIAL',
    'EQUIPMENT',
    'SUBCONTRACT',
    'TRAVEL',
    'OVERHEAD',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "ActualCostSource" AS ENUM ('TIMESHEET', 'MANUAL', 'IMPORT');

-- CreateTable
CREATE TABLE "ActualCostEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "resourceId" TEXT,
    "timesheetEntryId" TEXT,
    "entryDate" DATE NOT NULL,
    "source" "ActualCostSource" NOT NULL DEFAULT 'MANUAL',
    "category" "ActualCostCategory" NOT NULL DEFAULT 'OTHER',
    "vendorName" TEXT,
    "referenceCode" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(12,2),
    "unitCost" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActualCostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActualCostEntry_timesheetEntryId_key" ON "ActualCostEntry"("timesheetEntryId");

-- CreateIndex
CREATE INDEX "ActualCostEntry_projectId_entryDate_idx" ON "ActualCostEntry"("projectId", "entryDate");

-- CreateIndex
CREATE INDEX "ActualCostEntry_taskId_entryDate_idx" ON "ActualCostEntry"("taskId", "entryDate");

-- CreateIndex
CREATE INDEX "ActualCostEntry_resourceId_entryDate_idx" ON "ActualCostEntry"("resourceId", "entryDate");

-- CreateIndex
CREATE INDEX "ActualCostEntry_source_category_idx" ON "ActualCostEntry"("source", "category");

-- AddForeignKey
ALTER TABLE "ActualCostEntry" ADD CONSTRAINT "ActualCostEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualCostEntry" ADD CONSTRAINT "ActualCostEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualCostEntry" ADD CONSTRAINT "ActualCostEntry_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualCostEntry" ADD CONSTRAINT "ActualCostEntry_timesheetEntryId_fkey" FOREIGN KEY ("timesheetEntryId") REFERENCES "TimesheetEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
