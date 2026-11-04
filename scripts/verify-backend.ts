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

async function main() {
  const isolatedLocalStorePath = path.join(
    process.cwd(),
    ".codex-temp",
    `verify-backend-${Date.now()}-${randomUUID().slice(0, 8)}.json`,
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
  const costBridge = await loadModule<typeof import("../src/services/cost-bridge")>(
    "../src/services/cost-bridge.ts",
  );
  const advancedPlanning = await loadModule<
    typeof import("../src/services/advanced-planning")
  >("../src/services/advanced-planning.ts");
  const smartAlerts = await loadModule<typeof import("../src/services/smart-alerts")>(
    "../src/services/smart-alerts.ts",
  );
  const reportServices = await loadModule<typeof import("../src/services/reports")>(
    "../src/services/reports.ts",
  );
  const btpTemplates = await loadModule<typeof import("../src/services/btp-templates")>(
    "../src/services/btp-templates.ts",
  );
  const xerInterop = await loadModule<typeof import("../src/lib/interop/xer")>(
    "../src/lib/interop/xer.ts",
  );

  const {
    captureBaseline,
    clearProjectLeveling,
    createProject,
    createResource,
    createTask,
    deleteActualCostEntry,
    deleteAssignment,
    deleteDependency,
    deleteProject,
    deleteTask,
    duplicateProject,
    exportProjectData,
    getProjectView,
    importProjectDocument,
    levelProjectResources,
    listProjectViews,
    moveTask,
    saveActualCostEntry,
    saveTimesheetEntry,
    saveAssignment,
    saveDependency,
    saveTask,
    setActiveBaseline,
    setProjectArchived,
    deleteTimesheetEntry,
    updateProjectCalendar,
    updateProjectMetadata,
    updateResource,
  } = projectServices;
  const { getPersistenceInfo } = projectStore;
  const { buildMspdiXml, parseMspdiXml } = interop;
  const { getCheetahProjectBridgeExport } = costBridge;
  const {
    buildAdvancedPlanningSummary,
    buildLookAhead,
    buildPertNetwork,
    buildPortfolioRoadmap,
    simulateWhatIf,
  } = advancedPlanning;
  const { buildSmartAlerts } = smartAlerts;
  const {
    buildExcelXml,
    buildGanttSvg,
    buildSCurveSvg,
    buildSoutenancePdf,
  } = reportServices;
  const { createProjectFromBtpTemplate, listBtpTemplates } = btpTemplates;
  const { parseXerFile } = xerInterop;

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

  const summary = {
    persistence: persistence.label,
    projectLifecycle: false,
    taskLifecycle: false,
    dependencyLifecycle: false,
    crossProjectDependencyLifecycle: false,
    outlineLifecycle: false,
    resourceLifecycle: false,
    baselineLifecycle: false,
    calendarLifecycle: false,
    advancedScheduling: false,
    workModelLifecycle: false,
    resourceLevelingLifecycle: false,
    earnedValueLifecycle: false,
    timesheetLifecycle: false,
    actualCostLedgerLifecycle: false,
    costBridgeLifecycle: false,
    advancedRoadmapLifecycle: false,
    smartAlertsLifecycle: false,
    btpTemplatesLifecycle: false,
    soutenanceExportLifecycle: false,
    xerInteropLifecycle: false,
    interopLifecycle: false,
    exportLifecycle: false,
  };

  try {
    const before = await listProjectViews({ includeArchived: true });
    const timestamp = Date.now();
    const projectName = `Backend Hardening Probe ${timestamp}`;
    const duplicateName = `${projectName} Scenario`;
    const externalProjectName = `${projectName} External`;

    const projectId = await createProject({
      name: projectName,
      clientName: "Codex QA",
      ownerName: "Codex QA",
      sponsorName: "PMO QA",
      portfolio: "Engineering Validation",
      targetStartDate: "2026-04-20",
      targetFinishDate: "2026-05-15",
      budgetAmount: 50000,
      currencyCode: "EUR",
    });

    await updateProjectMetadata({
      projectId,
      name: projectName,
      clientName: "Codex QA",
      ownerName: "Codex QA",
      sponsorName: "PMO QA",
      portfolio: "Engineering Validation",
      description: "Verification project for backend lifecycle checks.",
      status: "ACTIVE",
      health: "WATCH",
      targetStartDate: "2026-04-20",
      targetFinishDate: "2026-05-15",
      budgetAmount: 52000,
      currencyCode: "EUR",
    });
    await updateProjectCalendar({
      projectId,
      name: "Verification Calendar",
      timezone: "Europe/Paris",
      workingDays: [1, 2, 3, 4, 5],
      hoursPerDay: 8,
      levelingStrategy: "SLACK_THEN_PRIORITY",
      levelingMaxDelayDays: 14,
      exceptions: [
        {
          date: "2026-04-21",
          label: "Verification blackout",
          isWorkingDay: false,
        },
      ],
    });
    summary.calendarLifecycle = true;

    let view = await getProjectView(projectId);
    const deliverSummary = view.tasks.find(
      (task) => task.name === "Deliver" && task.isSummary,
    );
    const planningPass = view.tasks.find((task) => task.name === "Planning pass");
    const executionWindow = view.tasks.find(
      (task) => task.name === "Execution window",
    );

    assert(deliverSummary, "Expected delivery summary task in project skeleton.");
    assert(planningPass, "Expected planning pass task in project skeleton.");
    assert(executionWindow, "Expected execution window task in project skeleton.");

    const validationTaskId = await createTask({
      projectId,
      parentId: deliverSummary.id,
      name: "Backend validation task",
      type: "TASK",
    });
    const milestoneTaskId = await createTask({
      projectId,
      parentId: deliverSummary.id,
      name: "Go/no-go checkpoint",
      type: "MILESTONE",
    });
    const calendarDrivenTaskId = await createTask({
      projectId,
      parentId: deliverSummary.id,
      name: "Calendar-driven task",
      type: "TASK",
    });
    const outlineAnchorTaskId = await createTask({
      projectId,
      parentId: deliverSummary.id,
      name: "Outline anchor task",
      type: "TASK",
    });
    const outlineChildTaskId = await createTask({
      projectId,
      parentId: deliverSummary.id,
      name: "Outline child task",
      type: "TASK",
    });
    const removableTaskId = await createTask({
      projectId,
      parentId: deliverSummary.id,
      name: "Disposable verification line",
      type: "TASK",
    });
    const manualConflictTaskId = await createTask({
      projectId,
      parentId: deliverSummary.id,
      name: "Manual conflict task",
      type: "TASK",
    });
    const fixedWorkTaskId = await createTask({
      projectId,
      parentId: deliverSummary.id,
      name: "Fixed work task",
      type: "TASK",
    });
    const fixedUnitsTaskId = await createTask({
      projectId,
      parentId: deliverSummary.id,
      name: "Fixed units task",
      type: "TASK",
    });
    const levelingTaskId = await createTask({
      projectId,
      parentId: deliverSummary.id,
      name: "Leveling candidate task",
      type: "TASK",
    });

    await saveTask({
      projectId,
      taskId: validationTaskId,
      name: "Backend validation task",
      description: "Exercise task, resource, dependency, and baseline flows.",
      notes: "Used only by automated backend verification.",
      parentId: deliverSummary.id,
      sortOrder: 99,
      type: "TASK",
      status: "IN_PROGRESS",
      priority: "HIGH",
      progressPercent: 35,
      durationDays: 4,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 32,
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      manualStartDate: null,
      manualFinishDate: null,
    });
    await saveTask({
      projectId,
      taskId: milestoneTaskId,
      name: "Go/no-go checkpoint",
      description: "Milestone used to verify zero-duration handling.",
      notes: "",
      parentId: deliverSummary.id,
      sortOrder: 100,
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
    await saveTask({
      projectId,
      taskId: calendarDrivenTaskId,
      name: "Calendar-driven task",
      description: "Verifies calendar exceptions, advanced constraints, and deadlines.",
      notes: "Automated verification task.",
      parentId: deliverSummary.id,
      sortOrder: 101,
      type: "TASK",
      status: "NOT_STARTED",
      priority: "HIGH",
      progressPercent: 0,
      durationDays: 2,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 16,
      calendarMode: "CUSTOM",
      calendarWorkingDays: [1, 2, 3, 4, 5],
      calendarHoursPerDay: 6,
      calendarExceptions: [
        {
          date: "2026-04-22",
          label: "Task blackout",
          isWorkingDay: false,
        },
      ],
      levelingPriority: 300,
      constraintType: "MUST_START_ON",
      constraintDate: "2026-04-21",
      deadlineDate: "2026-04-22",
      manualStartDate: null,
      manualFinishDate: null,
    });
    await saveTask({
      projectId,
      taskId: outlineAnchorTaskId,
      name: "Outline anchor task",
      description: "Used to verify indentation and sibling order.",
      notes: "",
      parentId: deliverSummary.id,
      sortOrder: 102,
      type: "TASK",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      progressPercent: 0,
      durationDays: 3,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 24,
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      manualStartDate: null,
      manualFinishDate: null,
    });
    await saveTask({
      projectId,
      taskId: outlineChildTaskId,
      name: "Outline child task",
      description: "Used to verify indentation and sibling order.",
      notes: "",
      parentId: deliverSummary.id,
      sortOrder: 103,
      type: "TASK",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      progressPercent: 0,
      durationDays: 2,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 16,
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      manualStartDate: null,
      manualFinishDate: null,
    });
    await saveTask({
      projectId,
      taskId: manualConflictTaskId,
      name: "Manual conflict task",
      description: "Used to verify manual scheduling conflict warnings.",
      notes: "",
      parentId: deliverSummary.id,
      sortOrder: 105,
      type: "TASK",
      status: "NOT_STARTED",
      priority: "HIGH",
      progressPercent: 0,
      durationDays: 2,
      schedulingMode: "MANUAL",
      workFormula: "FIXED_DURATION",
      effortHours: null,
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      manualStartDate: "2026-04-22",
      manualFinishDate: "2026-04-23",
    });
    await saveTask({
      projectId,
      taskId: fixedWorkTaskId,
      name: "Fixed work task",
      description: "Used to verify fixed work recalculation against resource units.",
      notes: "",
      parentId: deliverSummary.id,
      sortOrder: 106,
      type: "TASK",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      progressPercent: 0,
      durationDays: 2,
      schedulingMode: "AUTO",
      workFormula: "FIXED_WORK",
      effortHours: 16,
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      manualStartDate: null,
      manualFinishDate: null,
    });
    await saveTask({
      projectId,
      taskId: fixedUnitsTaskId,
      name: "Fixed units task",
      description: "Used to verify fixed units recalculation against resource units.",
      notes: "",
      parentId: deliverSummary.id,
      sortOrder: 107,
      type: "TASK",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      progressPercent: 0,
      durationDays: 2,
      schedulingMode: "AUTO",
      workFormula: "FIXED_UNITS",
      effortHours: 20,
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      manualStartDate: null,
      manualFinishDate: null,
    });
    await saveTask({
      projectId,
      taskId: levelingTaskId,
      name: "Leveling candidate task",
      description: "Used to verify persistent resource leveling delay.",
      notes: "",
      parentId: deliverSummary.id,
      sortOrder: 108,
      type: "TASK",
      status: "NOT_STARTED",
      priority: "LOW",
      progressPercent: 0,
      durationDays: 4,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 32,
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      manualStartDate: null,
      manualFinishDate: null,
    });

    view = await getProjectView(projectId);
    const calendarDrivenTask = view.tasks.find(
      (task) => task.id === calendarDrivenTaskId,
    );
    assert(calendarDrivenTask, "Expected calendar-driven task to exist.");
    assert(
      calendarDrivenTask.scheduledStartDate === "2026-04-23",
      "Expected project and task calendar exceptions to push the constrained start to the next working day.",
    );
    assert(
      view.aggregate.project.levelingStrategy === "SLACK_THEN_PRIORITY" &&
        view.aggregate.project.levelingMaxDelayDays === 14,
      "Expected project leveling controls to persist with the calendar update.",
    );
    assert(
      view.schedule.issues.some(
        (issue) =>
          issue.taskId === calendarDrivenTaskId &&
          issue.code === "DEADLINE_MISSED",
      ),
      "Expected deadline-missed signal for constrained task verification.",
    );
    assert(
      view.aggregate.calendar.exceptions.some(
        (exception) => exception.date === "2026-04-21" && !exception.isWorkingDay,
      ),
      "Expected updated project calendar exception to persist.",
    );
    summary.advancedScheduling = true;

    await moveTask({
      projectId,
      taskId: outlineAnchorTaskId,
      direction: "DOWN",
    });
    await moveTask({
      projectId,
      taskId: outlineAnchorTaskId,
      direction: "UP",
    });
    await moveTask({
      projectId,
      taskId: outlineChildTaskId,
      direction: "INDENT",
    });
    view = await getProjectView(projectId);
    const outlinedTask = view.tasks.find((task) => task.id === outlineChildTaskId);
    assert(outlinedTask, "Expected outline child task to exist after indent.");
    assert(
      outlinedTask.parentId === outlineAnchorTaskId,
      "Expected indent operation to move the task under the previous sibling.",
    );
    assert(
      outlinedTask.wbsCode.includes("."),
      "Expected indented task to receive a nested WBS code.",
    );
    await moveTask({
      projectId,
      taskId: outlineChildTaskId,
      direction: "OUTDENT",
    });
    view = await getProjectView(projectId);
    const outdentedTask = view.tasks.find((task) => task.id === outlineChildTaskId);
    assert(outdentedTask, "Expected outline child task to exist after outdent.");
    assert(
      outdentedTask.parentId === deliverSummary.id,
      "Expected outdent operation to restore the task to its parent summary branch.",
    );
    summary.outlineLifecycle = true;

    await deleteTask(projectId, removableTaskId);
    summary.taskLifecycle = true;

    await saveDependency({
      projectId,
      predecessorTaskId: executionWindow.id,
      successorTaskId: validationTaskId,
      type: "FS",
      lagDays: 0,
    });
    await saveDependency({
      projectId,
      predecessorTaskId: validationTaskId,
      successorTaskId: milestoneTaskId,
      type: "FS",
      lagDays: 0,
    });

    let cycleRejected = false;
    try {
      await saveDependency({
        projectId,
        predecessorTaskId: milestoneTaskId,
        successorTaskId: planningPass.id,
        type: "FS",
        lagDays: 0,
      });
    } catch {
      cycleRejected = true;
    }

    assert(cycleRejected, "Expected dependency cycle protection to reject invalid link.");

    view = await getProjectView(projectId);
    const dependencyToDelete = view.aggregate.dependencies.find(
      (dependency) =>
        dependency.predecessorTaskId === executionWindow.id &&
        dependency.successorTaskId === validationTaskId,
    );
    assert(dependencyToDelete, "Expected created dependency to be persisted.");
    await deleteDependency(projectId, dependencyToDelete.id);
    await saveDependency({
      projectId,
      predecessorTaskId: executionWindow.id,
      successorTaskId: validationTaskId,
      type: "FS",
      lagDays: 0,
    });
    await saveDependency({
      projectId,
      predecessorTaskId: executionWindow.id,
      successorTaskId: manualConflictTaskId,
      type: "FS",
      lagDays: 0,
    });
    await saveDependency({
      projectId,
      predecessorTaskId: executionWindow.id,
      successorTaskId: levelingTaskId,
      type: "FS",
      lagDays: 0,
    });
    summary.dependencyLifecycle = true;

    const externalProjectId = await createProject({
      name: externalProjectName,
      clientName: "Codex QA",
      ownerName: "Codex QA",
      sponsorName: "PMO QA",
      portfolio: "Engineering Validation",
      targetStartDate: "2026-04-20",
      targetFinishDate: "2026-05-09",
      budgetAmount: 18000,
      currencyCode: "EUR",
    });
    const externalView = await getProjectView(externalProjectId);
    const externalDeliverSummary = externalView.tasks.find(
      (task) => task.name === "Deliver" && task.isSummary,
    );
    assert(
      externalDeliverSummary,
      "Expected delivery summary task in external verification project.",
    );
    const externalGateTaskId = await createTask({
      projectId: externalProjectId,
      parentId: externalDeliverSummary.id,
      name: "Cross-project gate",
      type: "TASK",
    });
    await saveTask({
      projectId: externalProjectId,
      taskId: externalGateTaskId,
      name: "Cross-project gate",
      description: "Used to verify inter-project dependency propagation.",
      notes: "",
      parentId: externalDeliverSummary.id,
      sortOrder: 120,
      type: "TASK",
      status: "NOT_STARTED",
      priority: "HIGH",
      progressPercent: 0,
      durationDays: 2,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 16,
      constraintType: "MUST_FINISH_ON",
      constraintDate: "2026-05-04",
      deadlineDate: null,
      manualStartDate: null,
      manualFinishDate: null,
    });
    await saveDependency({
      projectId,
      predecessorProjectId: externalProjectId,
      predecessorTaskId: externalGateTaskId,
      successorProjectId: projectId,
      successorTaskId: validationTaskId,
      type: "FS",
      lagDays: 0,
    });
    view = await getProjectView(projectId);
    const crossProjectDependency = view.dependencyNetwork.find(
      (entry) =>
        entry.dependency.predecessorProjectId === externalProjectId &&
        entry.dependency.predecessorTaskId === externalGateTaskId &&
        entry.dependency.successorProjectId === projectId &&
        entry.dependency.successorTaskId === validationTaskId,
    );
    const crossProjectValidationTask = view.tasks.find(
      (task) => task.id === validationTaskId,
    );
    assert(
      crossProjectDependency?.externalToProject,
      "Expected cross-project dependency to appear in the project dependency network.",
    );
    assert(
      crossProjectValidationTask?.scheduledStartDate != null &&
        crossProjectValidationTask.scheduledStartDate >= "2026-05-05",
      "Expected external predecessor logic to push the local successor after the external gate.",
    );
    let crossProjectCycleRejected = false;
    try {
      await saveDependency({
        projectId: externalProjectId,
        predecessorProjectId: projectId,
        predecessorTaskId: milestoneTaskId,
        successorProjectId: externalProjectId,
        successorTaskId: externalGateTaskId,
        type: "FS",
        lagDays: 0,
      });
    } catch {
      crossProjectCycleRejected = true;
    }

    assert(
      crossProjectCycleRejected,
      "Expected portfolio cycle protection to reject an inter-project loop.",
    );

    await deleteProject(externalProjectId, externalProjectName);
    view = await getProjectView(projectId);
    assert(
      !view.dependencyNetwork.some(
        (entry) =>
          entry.dependency.predecessorProjectId === externalProjectId ||
          entry.dependency.successorProjectId === externalProjectId,
      ),
      "Expected deleting an external project to clean up inter-project dependency links.",
    );
    summary.crossProjectDependencyLifecycle = true;

    const resourceId = await createResource({
      projectId,
      name: "Cheetah Planner",
      role: "Planning Lead",
      type: "PERSON",
      location: "Paris",
      availabilityPct: 100,
      capacityHoursPerDay: 8,
      costRate: 950,
      color: "#0f766e",
    });
    await updateResource({
      projectId,
      resourceId,
      name: "Cheetah Planner",
      role: "Planning Lead",
      type: "PERSON",
      location: "Paris",
      availabilityPct: 90,
      capacityHoursPerDay: 8,
      costRate: 975,
      color: "#0f766e",
    });
    const fixedUnitsResourceId = await createResource({
      projectId,
      name: "Cheetah Analyst",
      role: "Planning Analyst",
      type: "PERSON",
      location: "Paris",
      availabilityPct: 100,
      capacityHoursPerDay: 8,
      costRate: 820,
      color: "#1d4ed8",
    });

    await saveAssignment({
      projectId,
      taskId: validationTaskId,
      resourceId,
      allocationPct: 90,
      notes: "Primary owner for verification work.",
    });
    await saveAssignment({
      projectId,
      taskId: levelingTaskId,
      resourceId,
      allocationPct: 80,
      notes: "Used to force an over-allocation that leveling must resolve.",
    });
    view = await getProjectView(projectId);
    const validationTask = view.tasks.find((task) => task.id === validationTaskId);
    const manualConflictTask = view.tasks.find((task) => task.id === manualConflictTaskId);
    assert(validationTask, "Expected validation task to exist after assignment.");
    assert(
      validationTask.durationDays === 4,
      "Expected fixed duration task to preserve duration after assignment changes.",
    );
    assert(
      validationTask.effortHours === 25.92,
      "Expected fixed duration task effort to recalculate from capacity.",
    );
    assert(manualConflictTask, "Expected manual conflict task to exist.");
    assert(
      manualConflictTask.scheduledStartDate === "2026-04-22" &&
        manualConflictTask.scheduledFinishDate === "2026-04-23",
      "Expected manual scheduling to preserve entered dates.",
    );
    assert(
      view.schedule.issues.some(
        (issue) =>
          issue.taskId === manualConflictTaskId &&
          issue.code === "MANUAL_CONFLICT",
      ),
      "Expected manual scheduling conflict to be surfaced against the dependency network.",
    );
    assert(
      view.metrics.overloadedResourceCount > 0,
      "Expected verification assignments to create an overload before leveling.",
    );
    const assignment = view.aggregate.assignments.find(
      (entry) =>
        entry.taskId === validationTaskId && entry.resourceId === resourceId,
    );
    assert(assignment, "Expected assignment to be persisted.");
    await deleteAssignment(projectId, assignment.id);
    await saveAssignment({
      projectId,
      taskId: validationTaskId,
      resourceId,
      allocationPct: 90,
      notes: "Primary owner for verification work.",
    });

    await saveAssignment({
      projectId,
      taskId: fixedWorkTaskId,
      resourceId,
      allocationPct: 50,
      notes: "Fixed work verification assignment.",
    });
    view = await getProjectView(projectId);
    let fixedWorkTask = view.tasks.find((task) => task.id === fixedWorkTaskId);
    assert(fixedWorkTask, "Expected fixed work task to exist.");
    assert(
      fixedWorkTask.durationDays === 5,
      "Expected fixed work duration to expand when units are reduced.",
    );
    assert(
      fixedWorkTask.effortHours === 16,
      "Expected fixed work task to preserve planned work hours.",
    );
    await saveAssignment({
      projectId,
      taskId: fixedWorkTaskId,
      resourceId,
      allocationPct: 100,
      notes: "Fixed work verification assignment.",
    });
    view = await getProjectView(projectId);
    fixedWorkTask = view.tasks.find((task) => task.id === fixedWorkTaskId);
    assert(fixedWorkTask, "Expected fixed work task to exist after assignment update.");
    assert(
      fixedWorkTask.durationDays === 3,
      "Expected fixed work duration to contract when capacity increases.",
    );

    await saveAssignment({
      projectId,
      taskId: fixedUnitsTaskId,
      resourceId: fixedUnitsResourceId,
      allocationPct: 50,
      notes: "Fixed units verification assignment.",
    });
    view = await getProjectView(projectId);
    let fixedUnitsTask = view.tasks.find((task) => task.id === fixedUnitsTaskId);
    assert(fixedUnitsTask, "Expected fixed units task to exist.");
    assert(
      fixedUnitsTask.durationDays === 5,
      "Expected fixed units duration to expand from the current assignment units.",
    );
    assert(
      fixedUnitsTask.effortHours === 20,
      "Expected fixed units task to preserve planned work hours.",
    );
    await saveAssignment({
      projectId,
      taskId: fixedUnitsTaskId,
      resourceId: fixedUnitsResourceId,
      allocationPct: 100,
      notes: "Fixed units verification assignment.",
    });
    view = await getProjectView(projectId);
    fixedUnitsTask = view.tasks.find((task) => task.id === fixedUnitsTaskId);
    assert(fixedUnitsTask, "Expected fixed units task to exist after assignment update.");
    assert(
      fixedUnitsTask.durationDays === 3,
      "Expected fixed units duration to contract as assignment units rise.",
    );

    await levelProjectResources(projectId);
    view = await getProjectView(projectId);
    const leveledTask = view.tasks.find((task) => task.id === levelingTaskId);
    assert(leveledTask, "Expected leveling candidate task to exist.");
    assert(
      (leveledTask.levelingDelayDays ?? 0) > 0,
      "Expected resource leveling to persist a working-day delay on the candidate task.",
    );
    assert(
      view.metrics.leveledTaskCount > 0 && view.metrics.totalLevelingDelayDays > 0,
      "Expected dashboard metrics to reflect applied resource leveling.",
    );
    await clearProjectLeveling(projectId);
    view = await getProjectView(projectId);
    const clearedLevelingTask = view.tasks.find((task) => task.id === levelingTaskId);
    assert(clearedLevelingTask, "Expected leveling candidate task after clearing delay.");
    assert(
      (clearedLevelingTask.levelingDelayDays ?? 0) === 0,
      "Expected clearing leveling to remove persisted delay from the task.",
    );

    summary.workModelLifecycle = true;
    summary.resourceLifecycle = true;
    summary.resourceLevelingLifecycle = true;

    await captureBaseline(projectId, "Verification Baseline A", "Codex QA");
    await saveTask({
      projectId,
      taskId: validationTaskId,
      name: "Backend validation task",
      description: "Exercise task, resource, dependency, and baseline flows.",
      notes: "Verification task after first baseline capture.",
      parentId: deliverSummary.id,
      sortOrder: 99,
      type: "TASK",
      status: "IN_PROGRESS",
      priority: "HIGH",
      progressPercent: 50,
      durationDays: 5,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 32.4,
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      manualStartDate: null,
      manualFinishDate: null,
      actualStartDate: "2026-04-24",
      actualFinishDate: null,
      actualWorkHours: 18,
      remainingWorkHours: 14.4,
    });
    await captureBaseline(projectId, "Verification Baseline B", "Codex QA");
    view = await getProjectView(projectId);
    const firstBaseline = view.aggregate.baselines.find(
      (baseline) => baseline.name === "Verification Baseline A",
    );
    assert(firstBaseline, "Expected first baseline to exist.");
    await setActiveBaseline(projectId, firstBaseline.id);
    view = await getProjectView(projectId);
    assert(
      view.activeBaseline?.id === firstBaseline.id,
      "Expected selected baseline to become active.",
    );
    const baselineSnapshot = view.activeBaseline?.snapshots.find(
      (snapshot) => snapshot.taskId === validationTaskId,
    );
    assert(baselineSnapshot, "Expected baseline snapshot for validation task.");
    assert(
      baselineSnapshot.workHours > 0 && baselineSnapshot.plannedCost > 0,
      "Expected baseline snapshots to freeze work and cost data.",
    );
    const baselineVariance = view.baselineVarianceByTaskId[validationTaskId];
    assert(
      typeof baselineVariance?.workVarianceHours === "number" &&
        typeof baselineVariance?.costVariance === "number",
      "Expected baseline variance to include work and cost delta.",
    );
    assert(
      view.metrics.totalActualWorkHours > 0 &&
        view.metrics.totalRemainingWorkHours > 0 &&
        view.metrics.totalActualCost > 0,
      "Expected task actuals to feed project-level work and cost metrics.",
    );
    assert(
      view.metrics.plannedValue != null &&
        view.metrics.earnedValue != null &&
        view.metrics.costPerformanceIndex != null,
      "Expected active baselines and task actuals to unlock earned value metrics.",
    );
    if ((view.metrics.plannedValue ?? 0) > 0) {
      assert(
        view.metrics.schedulePerformanceIndex != null,
        "Expected SPI once planned value is time-phased above zero.",
      );
    }
    assert(
      typeof baselineVariance?.plannedValue === "number" &&
        typeof baselineVariance?.earnedValue === "number" &&
        typeof baselineVariance?.actualCost === "number",
      "Expected task-level baseline variance to include earned value fields.",
    );
    summary.baselineLifecycle = true;
    summary.earnedValueLifecycle = true;

    await saveTimesheetEntry({
      projectId,
      entryId: `${projectId}-ts-1`,
      taskId: validationTaskId,
      resourceId,
      entryDate: "2026-04-24",
      workHours: 6,
      notes: "Verified production support tranche.",
    });
    await saveTimesheetEntry({
      projectId,
      entryId: `${projectId}-ts-2`,
      taskId: validationTaskId,
      resourceId,
      entryDate: "2026-04-25",
      workHours: 4,
      notes: "Verified production support tranche.",
    });
    view = await getProjectView(projectId);
    const timeTrackedTask = view.tasks.find((task) => task.id === validationTaskId);
    assert(timeTrackedTask, "Expected validation task after logging actuals.");
    assert(
      timeTrackedTask.actualWorkHours === 10,
      "Expected timesheet entries to override task actual work in the live project view.",
    );
    assert(
      view.resourceSummaries.some(
        (summary) =>
          summary.resource.id === resourceId &&
          summary.totalActualHours >= 10 &&
          summary.totalActualCost > 0,
      ),
      "Expected resource summaries to include logged timesheet actuals.",
    );
    await deleteTimesheetEntry(projectId, `${projectId}-ts-1`);
    view = await getProjectView(projectId);
    const reducedTimeTrackedTask = view.tasks.find(
      (task) => task.id === validationTaskId,
    );
    assert(reducedTimeTrackedTask, "Expected validation task after deleting a timesheet entry.");
    assert(
      reducedTimeTrackedTask.actualWorkHours === 4,
      "Expected deleting a timesheet entry to reduce the tracked actual work in the live view.",
    );
    summary.timesheetLifecycle = true;

    await saveActualCostEntry({
      projectId,
      taskId: validationTaskId,
      resourceId,
      entryDate: "2026-04-26",
      category: "TRAVEL",
      vendorName: "Rail Europe",
      referenceCode: "TRV-001",
      description: "On-site PMO review travel",
      quantity: 1,
      unitCost: 420,
      amount: null,
      currencyCode: "EUR",
    });
    await saveActualCostEntry({
      projectId,
      taskId: null,
      resourceId: null,
      entryDate: "2026-04-27",
      category: "SUBCONTRACT",
      vendorName: "PMO Advisory",
      referenceCode: "SUB-001",
      description: "Independent assurance checkpoint",
      quantity: 1,
      unitCost: 1800,
      amount: null,
      currencyCode: "EUR",
    });
    view = await getProjectView(projectId);
    const travelCostEntry = view.aggregate.actualCostEntries.find(
      (entry) =>
        entry.referenceCode === "TRV-001" &&
        entry.category === "TRAVEL" &&
        entry.taskId === validationTaskId,
    );
    assert(travelCostEntry, "Expected manual travel cost entry to be persisted.");
    assert(
      view.metrics.totalNonLaborActualCost >= 2220 &&
        view.metrics.actualCostEntryCount >= 3,
      "Expected manual actual cost ledger entries to feed non-labor cost metrics.",
    );
    await deleteActualCostEntry(projectId, travelCostEntry.id);
    view = await getProjectView(projectId);
    assert(
      !view.aggregate.actualCostEntries.some((entry) => entry.id === travelCostEntry.id),
      "Expected deleting a manual actual cost entry to remove it from the project ledger.",
    );
    summary.actualCostLedgerLifecycle = true;

    const exported = await exportProjectData(projectId);
    assert(exported.project.id === projectId, "Expected export to include project payload.");
    assert(exported.schedule.issues.length >= 0, "Expected schedule payload in export.");
    assert(exported.persistence.label.length > 0, "Expected export persistence metadata.");
    assert(
      typeof exported.metrics.totalPlannedCost === "number" &&
        typeof exported.metrics.totalPlannedWorkHours === "number",
      "Expected export metrics to include cost and work rollups.",
    );
    assert(
      typeof exported.metrics.totalActualCost === "number" &&
        typeof exported.metrics.earnedValue === "number",
      "Expected export metrics to include actual burn and earned value data.",
    );
    const bridgeExport = await getCheetahProjectBridgeExport(projectId);
    assert(
      bridgeExport.projectId === projectId &&
        bridgeExport.workspaceId === exported.project.workspaceId,
      "Expected Cost bridge export to keep the shared project and workspace identifiers.",
    );
    assert(
      bridgeExport.wbs.length > 0 &&
        bridgeExport.flatTasks.some((task) => task.taskId === validationTaskId),
      "Expected Cost bridge export to include the WBS tree and flat task lookup.",
    );
    assert(
      bridgeExport.baseline?.id === view.activeBaseline?.id &&
        typeof bridgeExport.costImpact.totalCostImpact === "number",
      "Expected Cost bridge export to expose baseline and cost-impact payloads.",
    );
    assert(
      Array.isArray(bridgeExport.signals),
      "Expected Cost bridge export to include active variance signals.",
    );
    summary.costBridgeLifecycle = true;

    const advancedSummary = buildAdvancedPlanningSummary(view);
    assert(
      advancedSummary.earnedSchedule &&
        advancedSummary.monteCarlo.iterations > 0 &&
        advancedSummary.trends.length > 0,
      "Expected advanced planning summary to expose ES, Monte Carlo and trend data.",
    );
    assert(
      buildLookAhead(view, 4).every((entry) => entry.task.id),
      "Expected look-ahead tasks to keep task references.",
    );
    assert(
      buildPertNetwork(view).nodes.length === view.tasks.length,
      "Expected PERT network to include every scheduled task.",
    );
    const whatIf = simulateWhatIf(view, {
      shiftTask: { taskId: validationTaskId, days: 2 },
    });
    assert(
      whatIf.changedTaskIds.includes(validationTaskId),
      "Expected what-if simulation to report changed task ids.",
    );
    const portfolioRoadmap = await buildPortfolioRoadmap(exported.project.workspaceId);
    assert(
      portfolioRoadmap.projects.some((entry) => entry.project.id === projectId),
      "Expected portfolio roadmap to include the active verification project.",
    );
    summary.advancedRoadmapLifecycle = true;

    const alerts = buildSmartAlerts(view);
    assert(Array.isArray(alerts), "Expected smart alert builder to return an alert array.");
    summary.smartAlertsLifecycle = true;

    assert(
      buildSCurveSvg(view).includes("<svg") &&
        buildGanttSvg(view).includes("<svg") &&
        buildExcelXml(view).includes("Worksheet") &&
        buildSoutenancePdf(view).byteLength > 500,
      "Expected soutenance and enriched exports to render concrete payloads.",
    );
    summary.soutenanceExportLifecycle = true;

    const btpTemplate = listBtpTemplates()[0];
    assert(btpTemplate, "Expected built-in BTP templates to be available.");
    const btpProjectName = `${projectName} BTP Template`;
    const btpProjectId = await createProjectFromBtpTemplate({
      workspaceId: exported.project.workspaceId,
      templateId: btpTemplate.id,
      name: btpProjectName,
      targetStartDate: "2026-06-01",
      ownerName: "Codex QA",
      sponsorName: "PMO QA",
      clientName: "Codex BTP",
    });
    const btpView = await getProjectView(btpProjectId);
    assert(
      btpView.aggregate.baselines.length === 1 &&
        btpView.aggregate.resources.length > 0 &&
        btpView.aggregate.dependencies.length > 0,
      "Expected BTP template projects to preload baseline, resources and dependencies.",
    );
    await deleteProject(btpProjectId, btpView.aggregate.project.name);
    summary.btpTemplatesLifecycle = true;

    const exportedXml = buildMspdiXml({
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
    const parsedDocument = parseMspdiXml(exportedXml, "mspdi");
    assert(
      parsedDocument.tasks.length >= exported.tasks.length,
      "Expected exported MSPDI document to preserve the task network.",
    );
    assert(
      parsedDocument.actualCostEntries.length === exported.actualCostEntries.length,
      "Expected exported MSPDI document to preserve actual cost ledger entries.",
    );
    const imported = await importProjectDocument(parsedDocument, "Codex QA");
    const importedView = await getProjectView(imported.projectId);
    assert(
      importedView.aggregate.tasks.length >= view.aggregate.tasks.length,
      "Expected importing the MSPDI document to recreate the task structure.",
    );
    assert(
      importedView.aggregate.resources.length === view.aggregate.resources.length,
      "Expected importing the MSPDI document to recreate the resource roster.",
    );
    assert(
      importedView.aggregate.actualCostEntries.length === view.aggregate.actualCostEntries.length,
      "Expected importing the MSPDI document to recreate actual cost ledger entries.",
    );
    assert(
      importedView.aggregate.baselines.length === view.aggregate.baselines.length,
      "Expected importing the MSPDI document to recreate baseline history.",
    );
    await deleteProject(imported.projectId, importedView.aggregate.project.name);
    summary.interopLifecycle = true;
    summary.exportLifecycle = true;

    const xerDocument = parseXerFile(
      [
        "%T\tPROJECT",
        "%F\tproj_id\tproj_short_name\tplan_start_date\tscd_end_date",
        "%R\t1\tQA Primavera XER\t2026-06-01 08:00\t2026-06-20 17:00",
        "%T\tTASK",
        "%F\ttask_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt\ttarget_start_date\ttarget_end_date\tphys_complete_pct",
        "%R\t10\tA100\tTerrassement\tTT_Task\t80\t2026-06-01 08:00\t2026-06-12 17:00\t10",
        "%R\t20\tA200\tFondations\tTT_Task\t64\t\t\t0",
        "%T\tTASKPRED",
        "%F\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
        "%R\t20\t10\tPR_FS\t0",
        "%T\tRSRC",
        "%F\trsrc_id\trsrc_name\trsrc_type\tprice_per_unit",
        "%R\tR1\tEquipe VRD\tRT_Labor\t55",
        "%T\tTASKRSRC",
        "%F\ttaskrsrc_id\ttask_id\trsrc_id",
        "%R\tTR1\t10\tR1",
      ].join("\n"),
    );
    assert(
      xerDocument.sourceFormat === "xer" &&
        xerDocument.tasks.length === 2 &&
        xerDocument.dependencies.length === 1,
      "Expected XER parser to map Primavera tasks and dependencies.",
    );
    const importedXer = await importProjectDocument(xerDocument, "Codex QA");
    const importedXerView = await getProjectView(importedXer.projectId);
    assert(
      importedXerView.aggregate.resources.length === 1,
      "Expected importing XER document to recreate resources.",
    );
    await deleteProject(importedXer.projectId, importedXerView.aggregate.project.name);
    summary.xerInteropLifecycle = true;

    const duplicatedProjectId = await duplicateProject({
      projectId,
      name: duplicateName,
      duplicatedBy: "Codex QA",
    });
    await setProjectArchived(duplicatedProjectId, true, "Codex QA");
    await setProjectArchived(duplicatedProjectId, false, "Codex QA");
    summary.projectLifecycle = true;

    await deleteProject(duplicatedProjectId, duplicateName);
    await deleteProject(projectId, projectName);

    const after = await listProjectViews({ includeArchived: true });
    assert(
      before.length === after.length,
      "Backend verification should restore project counts after cleanup.",
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          persistence,
          checks: summary,
          projectCountBefore: before.length,
          projectCountAfter: after.length,
        },
        null,
        2,
      ),
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
