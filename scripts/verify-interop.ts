import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadModule<T>(modulePath: string): Promise<T> {
  const loaded = await import(modulePath);
  return ("default" in loaded ? loaded.default : loaded) as T;
}

async function fetchOfficialMppSample() {
  const response = await fetch(
    "https://raw.githubusercontent.com/joniles/mpxj-python-samples/main/example.mpp",
  );
  if (!response.ok) {
    throw new Error(
      `Unable to download the official MPXJ sample MPP file: ${response.status} ${response.statusText}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const isolatedLocalStorePath = path.join(
    process.cwd(),
    ".codex-temp",
    `verify-interop-${Date.now()}-${randomUUID().slice(0, 8)}.json`,
  );
  process.env["CHEETAH_TIME_LOCAL_STORE_PATH"] =
    process.env["CHEETAH_TIME_LOCAL_STORE_PATH"] || isolatedLocalStorePath;

  const projectServices = await loadModule<typeof import("../src/services/projects")>(
    "../src/services/projects.ts",
  );
  const projectStore = await loadModule<
    typeof import("../src/services/project-store")
  >("../src/services/project-store.ts");
  const interop = await loadModule<typeof import("../src/lib/interop/mspdi")>(
    "../src/lib/interop/mspdi.ts",
  );
  const bridge = await loadModule<typeof import("../src/lib/interop/mpp-bridge")>(
    "../src/lib/interop/mpp-bridge.ts",
  );

  const {
    captureBaseline,
    createProject,
    createResource,
    createTask,
    deleteProject,
    exportProjectData,
    getProjectView,
    importProjectDocument,
    listProjectViews,
    saveActualCostEntry,
    saveAssignment,
    saveTask,
    saveTimesheetEntry,
  } = projectServices;
  const { getPersistenceInfo } = projectStore;
  const { buildMspdiXml, parseMspdiXml } = interop;
  const { convertProjectFileToMspdiXml, supportsNativeMppExport } = bridge;

  const persistence = getPersistenceInfo();
  const localStorePath =
    process.env["CHEETAH_TIME_LOCAL_STORE_PATH"]?.trim()
      ? path.join(
          process.cwd(),
          "data",
          path.basename(process.env["CHEETAH_TIME_LOCAL_STORE_PATH"]),
        )
      : path.join(process.cwd(), "data", "cheetah-time.local.json");
  let originalLocalStore: string | null = null;
  let localStoreExists = false;

  if (persistence.mode === "local") {
    try {
      originalLocalStore = await readFile(localStorePath, "utf8");
      localStoreExists = true;
    } catch {
      originalLocalStore = null;
      localStoreExists = false;
    }
  }

  try {
    const before = await listProjectViews({ includeArchived: true });
    const projectName = `Interop Verification ${Date.now()}`;
    const projectId = await createProject({
      name: projectName,
      clientName: "Interop QA",
      ownerName: "Interop QA",
      sponsorName: "Interop QA",
      portfolio: "Interop Verification",
      targetStartDate: "2026-04-20",
      targetFinishDate: "2026-05-06",
      budgetAmount: 25000,
      currencyCode: "EUR",
    });

    let importedProjectId: string | null = null;

    try {
      let view = await getProjectView(projectId);
      const deliverSummary = view.tasks.find(
        (task) => task.name === "Deliver" && task.isSummary,
      );
      assert(deliverSummary, "Expected default delivery summary in interop verification project.");

      const taskId = await createTask({
        projectId,
        parentId: deliverSummary.id,
        name: "Interop execution task",
        type: "TASK",
      });
      const milestoneId = await createTask({
        projectId,
        parentId: deliverSummary.id,
        name: "Interop sign-off",
        type: "MILESTONE",
      });
      const resourceId = await createResource({
        projectId,
        name: "Interop Planner",
        role: "Planner",
        type: "PERSON",
        location: "Paris",
        availabilityPct: 100,
        capacityHoursPerDay: 8,
        costRate: 900,
        color: "#0f766e",
      });

      await saveTask({
        projectId,
        taskId,
        name: "Interop execution task",
        description: "Used to verify serious project file interchange.",
        notes: "Interop verification task.",
        parentId: deliverSummary.id,
        sortOrder: 50,
        type: "TASK",
        status: "IN_PROGRESS",
        priority: "HIGH",
        progressPercent: 40,
        durationDays: 4,
        schedulingMode: "AUTO",
        workFormula: "FIXED_DURATION",
        effortHours: 32,
        constraintType: "ASAP",
        constraintDate: null,
        deadlineDate: "2026-04-30",
        manualStartDate: null,
        manualFinishDate: null,
        actualStartDate: "2026-04-22",
        actualFinishDate: null,
        actualWorkHours: 12,
        remainingWorkHours: 20,
      });
      await saveTask({
        projectId,
        taskId: milestoneId,
        name: "Interop sign-off",
        description: "Used to verify milestone round-trip.",
        notes: "",
        parentId: deliverSummary.id,
        sortOrder: 51,
        type: "MILESTONE",
        status: "NOT_STARTED",
        priority: "HIGH",
        progressPercent: 0,
        durationDays: 0,
        schedulingMode: "AUTO",
        workFormula: "FIXED_DURATION",
        effortHours: 0,
        constraintType: "ASAP",
        constraintDate: null,
        deadlineDate: null,
        manualStartDate: null,
        manualFinishDate: null,
      });
      await saveAssignment({
        projectId,
        taskId,
        resourceId,
        allocationPct: 100,
        notes: "Interop resource assignment.",
      });
      await saveTimesheetEntry({
        projectId,
        taskId,
        resourceId,
        entryDate: "2026-04-22",
        workHours: 6,
        notes: "Imported actual effort probe.",
      });
      await saveActualCostEntry({
        projectId,
        taskId,
        resourceId,
        entryDate: "2026-04-23",
        category: "TRAVEL",
        vendorName: "Rail Europe",
        referenceCode: "INT-TRAVEL-01",
        description: "Client-site review travel",
        quantity: 1,
        unitCost: 280,
        amount: null,
        currencyCode: "EUR",
      });
      await captureBaseline(projectId, "Interop Baseline", "Interop QA");

      view = await getProjectView(projectId);
      const exported = await exportProjectData(projectId);
      const xml = buildMspdiXml({
        product: exported.product,
        exportedAt: exported.exportedAt,
        dataModelVersion: exported.dataModelVersion,
        project: exported.project,
        calendar: exported.calendar,
        scheduledTasks: exported.scheduledTasks,
        dependencies: exported.dependencies,
        resources: exported.resources,
        assignments: exported.assignments,
        timesheetEntries: exported.timesheetEntries,
        actualCostEntries: exported.actualCostEntries,
        baselines: exported.baselines,
      });
      const parsedDocument = parseMspdiXml(xml, "mspdi");
      importedProjectId = (await importProjectDocument(parsedDocument, "Interop QA")).projectId;
      const importedView = await getProjectView(importedProjectId);

      assert(
        importedView.aggregate.tasks.length >= view.aggregate.tasks.length,
        "Expected MSPDI import to reconstruct the task structure.",
      );
      assert(
        importedView.aggregate.resources.length === view.aggregate.resources.length,
        "Expected MSPDI import to reconstruct the resource roster.",
      );
      assert(
        importedView.aggregate.assignments.length === view.aggregate.assignments.length,
        "Expected MSPDI import to reconstruct assignments.",
      );
      assert(
        importedView.aggregate.baselines.length === view.aggregate.baselines.length,
        "Expected MSPDI import to reconstruct baseline history.",
      );
      assert(
        importedView.aggregate.timesheetEntries.length === view.aggregate.timesheetEntries.length,
        "Expected MSPDI import to reconstruct timesheet actuals.",
      );
      assert(
        importedView.aggregate.actualCostEntries.length === view.aggregate.actualCostEntries.length,
        "Expected MSPDI import to reconstruct actual cost ledger entries.",
      );

      const officialMpp = await fetchOfficialMppSample();
      const importedXml = await convertProjectFileToMspdiXml("official-sample.mpp", officialMpp);
      const importedMppDocument = parseMspdiXml(importedXml, "mpp");

      assert(
        importedMppDocument.tasks.length > 0,
        "Expected the official MPP sample to yield executable tasks through the MPP bridge.",
      );
      assert(
        importedMppDocument.resources.length > 0,
        "Expected the official MPP sample to yield resources through the MPP bridge.",
      );

      const after = await listProjectViews({ includeArchived: true });
      assert(
        after.length === before.length + 2,
        "Expected interop verification to materialize exactly the source and imported projects before cleanup.",
      );

      console.log(
        JSON.stringify(
          {
            ok: true,
            persistence: persistence.label,
            checks: {
              mspdiRoundTrip: true,
              mppImport: true,
              mppNativeExportSupported: supportsNativeMppExport(),
            },
            importedMppSample: {
              taskCount: importedMppDocument.tasks.length,
              resourceCount: importedMppDocument.resources.length,
              warningCount: importedMppDocument.warnings.length,
            },
            importedProjectId,
          },
          null,
          2,
        ),
      );
    } finally {
      if (importedProjectId) {
        const importedView = await getProjectView(importedProjectId).catch(() => null);
        if (importedView) {
          await deleteProject(importedProjectId, importedView.aggregate.project.name);
        }
      }
      await deleteProject(projectId, projectName).catch(() => undefined);
    }

    const afterCleanup = await listProjectViews({ includeArchived: true });
    assert(
      afterCleanup.length === before.length,
      "Interop verification should restore project counts after cleanup.",
    );
  } finally {
    if (persistence.mode === "local") {
      if (localStoreExists && originalLocalStore !== null) {
        await writeFile(localStorePath, originalLocalStore, "utf8");
      } else {
        await rm(localStorePath, { force: true });
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
