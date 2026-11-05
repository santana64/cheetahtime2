-- FGF (lentille délai) : champs auparavant persistés uniquement en mode local.
ALTER TABLE "Project"
  ADD COLUMN "phase" TEXT,
  ADD COLUMN "timeUnit" TEXT,
  ADD COLUMN "b2pDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "b2pNotes" JSONB,
  ADD COLUMN "b2pScenarios" JSONB,
  ADD COLUMN "b2pSnapshots" JSONB,
  ADD COLUMN "t2pTables" JSONB,
  ADD COLUMN "rapportsDelai" JSONB,
  ADD COLUMN "auditTrail" JSONB,
  ADD COLUMN "projectSnapshots" JSONB,
  ADD COLUMN "lockedT2PIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "statusDate" DATE,
  ADD COLUMN "pseudoCriticalCoefficient" DECIMAL(4,2),
  ADD COLUMN "declassedAt" TIMESTAMP(3),
  ADD COLUMN "declassedBy" TEXT;

ALTER TABLE "Task"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "budgetAmount" DECIMAL(14,2),
  ADD COLUMN "durationUnits" DECIMAL(10,3);

ALTER TABLE "Dependency"
  ADD COLUMN "lagUnits" DECIMAL(10,3),
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'LOGIC';

ALTER TABLE "Resource"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "availabilityByMonth" JSONB;

-- Deux liens typés entre les mêmes LT (DD + FF du cas sportif) : la clé d'unicité inclut le type.
DROP INDEX IF EXISTS "Dependency_projectId_predecessorProjectId_predecessorTaskId_key";
CREATE UNIQUE INDEX "Dependency_pair_type_key" ON "Dependency"("projectId", "predecessorProjectId", "predecessorTaskId", "successorProjectId", "successorTaskId", "type");
