-- CreateEnum
CREATE TYPE "TaskCalendarMode" AS ENUM ('PROJECT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LevelingStrategy" AS ENUM ('PRIORITY_THEN_SLACK', 'SLACK_THEN_PRIORITY', 'MIN_DELAY');

-- DropIndex
DROP INDEX "Dependency_projectId_predecessorTaskId_successorTaskId_key";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "levelingMaxDelayDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "levelingStrategy" "LevelingStrategy" NOT NULL DEFAULT 'PRIORITY_THEN_SLACK';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "calendarHoursPerDay" INTEGER,
ADD COLUMN     "calendarMode" "TaskCalendarMode" NOT NULL DEFAULT 'PROJECT',
ADD COLUMN     "calendarWorkingDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "levelingPriority" INTEGER NOT NULL DEFAULT 500;

-- AlterTable
ALTER TABLE "Dependency" ADD COLUMN     "predecessorProjectId" TEXT,
ADD COLUMN     "successorProjectId" TEXT;

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "calendarHoursPerDay" INTEGER,
ADD COLUMN     "calendarWorkingDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- BackfillDependencyProjectIds
UPDATE "Dependency"
SET
  "predecessorProjectId" = "projectId",
  "successorProjectId" = "projectId"
WHERE "predecessorProjectId" IS NULL
   OR "successorProjectId" IS NULL;

-- EnforceDependencyProjectIds
ALTER TABLE "Dependency"
ALTER COLUMN "predecessorProjectId" SET NOT NULL,
ALTER COLUMN "successorProjectId" SET NOT NULL;

-- CreateTable
CREATE TABLE "TaskCalendarException" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "isWorkingDay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TaskCalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceCalendarException" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "isWorkingDay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ResourceCalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "resourceId" TEXT,
    "entryDate" DATE NOT NULL,
    "workHours" DECIMAL(10,2) NOT NULL,
    "costAmount" DECIMAL(12,2),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCalendarException_taskId_date_idx" ON "TaskCalendarException"("taskId", "date");

-- CreateIndex
CREATE INDEX "ResourceCalendarException_resourceId_date_idx" ON "ResourceCalendarException"("resourceId", "date");

-- CreateIndex
CREATE INDEX "TimesheetEntry_projectId_entryDate_idx" ON "TimesheetEntry"("projectId", "entryDate");

-- CreateIndex
CREATE INDEX "TimesheetEntry_taskId_entryDate_idx" ON "TimesheetEntry"("taskId", "entryDate");

-- CreateIndex
CREATE INDEX "TimesheetEntry_resourceId_entryDate_idx" ON "TimesheetEntry"("resourceId", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Dependency_projectId_predecessorProjectId_predecessorTaskId_key" ON "Dependency"("projectId", "predecessorProjectId", "predecessorTaskId", "successorProjectId", "successorTaskId");

-- AddForeignKey
ALTER TABLE "TaskCalendarException" ADD CONSTRAINT "TaskCalendarException_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceCalendarException" ADD CONSTRAINT "ResourceCalendarException_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

