import { initialDataStore } from "@/data/demo-projects";
import type { PrismaClient } from "@/generated/prisma/client";
import { $Enums, Prisma } from "@/generated/prisma/client";
import { parseIsoDate, formatIsoDate } from "@/lib/planning/date-utils";
import { buildSchedule } from "@/lib/planning/schedule-engine";
import { getPrismaClient } from "@/lib/prisma";
import type {
  AppDataStore,
  Baseline,
  Dependency,
  ProjectAggregate,
  StoreMetadata,
  Task,
} from "@/types/planning";

const WORKSPACE_STATE_ID = "primary";
const DEFAULT_WORKSPACE_ID = "workspace-cheetah-time";
const DEFAULT_WORKSPACE_SETTINGS_ID = "workspace-cheetah-time-settings";

const projectInclude = {
  calendar: {
    include: {
      exceptions: {
        orderBy: [{ date: "asc" }, { id: "asc" }],
      },
    },
  },
  tasks: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      calendarExceptions: {
        orderBy: [{ date: "asc" }, { id: "asc" }],
      },
    },
  },
  dependencies: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  resources: {
    orderBy: [{ name: "asc" }, { id: "asc" }],
    include: {
      calendarExceptions: {
        orderBy: [{ date: "asc" }, { id: "asc" }],
      },
    },
  },
  assignments: {
    orderBy: [{ id: "asc" }],
  },
  baselines: {
    include: {
      snapshots: {
        orderBy: [{ id: "asc" }],
      },
    },
    orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
  },
  timesheetEntries: {
    orderBy: [{ entryDate: "asc" }, { id: "asc" }],
  },
  actualCostEntries: {
    orderBy: [{ entryDate: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.ProjectInclude;

type PrismaStoreClient = PrismaClient | Prisma.TransactionClient;

async function fetchProjectRows(client: PrismaStoreClient) {
  return client.project.findMany({
    include: projectInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
}

type PrismaProjectAggregate = Awaited<ReturnType<typeof fetchProjectRows>>[number];

function nowIso() {
  return new Date().toISOString();
}

function getScopedPersistenceId(scope: string, id: string) {
  const prefix = `${scope}--`;
  return id.startsWith(prefix) ? id : `${prefix}${id}`;
}

function toIsoTimestamp(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function toIsoDate(value?: Date | null) {
  return value ? formatIsoDate(value) : null;
}

function toDateOnly(value?: string | null) {
  return value ? parseIsoDate(value) : null;
}

function toDecimalNumber(value?: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  if (typeof value === "object" && "toNumber" in value) {
    const toNumber = Reflect.get(value, "toNumber");
    if (typeof toNumber === "function") {
      return Number(toNumber.call(value));
    }
  }

  return Number(value);
}

function sortTasksForPersistence(tasks: Task[]) {
  const byParent = new Map<string | null, Task[]>();
  const taskIds = new Set(tasks.map((task) => task.id));

  for (const task of tasks) {
    const parentId =
      task.parentId && taskIds.has(task.parentId) ? task.parentId : null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(task);
    byParent.set(parentId, siblings);
  }

  for (const siblings of byParent.values()) {
    siblings.sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
    );
  }

  const ordered: Task[] = [];

  function visit(parentId: string | null) {
    for (const task of byParent.get(parentId) ?? []) {
      ordered.push(task);
      visit(task.id);
    }
  }

  visit(null);

  return ordered;
}

function mapProjectAggregate(row: PrismaProjectAggregate): ProjectAggregate {
  if (!row.calendar) {
    throw new Error(`Project ${row.id} is missing its working calendar.`);
  }

  return {
    project: {
      id: row.id,
      workspaceId: row.workspaceId,
      slug: row.slug,
      code: row.code,
      name: row.name,
      origin: row.origin,
      sourceProjectId: row.sourceProjectId,
      clientName: row.clientName,
      description: row.description,
      portfolio: row.portfolio,
      ownerUserId: row.ownerUserId,
      ownerName: row.ownerName,
      sponsorUserId: row.sponsorUserId,
      sponsorName: row.sponsorName,
      status: row.status,
      health: row.health,
      targetStartDate: formatIsoDate(row.targetStartDate),
      targetFinishDate: toIsoDate(row.targetFinishDate),
      budgetAmount: toDecimalNumber(row.budgetAmount) ?? 0,
      currencyCode: row.currencyCode,
      levelingStrategy: row.levelingStrategy,
      levelingMaxDelayDays: row.levelingMaxDelayDays,
      archivedAt: toIsoTimestamp(row.archivedAt),
      archivedBy: row.archivedBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
    calendar: {
      id: row.calendar.id,
      name: row.calendar.name,
      timezone: row.calendar.timezone,
      workingDays: [...row.calendar.workingDays],
      hoursPerDay: row.calendar.hoursPerDay,
      exceptions: row.calendar.exceptions.map((exception) => ({
        id: exception.id,
        date: formatIsoDate(exception.date),
        label: exception.label,
        isWorkingDay: exception.isWorkingDay,
      })),
    },
    tasks: row.tasks.map((task): Task => ({
      id: task.id,
      projectId: task.projectId,
      parentId: task.parentId,
      sortOrder: task.sortOrder,
      name: task.name,
      description: task.description,
      notes: task.notes,
      type: task.type,
      status: task.status,
      priority: task.priority,
      progressPercent: task.progressPercent,
      durationDays: task.durationDays,
      schedulingMode: task.schedulingMode,
      workFormula: task.workFormula,
      effortHours: toDecimalNumber(task.effortHours),
      calendarMode: task.calendarMode,
      calendarWorkingDays: [...task.calendarWorkingDays],
      calendarHoursPerDay: task.calendarHoursPerDay,
      calendarExceptions: task.calendarExceptions.map((exception) => ({
        id: exception.id,
        date: formatIsoDate(exception.date),
        label: exception.label,
        isWorkingDay: exception.isWorkingDay,
      })),
      constraintType: task.constraintType as Task["constraintType"],
      constraintDate: toIsoDate(task.constraintDate),
      deadlineDate: toIsoDate(task.deadlineDate),
      levelingDelayDays: task.levelingDelayDays ?? 0,
      levelingPriority: task.levelingPriority,
      manualStartDate: toIsoDate(task.manualStartDate),
      manualFinishDate: toIsoDate(task.manualFinishDate),
      actualStartDate: toIsoDate(task.actualStartDate),
      actualFinishDate: toIsoDate(task.actualFinishDate),
      actualWorkHours: toDecimalNumber(task.actualWorkHours) ?? 0,
      remainingWorkHours: toDecimalNumber(task.remainingWorkHours) ?? 0,
    })),
    dependencies: row.dependencies.map((dependency) => ({
      id: dependency.id,
      projectId: dependency.projectId,
      predecessorProjectId: dependency.predecessorProjectId,
      predecessorTaskId: dependency.predecessorTaskId,
      successorProjectId: dependency.successorProjectId,
      successorTaskId: dependency.successorTaskId,
      type: dependency.type,
      lagDays: dependency.lagDays,
      label: dependency.label ?? undefined,
      createdAt: dependency.createdAt.toISOString(),
    })),
    resources: row.resources.map((resource) => ({
      id: resource.id,
      projectId: resource.projectId,
      name: resource.name,
      role: resource.role,
      type: resource.type,
      location: resource.location,
      availabilityPct: resource.availabilityPct,
      capacityHoursPerDay: resource.capacityHoursPerDay,
      calendarWorkingDays: [...resource.calendarWorkingDays],
      calendarHoursPerDay: resource.calendarHoursPerDay,
      calendarExceptions: resource.calendarExceptions.map((exception) => ({
        id: exception.id,
        date: formatIsoDate(exception.date),
        label: exception.label,
        isWorkingDay: exception.isWorkingDay,
      })),
      costRate: toDecimalNumber(resource.costRate),
      color: resource.color,
    })),
    assignments: row.assignments.map((assignment) => ({
      id: assignment.id,
      projectId: assignment.projectId,
      taskId: assignment.taskId,
      resourceId: assignment.resourceId,
      allocationPct: assignment.allocationPct,
      notes: assignment.notes ?? undefined,
    })),
    baselines: row.baselines.map((baseline): Baseline => ({
      id: baseline.id,
      projectId: baseline.projectId,
      name: baseline.name,
      description: baseline.description,
      capturedAt: baseline.capturedAt.toISOString(),
      capturedBy: baseline.capturedBy,
      isActive: baseline.isActive,
      snapshots: baseline.snapshots.map((snapshot) => ({
        id: snapshot.id,
        baselineId: snapshot.baselineId,
        taskId: snapshot.taskId,
        name: snapshot.name,
        startDate: toIsoDate(snapshot.startDate),
        finishDate: toIsoDate(snapshot.finishDate),
        durationDays: snapshot.durationDays,
        workHours: toDecimalNumber(snapshot.workHours) ?? 0,
        plannedCost: toDecimalNumber(snapshot.plannedCost) ?? 0,
        progressPercent: snapshot.progressPercent,
        isCritical: snapshot.isCritical,
      })),
    })),
    timesheetEntries: row.timesheetEntries.map((entry) => ({
      id: entry.id,
      projectId: entry.projectId,
      taskId: entry.taskId,
      resourceId: entry.resourceId,
      entryDate: formatIsoDate(entry.entryDate),
      workHours: toDecimalNumber(entry.workHours) ?? 0,
      costAmount: toDecimalNumber(entry.costAmount),
      notes: entry.notes,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    })),
    actualCostEntries: row.actualCostEntries.map((entry) => ({
      id: entry.id,
      projectId: entry.projectId,
      taskId: entry.taskId,
      resourceId: entry.resourceId,
      timesheetEntryId: entry.timesheetEntryId,
      entryDate: formatIsoDate(entry.entryDate),
      source: entry.source,
      category: entry.category,
      vendorName: entry.vendorName,
      referenceCode: entry.referenceCode,
      description: entry.description,
      quantity: toDecimalNumber(entry.quantity),
      unitCost: toDecimalNumber(entry.unitCost),
      amount: toDecimalNumber(entry.amount) ?? 0,
      currencyCode: entry.currencyCode,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    })),
  };
}

function serializeAggregate(aggregate: ProjectAggregate) {
  return JSON.stringify(aggregate);
}

async function syncWorkspaceState(
  client: PrismaStoreClient,
  metadata: StoreMetadata,
) {
  await client.workspaceState.upsert({
    where: { id: WORKSPACE_STATE_ID },
    create: {
      id: WORKSPACE_STATE_ID,
      storeVersion: initialDataStore.version,
      seededFrom: metadata.seededFrom,
      initializedAt: new Date(metadata.initializedAt),
      lastUpdatedAt: new Date(metadata.lastUpdatedAt),
    },
    update: {
      storeVersion: initialDataStore.version,
      seededFrom: metadata.seededFrom,
      initializedAt: new Date(metadata.initializedAt),
      lastUpdatedAt: new Date(metadata.lastUpdatedAt),
    },
  });
}

async function ensureDefaultWorkspace(client: PrismaStoreClient) {
  await client.workspace.upsert({
    where: { id: DEFAULT_WORKSPACE_ID },
    create: {
      id: DEFAULT_WORKSPACE_ID,
      slug: "cheetah-time",
      name: "Cheetah Time",
      defaultCurrencyCode: "EUR",
      timezone: "Europe/Paris",
    },
    update: {
      defaultCurrencyCode: "EUR",
      timezone: "Europe/Paris",
    },
  });

  await client.workspaceSettings.upsert({
    where: { workspaceId: DEFAULT_WORKSPACE_ID },
    create: {
      id: DEFAULT_WORKSPACE_SETTINGS_ID,
      workspaceId: DEFAULT_WORKSPACE_ID,
      defaultCurrencyCode: "EUR",
      timezone: "Europe/Paris",
      fiscalYearStartMonth: 1,
      emailNotifications: false,
      inAppNotifications: true,
      slackNotifications: false,
      attachmentPolicy: "link-or-reference",
    },
    update: {},
  });
}

async function syncProjectAggregate(
  client: PrismaStoreClient,
  aggregate: ProjectAggregate,
) {
  await ensureDefaultWorkspace(client);

  const scheduledTasks = buildSchedule(aggregate).tasksById;
  const orderedTasks = sortTasksForPersistence(aggregate.tasks);
  const calendarId = getScopedPersistenceId(
    aggregate.project.id,
    aggregate.calendar.id,
  );

  await client.project.upsert({
    where: { id: aggregate.project.id },
    create: {
      id: aggregate.project.id,
      workspaceId: aggregate.project.workspaceId ?? DEFAULT_WORKSPACE_ID,
      slug: aggregate.project.slug,
      code: aggregate.project.code,
      name: aggregate.project.name,
      origin: aggregate.project.origin,
      sourceProjectId: aggregate.project.sourceProjectId,
      clientName: aggregate.project.clientName,
      description: aggregate.project.description,
      portfolio: aggregate.project.portfolio,
      ownerUserId: aggregate.project.ownerUserId ?? null,
      ownerName: aggregate.project.ownerName,
      sponsorUserId: aggregate.project.sponsorUserId ?? null,
      sponsorName: aggregate.project.sponsorName,
      status: aggregate.project.status,
      health: aggregate.project.health,
      targetStartDate: parseIsoDate(aggregate.project.targetStartDate),
      targetFinishDate: toDateOnly(aggregate.project.targetFinishDate),
      budgetAmount: aggregate.project.budgetAmount,
      currencyCode: aggregate.project.currencyCode,
      levelingStrategy:
        aggregate.project.levelingStrategy as $Enums.LevelingStrategy,
      levelingMaxDelayDays: aggregate.project.levelingMaxDelayDays,
      archivedAt: aggregate.project.archivedAt
        ? new Date(aggregate.project.archivedAt)
        : null,
      archivedBy: aggregate.project.archivedBy,
      createdAt: new Date(aggregate.project.createdAt),
      updatedAt: new Date(aggregate.project.updatedAt),
    },
    update: {
      slug: aggregate.project.slug,
      code: aggregate.project.code,
      name: aggregate.project.name,
      workspaceId: aggregate.project.workspaceId ?? DEFAULT_WORKSPACE_ID,
      origin: aggregate.project.origin,
      sourceProjectId: aggregate.project.sourceProjectId,
      clientName: aggregate.project.clientName,
      description: aggregate.project.description,
      portfolio: aggregate.project.portfolio,
      ownerUserId: aggregate.project.ownerUserId ?? null,
      ownerName: aggregate.project.ownerName,
      sponsorUserId: aggregate.project.sponsorUserId ?? null,
      sponsorName: aggregate.project.sponsorName,
      status: aggregate.project.status,
      health: aggregate.project.health,
      targetStartDate: parseIsoDate(aggregate.project.targetStartDate),
      targetFinishDate: toDateOnly(aggregate.project.targetFinishDate),
      budgetAmount: aggregate.project.budgetAmount,
      currencyCode: aggregate.project.currencyCode,
      levelingStrategy:
        aggregate.project.levelingStrategy as $Enums.LevelingStrategy,
      levelingMaxDelayDays: aggregate.project.levelingMaxDelayDays,
      archivedAt: aggregate.project.archivedAt
        ? new Date(aggregate.project.archivedAt)
        : null,
      archivedBy: aggregate.project.archivedBy,
    },
  });

  await client.dependency.deleteMany({
    where: { projectId: aggregate.project.id },
  });
  await client.assignment.deleteMany({
    where: { projectId: aggregate.project.id },
  });
  await client.timesheetEntry.deleteMany({
    where: { projectId: aggregate.project.id },
  });
  await client.actualCostEntry.deleteMany({
    where: { projectId: aggregate.project.id },
  });
  await client.baseline.deleteMany({
    where: { projectId: aggregate.project.id },
  });
  await client.task.deleteMany({
    where: { projectId: aggregate.project.id },
  });
  await client.resource.deleteMany({
    where: { projectId: aggregate.project.id },
  });
  await client.projectCalendar.deleteMany({
    where: { projectId: aggregate.project.id },
  });

  await client.projectCalendar.create({
    data: {
      id: calendarId,
      projectId: aggregate.project.id,
      name: aggregate.calendar.name,
      timezone: aggregate.calendar.timezone,
      workingDays: [...aggregate.calendar.workingDays],
      hoursPerDay: aggregate.calendar.hoursPerDay,
      exceptions: aggregate.calendar.exceptions.length
        ? {
            create: aggregate.calendar.exceptions.map((exception) => ({
              id: getScopedPersistenceId(calendarId, exception.id),
              date: parseIsoDate(exception.date),
              label: exception.label,
              isWorkingDay: exception.isWorkingDay,
            })),
          }
        : undefined,
    },
  });

  for (const task of orderedTasks) {
    const scheduled = scheduledTasks[task.id];

    await client.task.create({
      data: {
        id: task.id,
        projectId: task.projectId,
        parentId: task.parentId,
        sortOrder: task.sortOrder,
        name: task.name,
        description: task.description,
        notes: task.notes,
        type: task.type,
        status: task.status,
        priority: task.priority,
        progressPercent: task.progressPercent,
        durationDays: task.durationDays,
        schedulingMode: task.schedulingMode,
        workFormula: task.workFormula,
        effortHours: task.effortHours ?? null,
        calendarMode: task.calendarMode as $Enums.TaskCalendarMode,
        calendarWorkingDays: [...task.calendarWorkingDays],
        calendarHoursPerDay: task.calendarHoursPerDay ?? null,
        constraintType: task.constraintType as $Enums.TaskConstraintType,
        constraintDate: toDateOnly(task.constraintDate),
        deadlineDate: toDateOnly(task.deadlineDate),
        levelingDelayDays: task.levelingDelayDays ?? 0,
        levelingPriority: task.levelingPriority,
        manualStartDate: toDateOnly(task.manualStartDate),
        manualFinishDate: toDateOnly(task.manualFinishDate),
        actualStartDate: toDateOnly(task.actualStartDate),
        actualFinishDate: toDateOnly(task.actualFinishDate),
        actualWorkHours: task.actualWorkHours ?? 0,
        remainingWorkHours: task.remainingWorkHours ?? 0,
        scheduledStartDate: toDateOnly(scheduled?.scheduledStartDate),
        scheduledFinishDate: toDateOnly(scheduled?.scheduledFinishDate),
        earliestStartDate: toDateOnly(scheduled?.earliestStartDate),
        earliestFinishDate: toDateOnly(scheduled?.earliestFinishDate),
        latestStartDate: toDateOnly(scheduled?.latestStartDate),
        latestFinishDate: toDateOnly(scheduled?.latestFinishDate),
        totalSlackDays: scheduled?.totalSlackDays ?? null,
        freeSlackDays: scheduled?.freeSlackDays ?? null,
        isCritical: scheduled?.isCritical ?? false,
        calendarExceptions: task.calendarExceptions.length
          ? {
              create: task.calendarExceptions.map((exception) => ({
                id: getScopedPersistenceId(task.id, exception.id),
                date: parseIsoDate(exception.date),
                label: exception.label,
                isWorkingDay: exception.isWorkingDay,
              })),
            }
          : undefined,
      },
    });
  }

  if (aggregate.dependencies.length) {
    await client.dependency.createMany({
      data: aggregate.dependencies.map((dependency: Dependency) => ({
        id: dependency.id,
        projectId: dependency.projectId,
        predecessorProjectId: dependency.predecessorProjectId,
        predecessorTaskId: dependency.predecessorTaskId,
        successorProjectId: dependency.successorProjectId,
        successorTaskId: dependency.successorTaskId,
        type: dependency.type,
        lagDays: dependency.lagDays,
        label: dependency.label ?? null,
        createdAt: new Date(dependency.createdAt),
      })),
    });
  }

  for (const resource of aggregate.resources) {
    await client.resource.create({
      data: {
        id: resource.id,
        projectId: resource.projectId,
        name: resource.name,
        role: resource.role,
        type: resource.type,
        location: resource.location,
        availabilityPct: resource.availabilityPct,
        capacityHoursPerDay: resource.capacityHoursPerDay,
        calendarWorkingDays: [...resource.calendarWorkingDays],
        calendarHoursPerDay: resource.calendarHoursPerDay ?? null,
        costRate: resource.costRate ?? null,
        color: resource.color,
        calendarExceptions: resource.calendarExceptions.length
          ? {
              create: resource.calendarExceptions.map((exception) => ({
                id: getScopedPersistenceId(resource.id, exception.id),
                date: parseIsoDate(exception.date),
                label: exception.label,
                isWorkingDay: exception.isWorkingDay,
              })),
            }
          : undefined,
      },
    });
  }

  if (aggregate.assignments.length) {
    await client.assignment.createMany({
      data: aggregate.assignments.map((assignment) => ({
        id: assignment.id,
        projectId: assignment.projectId,
        taskId: assignment.taskId,
        resourceId: assignment.resourceId,
        allocationPct: assignment.allocationPct,
        notes: assignment.notes ?? null,
      })),
    });
  }

  for (const baseline of aggregate.baselines) {
    const baselineId = getScopedPersistenceId(aggregate.project.id, baseline.id);
    await client.baseline.create({
      data: {
        id: baselineId,
        projectId: baseline.projectId,
        name: baseline.name,
        description: baseline.description,
        capturedAt: new Date(baseline.capturedAt),
        capturedBy: baseline.capturedBy,
        isActive: baseline.isActive,
        snapshots: baseline.snapshots.length
          ? {
              create: baseline.snapshots.map((snapshot) => ({
                id: getScopedPersistenceId(baselineId, snapshot.id),
                taskId: snapshot.taskId,
                name: snapshot.name,
                startDate: toDateOnly(snapshot.startDate),
                finishDate: toDateOnly(snapshot.finishDate),
                durationDays: snapshot.durationDays,
                workHours: snapshot.workHours,
                plannedCost: snapshot.plannedCost,
                progressPercent: snapshot.progressPercent,
                isCritical: snapshot.isCritical,
              })),
            }
          : undefined,
      },
    });
  }

  if (aggregate.timesheetEntries.length) {
    await client.timesheetEntry.createMany({
      data: aggregate.timesheetEntries.map((entry) => ({
        id: entry.id,
        projectId: entry.projectId,
        taskId: entry.taskId,
        resourceId: entry.resourceId ?? null,
        entryDate: parseIsoDate(entry.entryDate),
        workHours: entry.workHours,
        costAmount: entry.costAmount ?? null,
        notes: entry.notes,
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt),
      })),
    });
  }

  if (aggregate.actualCostEntries.length) {
    await client.actualCostEntry.createMany({
      data: aggregate.actualCostEntries.map((entry) => ({
        id: entry.id,
        projectId: entry.projectId,
        taskId: entry.taskId ?? null,
        resourceId: entry.resourceId ?? null,
        timesheetEntryId: entry.timesheetEntryId ?? null,
        entryDate: parseIsoDate(entry.entryDate),
        source: entry.source,
        category: entry.category,
        vendorName: entry.vendorName ?? null,
        referenceCode: entry.referenceCode ?? null,
        description: entry.description,
        quantity: entry.quantity ?? null,
        unitCost: entry.unitCost ?? null,
        amount: entry.amount,
        currencyCode: entry.currencyCode,
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt),
      })),
    });
  }
}

async function ensurePrismaInitialized(client: PrismaStoreClient) {
  const existingState = await client.workspaceState.findUnique({
    where: { id: WORKSPACE_STATE_ID },
  });

  if (existingState) {
    return existingState;
  }

  const projectCount = await client.project.count();

  if (projectCount === 0) {
    for (const aggregate of initialDataStore.projects) {
      await syncProjectAggregate(client, aggregate);
    }

    await syncWorkspaceState(client, initialDataStore.metadata);

    return client.workspaceState.findUniqueOrThrow({
      where: { id: WORKSPACE_STATE_ID },
    });
  }

  const currentTimestamp = nowIso();
  const metadata: StoreMetadata = {
    seededFrom: "database",
    initializedAt: currentTimestamp,
    lastUpdatedAt: currentTimestamp,
  };

  await syncWorkspaceState(client, metadata);

  return client.workspaceState.findUniqueOrThrow({
    where: { id: WORKSPACE_STATE_ID },
  });
}

async function loadPrismaStore(client: PrismaStoreClient): Promise<AppDataStore> {
  const [workspaceState, projectRows] = await Promise.all([
    client.workspaceState.findUniqueOrThrow({
      where: { id: WORKSPACE_STATE_ID },
    }),
    fetchProjectRows(client),
  ]);

  return {
    version: workspaceState.storeVersion,
    metadata: {
      seededFrom: workspaceState.seededFrom,
      initializedAt: workspaceState.initializedAt.toISOString(),
      lastUpdatedAt: workspaceState.lastUpdatedAt.toISOString(),
    },
    projects: projectRows.map(mapProjectAggregate),
  };
}

async function syncPrismaStore(
  client: PrismaStoreClient,
  original: AppDataStore,
  next: AppDataStore,
) {
  const originalProjects = new Map(
    original.projects.map((aggregate) => [aggregate.project.id, aggregate]),
  );
  const nextProjects = new Map(
    next.projects.map((aggregate) => [aggregate.project.id, aggregate]),
  );

  const deletedProjectIds = [...originalProjects.keys()].filter(
    (projectId) => !nextProjects.has(projectId),
  );

  if (deletedProjectIds.length) {
    await client.project.deleteMany({
      where: {
        id: {
          in: deletedProjectIds,
        },
      },
    });
  }

  for (const aggregate of next.projects) {
    const previous = originalProjects.get(aggregate.project.id);
    if (!previous || serializeAggregate(previous) !== serializeAggregate(aggregate)) {
      await syncProjectAggregate(client, aggregate);
    }
  }
}

export async function readStore() {
  const prisma = getPrismaClient();
  await ensurePrismaInitialized(prisma);
  return loadPrismaStore(prisma);
}

export async function mutateStore(
  mutate: (draft: AppDataStore) => void | Promise<void>,
) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    await ensurePrismaInitialized(tx);
    const original = await loadPrismaStore(tx);
    const draft = structuredClone(original);
    await mutate(draft);

    const lastUpdatedAt = nowIso();
    draft.version = initialDataStore.version;
    draft.metadata.lastUpdatedAt = lastUpdatedAt;

    await syncPrismaStore(tx, original, draft);
    await syncWorkspaceState(tx, draft.metadata);

    return draft;
  });
}
