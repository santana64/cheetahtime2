import { XMLBuilder, XMLParser } from "fast-xml-parser";

import type {
  ActualCostEntry,
  Assignment,
  Baseline,
  CalendarException,
  Dependency,
  Project,
  ProjectCalendar,
  Resource,
  ScheduledTask,
  TimesheetEntry,
} from "@/types/planning";

export interface MspdiExportPayload {
  product: string;
  exportedAt: string;
  dataModelVersion: number;
  project: Project;
  calendar: ProjectCalendar;
  scheduledTasks: ScheduledTask[];
  dependencies: Dependency[];
  resources: Resource[];
  assignments: Assignment[];
  timesheetEntries: TimesheetEntry[];
  actualCostEntries: ActualCostEntry[];
  baselines: Baseline[];
}

export type ImportedProjectSourceFormat = "mspdi" | "mpp" | "xer";

export interface ImportedProjectDocument {
  sourceFormat: ImportedProjectSourceFormat;
  project: {
    name: string;
    code: string;
    clientName: string;
    ownerName: string;
    sponsorName: string;
    portfolio: string;
    description: string;
    status: Project["status"];
    health: Project["health"];
    targetStartDate: string;
    targetFinishDate?: string | null;
    budgetAmount: number;
    currencyCode: string;
    levelingStrategy: Project["levelingStrategy"];
    levelingMaxDelayDays: number;
  };
  calendar: {
    name: string;
    timezone: string;
    workingDays: number[];
    hoursPerDay: number;
    exceptions: CalendarException[];
  };
  tasks: Array<{
    uid: string;
    parentUid?: string | null;
    sortOrder: number;
    name: string;
    description: string;
    notes: string;
    type: ScheduledTask["type"];
    status: ScheduledTask["status"];
    priority: ScheduledTask["priority"];
    progressPercent: number;
    durationDays: number;
    schedulingMode: ScheduledTask["schedulingMode"];
    workFormula: ScheduledTask["workFormula"];
    effortHours: number | null;
    calendarMode: ScheduledTask["calendarMode"];
    calendarWorkingDays: number[];
    calendarHoursPerDay: number | null;
    calendarExceptions: CalendarException[];
    constraintType: ScheduledTask["constraintType"];
    constraintDate?: string | null;
    deadlineDate?: string | null;
    levelingDelayDays: number;
    levelingPriority: number;
    manualStartDate?: string | null;
    manualFinishDate?: string | null;
    actualStartDate?: string | null;
    actualFinishDate?: string | null;
    actualWorkHours: number;
    remainingWorkHours: number;
  }>;
  dependencies: Array<{
    predecessorProjectId: string;
    predecessorTaskUid: string;
    successorProjectId: string;
    successorTaskUid: string;
    type: Dependency["type"];
    lagDays: number;
    label?: string;
  }>;
  resources: Array<{
    uid: string;
    name: string;
    role: string;
    type: Resource["type"];
    location: string;
    availabilityPct: number;
    capacityHoursPerDay: number;
    calendarWorkingDays: number[];
    calendarHoursPerDay: number | null;
    calendarExceptions: CalendarException[];
    costRate: number | null;
    color: string;
  }>;
  assignments: Array<{
    uid: string;
    taskUid: string;
    resourceUid: string;
    allocationPct: number;
    notes?: string;
  }>;
  timesheetEntries: TimesheetEntry[];
  actualCostEntries: ActualCostEntry[];
  baselines: Array<{
    name: string;
    description: string;
    capturedAt: string;
    capturedBy: string;
    isActive: boolean;
    snapshots: Array<{
      taskUid: string;
      name: string;
      startDate?: string | null;
      finishDate?: string | null;
      durationDays: number;
      workHours: number;
      plannedCost: number;
      progressPercent: number;
      isCritical: boolean;
    }>;
  }>;
  warnings: string[];
}

const taskPriorityToNumber: Record<ScheduledTask["priority"], number> = {
  LOW: 300,
  MEDIUM: 500,
  HIGH: 700,
  URGENT: 900,
};

const dependencyTypeToNumber: Record<Dependency["type"], number> = {
  FS: 1,
  SS: 2,
  FF: 3,
  SF: 4,
};

const dependencyTypeFromNumber = new Map<number, Dependency["type"]>([
  [1, "FS"],
  [2, "SS"],
  [3, "FF"],
  [4, "SF"],
]);

const constraintTypeToNumber: Record<ScheduledTask["constraintType"], number> = {
  ASAP: 0,
  MUST_START_ON: 2,
  MUST_FINISH_ON: 3,
  START_NO_EARLIER_THAN: 4,
  START_NO_LATER_THAN: 5,
  FINISH_NO_EARLIER_THAN: 6,
  FINISH_NO_LATER_THAN: 7,
};

const constraintTypeFromNumber = new Map<number, ScheduledTask["constraintType"]>([
  [0, "ASAP"],
  [2, "MUST_START_ON"],
  [3, "MUST_FINISH_ON"],
  [4, "START_NO_EARLIER_THAN"],
  [5, "START_NO_LATER_THAN"],
  [6, "FINISH_NO_EARLIER_THAN"],
  [7, "FINISH_NO_LATER_THAN"],
]);

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseFlag(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function toIsoDate(value: unknown) {
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function toTimestamp(value: string | null | undefined, mode: "start" | "finish" = "start") {
  if (!value) {
    return undefined;
  }

  return `${value}T${mode === "finish" ? "17:00:00" : "08:00:00"}`;
}

function toDuration(hours: number) {
  const minutes = Math.max(Math.round(hours * 60), 0);
  const wholeHours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `PT${wholeHours}H${remainingMinutes}M0S`;
}

function parseDurationHours(value: unknown) {
  const match = String(value ?? "").match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i,
  );
  if (!match) {
    return 0;
  }

  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return days * 24 + hours + minutes / 60 + seconds / 3600;
}

function parseRate(value: unknown) {
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function buildWeekDays(workingDays: number[], hoursPerDay: number) {
  return {
    WeekDay: Array.from({ length: 7 }, (_, index) => {
      const dayType = index + 1;
      const working = workingDays.includes(dayType);

      return {
        DayType: dayType,
        DayWorking: working ? 1 : 0,
        ...(working
          ? {
              WorkingTimes: {
                WorkingTime: {
                  FromTime: "08:00:00",
                  ToTime: `${String(8 + Math.max(Math.min(hoursPerDay, 12), 1)).padStart(2, "0")}:00:00`,
                },
              },
            }
          : {}),
      };
    }),
  };
}

function buildExceptions(exceptions: CalendarException[]) {
  if (!exceptions.length) {
    return undefined;
  }

  return {
    Exception: exceptions.map((exception) => ({
      Name: exception.label,
      Working: exception.isWorkingDay ? 1 : 0,
      TimePeriod: {
        FromDate: toTimestamp(exception.date, "start"),
        ToDate: toTimestamp(exception.date, "finish"),
      },
    })),
  };
}

function parseCalendarExceptions(node: unknown): CalendarException[] {
  return toArray((node as { Exception?: unknown })?.Exception).map((entry, index) => {
    const record = entry as Record<string, unknown>;
    const period = record.TimePeriod as Record<string, unknown> | undefined;

    return {
      id: `import-calendar-ex-${index + 1}`,
      date:
        toIsoDate(record.FromDate) ??
        toIsoDate(period?.FromDate) ??
        toIsoDate(record.ToDate) ??
        toIsoDate(period?.ToDate) ??
        "1970-01-01",
      label: String(record.Name ?? `Exception ${index + 1}`),
      isWorkingDay: parseFlag(record.Working),
    };
  });
}

export function buildMspdiXml(payload: MspdiExportPayload) {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    suppressEmptyNode: true,
  });
  const minutesPerDay = Math.max(payload.calendar.hoursPerDay, 1) * 60;
  const activeBaseline = payload.baselines.find((baseline) => baseline.isActive);
  const taskUidById = new Map<string, number>();
  const resourceUidById = new Map<string, number>();
  const calendarUidByKey = new Map<string, number>([[`project:${payload.calendar.id}`, 1]]);
  let nextCalendarUid = 100;

  for (const task of payload.scheduledTasks) {
    taskUidById.set(task.id, taskUidById.size + 1);
    if (task.calendarMode === "CUSTOM") {
      calendarUidByKey.set(`task:${task.id}`, nextCalendarUid);
      nextCalendarUid += 1;
    }
  }

  for (const resource of payload.resources) {
    resourceUidById.set(resource.id, resourceUidById.size + 1);
    if (resource.calendarWorkingDays.length || resource.calendarHoursPerDay || resource.calendarExceptions.length) {
      calendarUidByKey.set(`resource:${resource.id}`, nextCalendarUid);
      nextCalendarUid += 1;
    }
  }

  const calendars = [
    {
      UID: 1,
      Name: payload.calendar.name,
      IsBaseCalendar: 0,
      BaseCalendarUID: -1,
      WeekDays: buildWeekDays(payload.calendar.workingDays, payload.calendar.hoursPerDay),
      ...(payload.calendar.exceptions.length
        ? { Exceptions: buildExceptions(payload.calendar.exceptions) }
        : {}),
    },
    ...payload.scheduledTasks
      .filter((task) => task.calendarMode === "CUSTOM")
      .map((task) => ({
        UID: calendarUidByKey.get(`task:${task.id}`)!,
        Name: `${task.name} Calendar`,
        IsBaseCalendar: 0,
        BaseCalendarUID: -1,
        WeekDays: buildWeekDays(
          task.calendarWorkingDays.length
            ? task.calendarWorkingDays
            : payload.calendar.workingDays,
          task.calendarHoursPerDay ?? payload.calendar.hoursPerDay,
        ),
        ...(task.calendarExceptions.length
          ? { Exceptions: buildExceptions(task.calendarExceptions) }
          : {}),
      })),
    ...payload.resources
      .filter(
        (resource) =>
          resource.calendarWorkingDays.length ||
          resource.calendarHoursPerDay ||
          resource.calendarExceptions.length,
      )
      .map((resource) => ({
        UID: calendarUidByKey.get(`resource:${resource.id}`)!,
        Name: `${resource.name} Calendar`,
        IsBaseCalendar: 0,
        BaseCalendarUID: -1,
        WeekDays: buildWeekDays(
          resource.calendarWorkingDays.length
            ? resource.calendarWorkingDays
            : payload.calendar.workingDays,
          resource.calendarHoursPerDay ?? resource.capacityHoursPerDay,
        ),
        ...(resource.calendarExceptions.length
          ? { Exceptions: buildExceptions(resource.calendarExceptions) }
          : {}),
      })),
  ];

  const dependenciesBySuccessor = new Map<string, Dependency[]>();
  for (const dependency of payload.dependencies) {
    const entries = dependenciesBySuccessor.get(dependency.successorTaskId) ?? [];
    entries.push(dependency);
    dependenciesBySuccessor.set(dependency.successorTaskId, entries);
  }

  const xml = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    Project: {
      "@_xmlns": "http://schemas.microsoft.com/project",
      SaveVersion: 16,
      Name: payload.project.name,
      Title: payload.project.code,
      Company: payload.project.clientName,
      Manager: payload.project.ownerName,
      CurrencyCode: payload.project.currencyCode,
      StartDate: toTimestamp(payload.project.targetStartDate, "start"),
      FinishDate: toTimestamp(payload.project.targetFinishDate ?? null, "finish"),
      MinutesPerDay: minutesPerDay,
      CalendarUID: 1,
      Calendars: { Calendar: calendars },
      Tasks: {
        Task: payload.scheduledTasks.map((task, index) => {
          const localPredecessors = (dependenciesBySuccessor.get(task.id) ?? []).filter(
            (dependency) =>
              dependency.predecessorProjectId === payload.project.id &&
              dependency.successorProjectId === payload.project.id,
          );
          const baseline = activeBaseline?.snapshots.find((snapshot) => snapshot.taskId === task.id);

          return {
            UID: taskUidById.get(task.id)!,
            ID: index + 1,
            Name: task.name,
            WBS: task.wbsCode,
            OutlineNumber: task.wbsCode,
            OutlineLevel: task.depth + 1,
            Summary: task.isSummary ? 1 : 0,
            Milestone: task.type === "MILESTONE" ? 1 : 0,
            Manual: task.schedulingMode === "MANUAL" ? 1 : 0,
            Start: toTimestamp(task.scheduledStartDate ?? null, "start"),
            Finish: toTimestamp(task.scheduledFinishDate ?? null, "finish"),
            Duration: toDuration((task.durationDays || 0) * payload.calendar.hoursPerDay),
            Work: toDuration(task.effortHours ?? 0),
            ActualWork: toDuration(task.actualWorkHours ?? 0),
            RemainingWork: toDuration(task.remainingWorkHours ?? 0),
            PercentComplete: task.progressPercent,
            Priority: taskPriorityToNumber[task.priority],
            Notes: task.notes || task.description || undefined,
            ConstraintType: constraintTypeToNumber[task.constraintType],
            ConstraintDate: toTimestamp(task.constraintDate ?? null, "start"),
            Deadline: toTimestamp(task.deadlineDate ?? null, "finish"),
            ManualStart: toTimestamp(task.manualStartDate ?? null, "start"),
            ManualFinish: toTimestamp(task.manualFinishDate ?? null, "finish"),
            ActualStart: toTimestamp(task.actualStartDate ?? null, "start"),
            ActualFinish: toTimestamp(task.actualFinishDate ?? null, "finish"),
            CalendarUID:
              task.calendarMode === "CUSTOM"
                ? calendarUidByKey.get(`task:${task.id}`)
                : 1,
            LevelingDelay: (task.levelingDelayDays ?? 0) * minutesPerDay * 10,
            ...(localPredecessors.length
              ? {
                  PredecessorLink: localPredecessors.map((dependency) => ({
                    PredecessorUID: taskUidById.get(dependency.predecessorTaskId),
                    Type: dependencyTypeToNumber[dependency.type],
                    LinkLag: dependency.lagDays * minutesPerDay * 10,
                  })),
                }
              : {}),
            ...(baseline
              ? {
                  Baseline: {
                    Number: 0,
                    Start: toTimestamp(baseline.startDate ?? null, "start"),
                    Finish: toTimestamp(baseline.finishDate ?? null, "finish"),
                    Duration: toDuration(baseline.workHours || baseline.durationDays * payload.calendar.hoursPerDay),
                    Work: toDuration(baseline.workHours),
                    Cost: baseline.plannedCost,
                  },
                }
              : {}),
          };
        }),
      },
      Resources: {
        Resource: payload.resources.map((resource, index) => ({
          UID: resourceUidById.get(resource.id)!,
          ID: index + 1,
          Name: resource.name,
          Type: 1,
          MaxUnits: roundNumber(resource.availabilityPct / 100),
          Group: resource.role,
          Notes: resource.location || undefined,
          StandardRate: resource.costRate != null ? `${roundNumber(resource.costRate)}/h` : undefined,
          CalendarUID: calendarUidByKey.get(`resource:${resource.id}`) ?? 1,
        })),
      },
      Assignments: {
        Assignment: payload.assignments.map((assignment, index) => {
          const task = payload.scheduledTasks.find((entry) => entry.id === assignment.taskId);
          const actualCost = payload.actualCostEntries
            .filter(
              (entry) =>
                entry.taskId === assignment.taskId &&
                (entry.resourceId == null || entry.resourceId === assignment.resourceId),
            )
            .reduce((total, entry) => total + entry.amount, 0);

          return {
            UID: index + 1,
            TaskUID: taskUidById.get(assignment.taskId),
            ResourceUID: resourceUidById.get(assignment.resourceId),
            Units: roundNumber(assignment.allocationPct / 100),
            Work: toDuration(((task?.effortHours ?? 0) * assignment.allocationPct) / 100),
            ActualCost: actualCost || undefined,
            Notes: assignment.notes ?? undefined,
          };
        }),
      },
      CheetahTime: {
        Product: payload.product,
        ExportedAt: payload.exportedAt,
        DataModelVersion: payload.dataModelVersion,
        Project: {
          Portfolio: payload.project.portfolio,
          Description: payload.project.description,
          Status: payload.project.status,
          Health: payload.project.health,
          SponsorName: payload.project.sponsorName,
          LevelingStrategy: payload.project.levelingStrategy,
          LevelingMaxDelayDays: payload.project.levelingMaxDelayDays,
          BudgetAmount: payload.project.budgetAmount,
          Origin: payload.project.origin,
          SourceProjectId: payload.project.sourceProjectId ?? "",
        },
        TaskExtensions: {
          Task: payload.scheduledTasks.map((task) => ({
            TaskUID: taskUidById.get(task.id)!,
            TaskId: task.id,
            ProjectId: task.projectId,
            Status: task.status,
            PriorityLabel: task.priority,
            Description: task.description,
            Notes: task.notes,
            WorkFormula: task.workFormula,
            SchedulingMode: task.schedulingMode,
            CalendarMode: task.calendarMode,
            LevelingPriority: task.levelingPriority,
            LevelingDelayDays: task.levelingDelayDays ?? 0,
            DurationDays: task.durationDays,
            EffortHours: task.effortHours ?? 0,
            ActualWorkHours: task.actualWorkHours ?? 0,
            RemainingWorkHours: task.remainingWorkHours ?? 0,
            ParentTaskId: task.parentId ?? "",
          })),
        },
        ResourceExtensions: {
          Resource: payload.resources.map((resource) => ({
            ResourceUID: resourceUidById.get(resource.id)!,
            ResourceId: resource.id,
            Type: resource.type,
            Role: resource.role,
            Location: resource.location,
            Color: resource.color,
          })),
        },
        Dependencies: {
          Dependency: payload.dependencies.map((dependency) => ({
            DependencyId: dependency.id,
            ProjectId: dependency.projectId,
            PredecessorProjectId: dependency.predecessorProjectId,
            PredecessorTaskId: dependency.predecessorTaskId,
            SuccessorProjectId: dependency.successorProjectId,
            SuccessorTaskId: dependency.successorTaskId,
            PredecessorUID: taskUidById.get(dependency.predecessorTaskId) ?? "",
            SuccessorUID: taskUidById.get(dependency.successorTaskId) ?? "",
            Type: dependency.type,
            LagDays: dependency.lagDays,
            Label: dependency.label ?? "",
          })),
        },
        TimesheetEntries: {
          Entry: payload.timesheetEntries.map((entry) => ({
            EntryId: entry.id,
            TaskUID: taskUidById.get(entry.taskId) ?? "",
            TaskId: entry.taskId,
            ResourceUID: entry.resourceId ? (resourceUidById.get(entry.resourceId) ?? "") : "",
            ResourceId: entry.resourceId ?? "",
            EntryDate: entry.entryDate,
            WorkHours: entry.workHours,
            CostAmount: entry.costAmount ?? "",
            Notes: entry.notes,
            CreatedAt: entry.createdAt,
            UpdatedAt: entry.updatedAt,
          })),
        },
        ActualCostEntries: {
          Entry: payload.actualCostEntries.map((entry) => ({
            EntryId: entry.id,
            TaskUID: entry.taskId ? (taskUidById.get(entry.taskId) ?? "") : "",
            TaskId: entry.taskId ?? "",
            ResourceUID:
              entry.resourceId ? (resourceUidById.get(entry.resourceId) ?? "") : "",
            ResourceId: entry.resourceId ?? "",
            TimesheetEntryId: entry.timesheetEntryId ?? "",
            EntryDate: entry.entryDate,
            Source: entry.source,
            Category: entry.category,
            VendorName: entry.vendorName ?? "",
            ReferenceCode: entry.referenceCode ?? "",
            Description: entry.description,
            Quantity: entry.quantity ?? "",
            UnitCost: entry.unitCost ?? "",
            Amount: entry.amount,
            CurrencyCode: entry.currencyCode,
            CreatedAt: entry.createdAt,
            UpdatedAt: entry.updatedAt,
          })),
        },
        Baselines: {
          Baseline: payload.baselines.map((baseline) => ({
            Name: baseline.name,
            Description: baseline.description,
            CapturedAt: baseline.capturedAt,
            CapturedBy: baseline.capturedBy,
            IsActive: baseline.isActive ? 1 : 0,
            Snapshots: {
              Snapshot: baseline.snapshots.map((snapshot) => ({
                TaskUID: taskUidById.get(snapshot.taskId) ?? "",
                TaskId: snapshot.taskId,
                Name: snapshot.name,
                StartDate: snapshot.startDate ?? "",
                FinishDate: snapshot.finishDate ?? "",
                DurationDays: snapshot.durationDays,
                WorkHours: snapshot.workHours,
                PlannedCost: snapshot.plannedCost,
                ProgressPercent: snapshot.progressPercent,
                IsCritical: snapshot.isCritical ? 1 : 0,
              })),
            },
          })),
        },
      },
    },
  };

  return builder.build(xml);
}

export function parseMspdiXml(
  xml: string,
  sourceFormat: ImportedProjectSourceFormat = "mspdi",
): ImportedProjectDocument {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const projectNode = (parsed.Project ?? parsed.project) as Record<string, unknown> | undefined;

  if (!projectNode) {
    throw new Error("The supplied file is not a valid Microsoft Project XML document.");
  }

  const warnings: string[] = [];
  const cheetahRoot = (projectNode.CheetahTime ?? {}) as Record<string, unknown>;
  const cheetahProject = (cheetahRoot.Project ?? {}) as Record<string, unknown>;
  const minutesPerDay = parseNumber(projectNode.MinutesPerDay) ?? 480;
  const hoursPerDay = Math.max(Math.round(minutesPerDay / 60), 1);
  const calendarNodes = toArray((projectNode.Calendars as { Calendar?: unknown })?.Calendar);
  const calendarMap = new Map<
    string,
    { workingDays: number[]; hoursPerDay: number; exceptions: CalendarException[]; name: string }
  >();

  for (const calendarNode of calendarNodes) {
    const record = calendarNode as Record<string, unknown>;
    const weekDays = toArray((record.WeekDays as { WeekDay?: unknown })?.WeekDay);
    const workingDays = weekDays
      .map((entry) => entry as Record<string, unknown>)
      .filter((entry) => parseFlag(entry.DayWorking))
      .map((entry) => Math.round(parseNumber(entry.DayType) ?? 0))
      .filter((entry) => entry >= 1 && entry <= 7);
    calendarMap.set(String(record.UID ?? ""), {
      name: String(record.Name ?? "Imported Calendar"),
      workingDays: workingDays.length ? workingDays : [1, 2, 3, 4, 5],
      hoursPerDay,
      exceptions: parseCalendarExceptions(record.Exceptions),
    });
  }

  const projectCalendar =
    calendarMap.get(String(projectNode.CalendarUID ?? "")) ??
    calendarMap.values().next().value ?? {
      name: "Imported Calendar",
      workingDays: [1, 2, 3, 4, 5],
      hoursPerDay,
      exceptions: [],
    };

  const taskExtensions = new Map<string, Record<string, unknown>>();
  for (const taskExtension of toArray((cheetahRoot.TaskExtensions as { Task?: unknown })?.Task)) {
    const record = taskExtension as Record<string, unknown>;
    taskExtensions.set(String(record.TaskUID ?? ""), record);
  }

  const resourceExtensions = new Map<string, Record<string, unknown>>();
  for (const resourceExtension of toArray((cheetahRoot.ResourceExtensions as { Resource?: unknown })?.Resource)) {
    const record = resourceExtension as Record<string, unknown>;
    resourceExtensions.set(String(record.ResourceUID ?? ""), record);
  }

  const taskNodes = toArray((projectNode.Tasks as { Task?: unknown })?.Task).map(
    (entry) => entry as Record<string, unknown>,
  );
  const tasks: ImportedProjectDocument["tasks"] = [];
  const parentStack = new Map<number, string>();

  for (const [index, taskNode] of taskNodes.entries()) {
    const uid = String(taskNode.UID ?? "");
    if (!uid) {
      continue;
    }

    const extension = taskExtensions.get(uid);
    const outlineLevel = Math.max(Math.round(parseNumber(taskNode.OutlineLevel) ?? 1), 1);
    const parentUid = outlineLevel > 1 ? parentStack.get(outlineLevel - 1) ?? null : null;
    for (const level of [...parentStack.keys()]) {
      if (level >= outlineLevel) {
        parentStack.delete(level);
      }
    }
    parentStack.set(outlineLevel, uid);

    const calendar = calendarMap.get(String(taskNode.CalendarUID ?? "")) ?? projectCalendar;
    const schedulingMode =
      parseFlag(taskNode.Manual) ||
      String(extension?.SchedulingMode ?? "").toUpperCase() === "MANUAL"
        ? "MANUAL"
        : "AUTO";
    const effortHours = roundNumber(parseDurationHours(taskNode.Work));
    const actualWorkHours =
      roundNumber(parseDurationHours(taskNode.ActualWork)) ||
      roundNumber(parseNumber(extension?.ActualWorkHours) ?? 0);
    const remainingWorkHours =
      roundNumber(parseDurationHours(taskNode.RemainingWork)) ||
      roundNumber(parseNumber(extension?.RemainingWorkHours) ?? Math.max(effortHours - actualWorkHours, 0));
    const priorityNumber = parseNumber(taskNode.Priority) ?? 500;

    tasks.push({
      uid,
      parentUid,
      sortOrder: index,
      name: String(taskNode.Name ?? `Imported Task ${index + 1}`),
      description: String(extension?.Description ?? ""),
      notes: String(extension?.Notes ?? taskNode.Notes ?? ""),
      type: parseFlag(taskNode.Milestone)
        ? "MILESTONE"
        : parseFlag(taskNode.Summary)
          ? "SUMMARY"
          : "TASK",
      status:
        String(extension?.Status ?? "").toUpperCase() === "BLOCKED"
          ? "BLOCKED"
          : actualWorkHours > 0 || parseFlag(taskNode.ActualStart)
            ? remainingWorkHours <= 0 || parseFlag(taskNode.ActualFinish) || (parseNumber(taskNode.PercentComplete) ?? 0) >= 100
              ? "DONE"
              : "IN_PROGRESS"
            : "NOT_STARTED",
      priority:
        String(extension?.PriorityLabel ?? "").toUpperCase() === "LOW"
          ? "LOW"
          : String(extension?.PriorityLabel ?? "").toUpperCase() === "HIGH"
            ? "HIGH"
            : String(extension?.PriorityLabel ?? "").toUpperCase() === "URGENT"
              ? "URGENT"
              : priorityNumber <= 350
                ? "LOW"
                : priorityNumber >= 850
                  ? "URGENT"
                  : priorityNumber >= 650
                    ? "HIGH"
                    : "MEDIUM",
      progressPercent: Math.max(Math.min(Math.round(parseNumber(taskNode.PercentComplete) ?? 0), 100), 0),
      durationDays:
        parseNumber(extension?.DurationDays) != null
          ? Math.max(Math.round(parseNumber(extension?.DurationDays) ?? 0), parseFlag(taskNode.Milestone) ? 0 : 1)
          : parseFlag(taskNode.Milestone)
            ? 0
            : Math.max(Math.round(parseDurationHours(taskNode.Duration) / calendar.hoursPerDay) || 1, 1),
      schedulingMode,
      workFormula:
        String(extension?.WorkFormula ?? "").toUpperCase() === "FIXED_WORK"
          ? "FIXED_WORK"
          : String(extension?.WorkFormula ?? "").toUpperCase() === "FIXED_UNITS"
            ? "FIXED_UNITS"
            : "FIXED_DURATION",
      effortHours: effortHours || parseNumber(extension?.EffortHours),
      calendarMode:
        String(taskNode.CalendarUID ?? "") && String(taskNode.CalendarUID ?? "") !== String(projectNode.CalendarUID ?? "")
          ? "CUSTOM"
          : "PROJECT",
      calendarWorkingDays:
        String(taskNode.CalendarUID ?? "") && String(taskNode.CalendarUID ?? "") !== String(projectNode.CalendarUID ?? "")
          ? [...calendar.workingDays]
          : [],
      calendarHoursPerDay:
        String(taskNode.CalendarUID ?? "") && String(taskNode.CalendarUID ?? "") !== String(projectNode.CalendarUID ?? "")
          ? calendar.hoursPerDay
          : null,
      calendarExceptions:
        String(taskNode.CalendarUID ?? "") && String(taskNode.CalendarUID ?? "") !== String(projectNode.CalendarUID ?? "")
          ? [...calendar.exceptions]
          : [],
      constraintType:
        constraintTypeFromNumber.get(Math.round(parseNumber(taskNode.ConstraintType) ?? 0)) ?? "ASAP",
      constraintDate: toIsoDate(taskNode.ConstraintDate),
      deadlineDate: toIsoDate(taskNode.Deadline),
      levelingDelayDays: Math.round(parseNumber(extension?.LevelingDelayDays) ?? ((parseNumber(taskNode.LevelingDelay) ?? 0) / (minutesPerDay * 10))),
      levelingPriority: Math.round(parseNumber(extension?.LevelingPriority) ?? 500),
      manualStartDate: toIsoDate(taskNode.ManualStart),
      manualFinishDate: toIsoDate(taskNode.ManualFinish),
      actualStartDate: toIsoDate(taskNode.ActualStart),
      actualFinishDate: toIsoDate(taskNode.ActualFinish),
      actualWorkHours,
      remainingWorkHours,
    });
  }

  const dependencies: ImportedProjectDocument["dependencies"] = [];
  const dependencyExtensions = toArray((cheetahRoot.Dependencies as { Dependency?: unknown })?.Dependency);
  if (dependencyExtensions.length) {
    for (const dependencyNode of dependencyExtensions) {
      const record = dependencyNode as Record<string, unknown>;
      if (
        String(record.PredecessorProjectId ?? "imported-project") !== "imported-project" ||
        String(record.SuccessorProjectId ?? "imported-project") !== "imported-project"
      ) {
        warnings.push(
          `Skipped external dependency ${String(record.PredecessorTaskId ?? "")} -> ${String(record.SuccessorTaskId ?? "")}; import currently materializes the local project only.`,
        );
        continue;
      }

      dependencies.push({
        predecessorProjectId: "imported-project",
        predecessorTaskUid: String(record.PredecessorUID ?? record.PredecessorTaskId ?? ""),
        successorProjectId: "imported-project",
        successorTaskUid: String(record.SuccessorUID ?? record.SuccessorTaskId ?? ""),
        type:
          String(record.Type ?? "").toUpperCase() === "SS"
            ? "SS"
            : String(record.Type ?? "").toUpperCase() === "FF"
              ? "FF"
              : String(record.Type ?? "").toUpperCase() === "SF"
                ? "SF"
                : "FS",
        lagDays: Math.round(parseNumber(record.LagDays) ?? 0),
        label: String(record.Label ?? ""),
      });
    }
  } else {
    for (const taskNode of taskNodes) {
      const successorUid = String(taskNode.UID ?? "");
      for (const predecessorLink of toArray(taskNode.PredecessorLink)) {
        const record = predecessorLink as Record<string, unknown>;
        dependencies.push({
          predecessorProjectId: "imported-project",
          predecessorTaskUid: String(record.PredecessorUID ?? ""),
          successorProjectId: "imported-project",
          successorTaskUid: successorUid,
          type: dependencyTypeFromNumber.get(Math.round(parseNumber(record.Type) ?? 1)) ?? "FS",
          lagDays: Math.round((parseNumber(record.LinkLag) ?? 0) / (minutesPerDay * 10)),
        });
      }
    }
  }

  const resources = toArray((projectNode.Resources as { Resource?: unknown })?.Resource)
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => String(entry.Name ?? "").trim())
    .map((resourceNode, index) => {
      const uid = String(resourceNode.UID ?? `resource-${index + 1}`);
      const extension = resourceExtensions.get(uid);
      const calendar = calendarMap.get(String(resourceNode.CalendarUID ?? "")) ?? projectCalendar;
      const resourceType: Resource["type"] =
        String(extension?.Type ?? "").toUpperCase() === "TEAM"
          ? "TEAM"
          : String(extension?.Type ?? "").toUpperCase() === "EQUIPMENT"
            ? "EQUIPMENT"
            : "PERSON";

      return {
        uid,
        name: String(resourceNode.Name ?? `Imported Resource ${index + 1}`),
        role: String(extension?.Role ?? resourceNode.Group ?? "Contributor"),
        type: resourceType,
        location: String(extension?.Location ?? resourceNode.Notes ?? "Imported"),
        availabilityPct: Math.max(0, Math.round((parseNumber(resourceNode.MaxUnits) ?? 1) * 100)),
        capacityHoursPerDay: calendar.hoursPerDay,
        calendarWorkingDays:
          String(resourceNode.CalendarUID ?? "") && String(resourceNode.CalendarUID ?? "") !== String(projectNode.CalendarUID ?? "")
            ? [...calendar.workingDays]
            : [],
        calendarHoursPerDay:
          String(resourceNode.CalendarUID ?? "") && String(resourceNode.CalendarUID ?? "") !== String(projectNode.CalendarUID ?? "")
            ? calendar.hoursPerDay
            : null,
        calendarExceptions:
          String(resourceNode.CalendarUID ?? "") && String(resourceNode.CalendarUID ?? "") !== String(projectNode.CalendarUID ?? "")
            ? [...calendar.exceptions]
            : [],
        costRate: parseRate(resourceNode.StandardRate),
        color: String(extension?.Color ?? "#0f766e"),
      };
    });

  const assignments = toArray((projectNode.Assignments as { Assignment?: unknown })?.Assignment)
    .map((entry) => entry as Record<string, unknown>)
    .map((assignmentNode, index) => ({
      uid: String(assignmentNode.UID ?? `assignment-${index + 1}`),
      taskUid: String(assignmentNode.TaskUID ?? ""),
      resourceUid: String(assignmentNode.ResourceUID ?? ""),
      allocationPct: Math.max(0, Math.round((parseNumber(assignmentNode.Units) ?? 1) * 100)),
      notes: String(assignmentNode.Notes ?? ""),
    }))
    .filter((assignment) => assignment.taskUid && assignment.resourceUid);

  const timesheetEntries = toArray((cheetahRoot.TimesheetEntries as { Entry?: unknown })?.Entry).map(
    (entryNode) => {
      const record = entryNode as Record<string, unknown>;
      return {
        id: String(record.EntryId ?? ""),
        projectId: "imported-project",
        taskId: String(record.TaskUID ?? record.TaskId ?? ""),
        resourceId: String(record.ResourceUID ?? record.ResourceId ?? "") || null,
        entryDate: String(record.EntryDate ?? ""),
        workHours: roundNumber(parseNumber(record.WorkHours) ?? 0),
        costAmount: parseNumber(record.CostAmount),
        notes: String(record.Notes ?? ""),
        createdAt: String(record.CreatedAt ?? new Date().toISOString()),
        updatedAt: String(record.UpdatedAt ?? new Date().toISOString()),
      } satisfies TimesheetEntry;
    },
  );

  const actualCostEntries = toArray((cheetahRoot.ActualCostEntries as { Entry?: unknown })?.Entry).map(
    (entryNode) => {
      const record = entryNode as Record<string, unknown>;
      return {
        id: String(record.EntryId ?? ""),
        projectId: "imported-project",
        taskId: String(record.TaskUID ?? record.TaskId ?? "") || null,
        resourceId: String(record.ResourceUID ?? record.ResourceId ?? "") || null,
        timesheetEntryId: String(record.TimesheetEntryId ?? "") || null,
        entryDate: String(record.EntryDate ?? ""),
        source:
          String(record.Source ?? "").toUpperCase() === "TIMESHEET"
            ? "TIMESHEET"
            : String(record.Source ?? "").toUpperCase() === "IMPORT"
              ? "IMPORT"
              : "MANUAL",
        category: (String(record.Category ?? "OTHER").toUpperCase() as ActualCostEntry["category"]),
        vendorName: String(record.VendorName ?? "") || null,
        referenceCode: String(record.ReferenceCode ?? "") || null,
        description: String(record.Description ?? ""),
        quantity: parseNumber(record.Quantity),
        unitCost: parseNumber(record.UnitCost),
        amount: roundNumber(parseNumber(record.Amount) ?? 0),
        currencyCode: String(record.CurrencyCode ?? projectNode.CurrencyCode ?? "EUR"),
        createdAt: String(record.CreatedAt ?? new Date().toISOString()),
        updatedAt: String(record.UpdatedAt ?? new Date().toISOString()),
      } satisfies ActualCostEntry;
    },
  );

  const baselines = toArray((cheetahRoot.Baselines as { Baseline?: unknown })?.Baseline).map(
    (baselineNode, index) => {
      const record = baselineNode as Record<string, unknown>;
      return {
        name: String(record.Name ?? `Imported Baseline ${index + 1}`),
        description: String(record.Description ?? ""),
        capturedAt: String(record.CapturedAt ?? new Date().toISOString()),
        capturedBy: String(record.CapturedBy ?? "Imported"),
        isActive: parseFlag(record.IsActive),
        snapshots: toArray((record.Snapshots as { Snapshot?: unknown })?.Snapshot).map((snapshotNode) => {
          const snapshot = snapshotNode as Record<string, unknown>;
          return {
            taskUid: String(snapshot.TaskUID ?? snapshot.TaskId ?? ""),
            name: String(snapshot.Name ?? "Imported task"),
            startDate: String(snapshot.StartDate ?? "") || null,
            finishDate: String(snapshot.FinishDate ?? "") || null,
            durationDays: Math.round(parseNumber(snapshot.DurationDays) ?? 0),
            workHours: roundNumber(parseNumber(snapshot.WorkHours) ?? 0),
            plannedCost: roundNumber(parseNumber(snapshot.PlannedCost) ?? 0),
            progressPercent: Math.round(parseNumber(snapshot.ProgressPercent) ?? 0),
            isCritical: parseFlag(snapshot.IsCritical),
          };
        }),
      };
    },
  );

  return {
    sourceFormat,
    project: {
      name: String(projectNode.Name ?? "Imported Project"),
      code: String(projectNode.Title ?? "IMPORTED"),
      clientName: String(projectNode.Company ?? "Imported Client"),
      ownerName: String(projectNode.Manager ?? "Imported Manager"),
      sponsorName: String(cheetahProject.SponsorName ?? "Imported Sponsor"),
      portfolio: String(cheetahProject.Portfolio ?? "Imported"),
      description: String(cheetahProject.Description ?? ""),
      status:
        String(cheetahProject.Status ?? "").toUpperCase() === "ACTIVE"
          ? "ACTIVE"
          : String(cheetahProject.Status ?? "").toUpperCase() === "AT_RISK"
            ? "AT_RISK"
            : String(cheetahProject.Status ?? "").toUpperCase() === "ON_HOLD"
              ? "ON_HOLD"
              : String(cheetahProject.Status ?? "").toUpperCase() === "COMPLETED"
                ? "COMPLETED"
                : "PLANNING",
      health:
        String(cheetahProject.Health ?? "").toUpperCase() === "WATCH"
          ? "WATCH"
          : String(cheetahProject.Health ?? "").toUpperCase() === "AT_RISK"
            ? "AT_RISK"
            : String(cheetahProject.Health ?? "").toUpperCase() === "OFF_TRACK"
              ? "OFF_TRACK"
              : "ON_TRACK",
      targetStartDate: toIsoDate(projectNode.StartDate) ?? new Date().toISOString().slice(0, 10),
      targetFinishDate: toIsoDate(projectNode.FinishDate),
      budgetAmount: roundNumber(parseNumber(cheetahProject.BudgetAmount) ?? 0),
      currencyCode: String(projectNode.CurrencyCode ?? "EUR"),
      levelingStrategy:
        String(cheetahProject.LevelingStrategy ?? "").toUpperCase() === "SLACK_THEN_PRIORITY"
          ? "SLACK_THEN_PRIORITY"
          : String(cheetahProject.LevelingStrategy ?? "").toUpperCase() === "MIN_DELAY"
            ? "MIN_DELAY"
            : "PRIORITY_THEN_SLACK",
      levelingMaxDelayDays: Math.round(parseNumber(cheetahProject.LevelingMaxDelayDays) ?? 30),
    },
    calendar: {
      name: projectCalendar.name,
      timezone: "Europe/Paris",
      workingDays: [...projectCalendar.workingDays],
      hoursPerDay: projectCalendar.hoursPerDay,
      exceptions: [...projectCalendar.exceptions],
    },
    tasks,
    dependencies: dependencies.filter(
      (dependency) =>
        tasks.some((task) => task.uid === dependency.predecessorTaskUid) &&
        tasks.some((task) => task.uid === dependency.successorTaskUid),
    ),
    resources,
    assignments,
    timesheetEntries,
    actualCostEntries,
    baselines,
    warnings,
  };
}
