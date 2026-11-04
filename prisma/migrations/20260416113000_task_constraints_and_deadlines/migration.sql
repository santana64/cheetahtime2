-- Expand task constraint coverage for advanced scheduling control
ALTER TYPE "TaskConstraintType" ADD VALUE IF NOT EXISTS 'START_NO_LATER_THAN';
ALTER TYPE "TaskConstraintType" ADD VALUE IF NOT EXISTS 'FINISH_NO_EARLIER_THAN';
ALTER TYPE "TaskConstraintType" ADD VALUE IF NOT EXISTS 'FINISH_NO_LATER_THAN';
ALTER TYPE "TaskConstraintType" ADD VALUE IF NOT EXISTS 'MUST_START_ON';
ALTER TYPE "TaskConstraintType" ADD VALUE IF NOT EXISTS 'MUST_FINISH_ON';

-- Add persisted deadline support for task-level forecast control
ALTER TABLE "Task"
ADD COLUMN IF NOT EXISTS "deadlineDate" DATE;
