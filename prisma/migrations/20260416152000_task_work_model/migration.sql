-- CreateEnum
CREATE TYPE "TaskSchedulingMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "TaskWorkFormula" AS ENUM (
    'FIXED_DURATION',
    'FIXED_UNITS',
    'FIXED_WORK'
);

-- AlterTable
ALTER TABLE "Task"
ADD COLUMN "schedulingMode" "TaskSchedulingMode" NOT NULL DEFAULT 'AUTO',
ADD COLUMN "workFormula" "TaskWorkFormula" NOT NULL DEFAULT 'FIXED_DURATION',
ADD COLUMN "effortHours" DECIMAL(10,2),
ADD COLUMN "manualStartDate" DATE,
ADD COLUMN "manualFinishDate" DATE;
