-- Cheetah Time enterprise roadmap: immutable audit trail and PostgreSQL RLS-ready tenant policies.

CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fieldName" TEXT,
  "oldValue" JSONB,
  "newValue" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

CREATE OR REPLACE FUNCTION "denyAuditLogMutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_no_update"
BEFORE UPDATE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "denyAuditLogMutation"();

CREATE TRIGGER "AuditLog_no_delete"
BEFORE DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "denyAuditLogMutation"();

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AuditLog_workspace_isolation" ON "AuditLog"
  USING (
    current_setting('app.workspace_id', true) IS NULL
    OR "workspaceId" = current_setting('app.workspace_id', true)
  );

ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project_workspace_isolation" ON "Project"
  USING (
    current_setting('app.workspace_id', true) IS NULL
    OR "workspaceId" = current_setting('app.workspace_id', true)
  );

ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Task_workspace_isolation" ON "Task"
  USING (
    current_setting('app.workspace_id', true) IS NULL
    OR EXISTS (
      SELECT 1 FROM "Project"
      WHERE "Project"."id" = "Task"."projectId"
      AND "Project"."workspaceId" = current_setting('app.workspace_id', true)
    )
  );

ALTER TABLE "Dependency" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dependency_workspace_isolation" ON "Dependency"
  USING (
    current_setting('app.workspace_id', true) IS NULL
    OR EXISTS (
      SELECT 1 FROM "Project"
      WHERE "Project"."id" = "Dependency"."projectId"
      AND "Project"."workspaceId" = current_setting('app.workspace_id', true)
    )
  );

ALTER TABLE "Resource" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Resource_workspace_isolation" ON "Resource"
  USING (
    current_setting('app.workspace_id', true) IS NULL
    OR EXISTS (
      SELECT 1 FROM "Project"
      WHERE "Project"."id" = "Resource"."projectId"
      AND "Project"."workspaceId" = current_setting('app.workspace_id', true)
    )
  );

ALTER TABLE "Assignment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assignment_workspace_isolation" ON "Assignment"
  USING (
    current_setting('app.workspace_id', true) IS NULL
    OR EXISTS (
      SELECT 1 FROM "Project"
      WHERE "Project"."id" = "Assignment"."projectId"
      AND "Project"."workspaceId" = current_setting('app.workspace_id', true)
    )
  );

ALTER TABLE "Baseline" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Baseline_workspace_isolation" ON "Baseline"
  USING (
    current_setting('app.workspace_id', true) IS NULL
    OR EXISTS (
      SELECT 1 FROM "Project"
      WHERE "Project"."id" = "Baseline"."projectId"
      AND "Project"."workspaceId" = current_setting('app.workspace_id', true)
    )
  );

ALTER TABLE "BaselineTaskSnapshot" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "BaselineTaskSnapshot_workspace_isolation" ON "BaselineTaskSnapshot"
  USING (
    current_setting('app.workspace_id', true) IS NULL
    OR EXISTS (
      SELECT 1 FROM "Baseline"
      JOIN "Project" ON "Project"."id" = "Baseline"."projectId"
      WHERE "Baseline"."id" = "BaselineTaskSnapshot"."baselineId"
      AND "Project"."workspaceId" = current_setting('app.workspace_id', true)
    )
  );

ALTER TABLE "TimesheetEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "TimesheetEntry_workspace_isolation" ON "TimesheetEntry"
  USING (
    current_setting('app.workspace_id', true) IS NULL
    OR EXISTS (
      SELECT 1 FROM "Project"
      WHERE "Project"."id" = "TimesheetEntry"."projectId"
      AND "Project"."workspaceId" = current_setting('app.workspace_id', true)
    )
  );

ALTER TABLE "ActualCostEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ActualCostEntry_workspace_isolation" ON "ActualCostEntry"
  USING (
    current_setting('app.workspace_id', true) IS NULL
    OR EXISTS (
      SELECT 1 FROM "Project"
      WHERE "Project"."id" = "ActualCostEntry"."projectId"
      AND "Project"."workspaceId" = current_setting('app.workspace_id', true)
    )
  );

