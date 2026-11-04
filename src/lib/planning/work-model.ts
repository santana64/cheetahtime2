import {
  countWorkingDaysInclusive,
  type WorkingCalendarLike,
} from "@/lib/planning/date-utils";
import type {
  ActualCostEntry,
  Assignment,
  CalendarException,
  ProjectAggregate,
  Resource,
  ScheduledTask,
  Task,
  TimesheetEntry,
} from "@/types/planning";

function roundWorkHours(value: number) {
  return Math.round(value * 100) / 100;
}

function mergeCalendarExceptions(
  baseExceptions: CalendarException[],
  overrideExceptions: CalendarException[],
) {
  const merged = new Map<string, CalendarException>();

  for (const exception of baseExceptions) {
    merged.set(exception.date, exception);
  }

  for (const exception of overrideExceptions) {
    merged.set(exception.date, exception);
  }

  return [...merged.values()].sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
  );
}

function getProjectWorkingCalendar(project: ProjectAggregate): WorkingCalendarLike {
  return {
    workingDays: [...project.calendar.workingDays],
    hoursPerDay: project.calendar.hoursPerDay,
    exceptions: [...project.calendar.exceptions],
  };
}

export function getResourceWorkingCalendar(
  project: ProjectAggregate,
  resource: Pick<
    Resource,
    | "calendarWorkingDays"
    | "calendarHoursPerDay"
    | "calendarExceptions"
    | "capacityHoursPerDay"
  >,
): WorkingCalendarLike {
  const projectCalendar = getProjectWorkingCalendar(project);

  return {
    workingDays: resource.calendarWorkingDays.length
      ? [...resource.calendarWorkingDays]
      : projectCalendar.workingDays,
    hoursPerDay:
      resource.calendarHoursPerDay ??
      resource.capacityHoursPerDay ??
      projectCalendar.hoursPerDay,
    exceptions: mergeCalendarExceptions(
      projectCalendar.exceptions,
      resource.calendarExceptions ?? [],
    ),
  };
}

export function getTaskWorkingCalendar(
  project: ProjectAggregate,
  task: Pick<
    Task | ScheduledTask,
    | "calendarMode"
    | "calendarWorkingDays"
    | "calendarHoursPerDay"
    | "calendarExceptions"
  >,
): WorkingCalendarLike {
  const projectCalendar = getProjectWorkingCalendar(project);

  if (task.calendarMode !== "CUSTOM") {
    return projectCalendar;
  }

  return {
    workingDays: task.calendarWorkingDays.length
      ? [...task.calendarWorkingDays]
      : projectCalendar.workingDays,
    hoursPerDay: task.calendarHoursPerDay ?? projectCalendar.hoursPerDay,
    exceptions: mergeCalendarExceptions(
      projectCalendar.exceptions,
      task.calendarExceptions ?? [],
    ),
  };
}

export function getTaskTimesheetEntries(
  project: ProjectAggregate,
  taskId: string,
  resourceId?: string | null,
) {
  return project.timesheetEntries.filter(
    (entry) =>
      entry.taskId === taskId &&
      (resourceId === undefined || entry.resourceId === resourceId),
  );
}

export function getProjectActualCostEntries(project: ProjectAggregate) {
  return [...project.actualCostEntries].sort(
    (left, right) =>
      left.entryDate.localeCompare(right.entryDate) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

export function getTaskActualCostEntries(
  project: ProjectAggregate,
  taskId: string,
  category?: ActualCostEntry["category"],
) {
  return getProjectActualCostEntries(project).filter(
    (entry) =>
      entry.taskId === taskId &&
      (category === undefined || entry.category === category),
  );
}

export function getResourceActualCostEntries(
  project: ProjectAggregate,
  resourceId: string,
  category?: ActualCostEntry["category"],
) {
  return getProjectActualCostEntries(project).filter(
    (entry) =>
      entry.resourceId === resourceId &&
      (category === undefined || entry.category === category),
  );
}

export function getResourceDailyCapacityHours(
  resource: Resource,
  project?: ProjectAggregate,
) {
  const calendarHours =
    project != null
      ? getResourceWorkingCalendar(project, resource).hoursPerDay
      : (resource.calendarHoursPerDay ?? resource.capacityHoursPerDay);

  return roundWorkHours(calendarHours * (resource.availabilityPct / 100));
}

export function getTaskAssignments(project: ProjectAggregate, taskId: string) {
  return project.assignments.filter((assignment) => assignment.taskId === taskId);
}

export function getTaskTotalAllocationPct(
  project: ProjectAggregate,
  taskId: string,
) {
  return getTaskAssignments(project, taskId).reduce(
    (total, assignment) => total + assignment.allocationPct,
    0,
  );
}

export function getTaskDailyCapacityHours(
  project: ProjectAggregate,
  taskId: string,
) {
  const resourceMap = new Map(
    project.resources.map((resource) => [resource.id, resource]),
  );
  const task = project.tasks.find((entry) => entry.id === taskId);
  const taskCalendarHours = task
    ? getTaskWorkingCalendar(project, task).hoursPerDay
    : project.calendar.hoursPerDay;
  const dailyCapacity = getTaskAssignments(project, taskId).reduce(
    (total, assignment) => {
      const resource = resourceMap.get(assignment.resourceId);
      if (!resource) {
        return total;
      }

      return (
        total +
        getResourceDailyCapacityHours(resource, project) *
          (assignment.allocationPct / 100)
      );
    },
    0,
  );

  return roundWorkHours(dailyCapacity > 0 ? dailyCapacity : taskCalendarHours);
}

export function getTaskTrackedActualWorkHours(
  task: Pick<Task, "id" | "actualWorkHours">,
  project: ProjectAggregate,
) {
  const timesheetEntries = getTaskTimesheetEntries(project, task.id);
  if (timesheetEntries.length) {
    return roundWorkHours(
      timesheetEntries.reduce((total, entry) => total + entry.workHours, 0),
    );
  }

  return roundWorkHours(Math.max(task.actualWorkHours ?? 0, 0));
}

export function deriveTaskEffortHours(
  task: Pick<
    Task,
    | "id"
    | "type"
    | "durationDays"
    | "effortHours"
    | "manualStartDate"
    | "manualFinishDate"
    | "schedulingMode"
    | "calendarMode"
    | "calendarWorkingDays"
    | "calendarHoursPerDay"
    | "calendarExceptions"
  >,
  project: ProjectAggregate,
) {
  if (task.type === "MILESTONE" || task.type === "SUMMARY") {
    return 0;
  }

  if (typeof task.effortHours === "number" && Number.isFinite(task.effortHours)) {
    return roundWorkHours(Math.max(task.effortHours, 0));
  }

  const taskCalendar = getTaskWorkingCalendar(project, task);

  if (
    task.schedulingMode === "MANUAL" &&
    task.manualStartDate &&
    task.manualFinishDate
  ) {
    return roundWorkHours(
      countWorkingDaysInclusive(
        task.manualStartDate,
        task.manualFinishDate,
        taskCalendar,
      ) * getTaskDailyCapacityHours(project, task.id),
    );
  }

  return roundWorkHours(
    Math.max(task.durationDays, 0) * getTaskDailyCapacityHours(project, task.id),
  );
}

export function deriveTaskDurationDays(
  task: Pick<
    Task,
    | "id"
    | "type"
    | "durationDays"
    | "workFormula"
    | "manualStartDate"
    | "manualFinishDate"
    | "schedulingMode"
    | "effortHours"
    | "calendarMode"
    | "calendarWorkingDays"
    | "calendarHoursPerDay"
    | "calendarExceptions"
  >,
  project: ProjectAggregate,
) {
  if (task.type === "MILESTONE" || task.type === "SUMMARY") {
    return 0;
  }

  const taskCalendar = getTaskWorkingCalendar(project, task);

  if (
    task.schedulingMode === "MANUAL" &&
    task.manualStartDate &&
    task.manualFinishDate
  ) {
    return Math.max(
      countWorkingDaysInclusive(
        task.manualStartDate,
        task.manualFinishDate,
        taskCalendar,
      ),
      1,
    );
  }

  if (task.workFormula === "FIXED_DURATION") {
    return Math.max(task.durationDays, 1);
  }

  const dailyCapacity = Math.max(getTaskDailyCapacityHours(project, task.id), 0.25);
  const effortHours = deriveTaskEffortHours(task, project);

  return Math.max(Math.ceil(effortHours / dailyCapacity), 1);
}

export function getScheduledTaskWorkingDurationDays(
  task: Pick<
    ScheduledTask,
    | "id"
    | "scheduledStartDate"
    | "scheduledFinishDate"
    | "calendarMode"
    | "calendarWorkingDays"
    | "calendarHoursPerDay"
    | "calendarExceptions"
  >,
  project: ProjectAggregate,
) {
  return Math.max(
    countWorkingDaysInclusive(
      task.scheduledStartDate ?? null,
      task.scheduledFinishDate ?? null,
      getTaskWorkingCalendar(project, task),
    ),
    1,
  );
}

export function getAssignmentDailyWorkHours(
  assignment: Assignment,
  task: Pick<
    ScheduledTask,
    | "id"
    | "scheduledStartDate"
    | "scheduledFinishDate"
    | "effortHours"
    | "calendarMode"
    | "calendarWorkingDays"
    | "calendarHoursPerDay"
    | "calendarExceptions"
  >,
  project: ProjectAggregate,
) {
  const totalAllocationPct = Math.max(
    getTaskTotalAllocationPct(project, task.id),
    assignment.allocationPct,
    1,
  );
  const taskDurationDays = getScheduledTaskWorkingDurationDays(task, project);
  const taskEffortHours =
    typeof task.effortHours === "number"
      ? task.effortHours
      : roundWorkHours(taskDurationDays * getTaskDailyCapacityHours(project, task.id));

  return roundWorkHours(
    (taskEffortHours / taskDurationDays) *
      (assignment.allocationPct / totalAllocationPct),
  );
}

export function getTaskPlannedCost(
  task: Pick<
    Task,
    | "id"
    | "effortHours"
    | "durationDays"
    | "type"
    | "manualStartDate"
    | "manualFinishDate"
    | "schedulingMode"
    | "calendarMode"
    | "calendarWorkingDays"
    | "calendarHoursPerDay"
    | "calendarExceptions"
  >,
  project: ProjectAggregate,
) {
  if (task.type === "SUMMARY") {
    return 0;
  }

  const assignments = getTaskAssignments(project, task.id);
  if (!assignments.length) {
    return 0;
  }

  const resourceMap = new Map(
    project.resources.map((resource) => [resource.id, resource]),
  );
  const totalAllocationPct = Math.max(
    assignments.reduce((total, assignment) => total + assignment.allocationPct, 0),
    1,
  );
  const taskEffortHours = deriveTaskEffortHours(task, project);

  const plannedCost = assignments.reduce((total, assignment) => {
    const resource = resourceMap.get(assignment.resourceId);
    if (!resource?.costRate) {
      return total;
    }

    return (
      total +
      taskEffortHours *
        (assignment.allocationPct / totalAllocationPct) *
        resource.costRate
    );
  }, 0);

  return roundWorkHours(plannedCost);
}

function getTimesheetEntryCost(
  entry: TimesheetEntry,
  resourceMap: Map<string, Resource>,
) {
  if (typeof entry.costAmount === "number" && Number.isFinite(entry.costAmount)) {
    return entry.costAmount;
  }

  if (!entry.resourceId) {
    return 0;
  }

  const resource = resourceMap.get(entry.resourceId);
  if (!resource?.costRate) {
    return 0;
  }

  return entry.workHours * resource.costRate;
}

export function getTaskActualCost(
  task: Pick<Task, "id" | "type" | "actualWorkHours">,
  project: ProjectAggregate,
) {
  if (task.type === "SUMMARY") {
    return 0;
  }

  const ledgerEntries = getTaskActualCostEntries(project, task.id);
  if (ledgerEntries.length) {
    return roundWorkHours(
      ledgerEntries.reduce((total, entry) => total + entry.amount, 0),
    );
  }

  const timesheetEntries = getTaskTimesheetEntries(project, task.id);
  const resourceMap = new Map(
    project.resources.map((resource) => [resource.id, resource]),
  );

  if (timesheetEntries.length) {
    return roundWorkHours(
      timesheetEntries.reduce(
        (total, entry) => total + getTimesheetEntryCost(entry, resourceMap),
        0,
      ),
    );
  }

  const assignments = getTaskAssignments(project, task.id);
  if (!assignments.length) {
    return 0;
  }

  const totalAllocationPct = Math.max(
    assignments.reduce((total, assignment) => total + assignment.allocationPct, 0),
    1,
  );
  const actualWorkHours = roundWorkHours(Math.max(task.actualWorkHours ?? 0, 0));

  const actualCost = assignments.reduce((total, assignment) => {
    const resource = resourceMap.get(assignment.resourceId);
    if (!resource?.costRate) {
      return total;
    }

    return (
      total +
      actualWorkHours *
        (assignment.allocationPct / totalAllocationPct) *
        resource.costRate
    );
  }, 0);

  return roundWorkHours(actualCost);
}

export function getProjectActualCost(project: ProjectAggregate) {
  const ledgerEntries = getProjectActualCostEntries(project);
  if (ledgerEntries.length) {
    return roundWorkHours(
      ledgerEntries.reduce((total, entry) => total + entry.amount, 0),
    );
  }

  return roundWorkHours(
    project.tasks.reduce(
      (total, task) => total + getTaskActualCost(task, project),
      0,
    ),
  );
}

export function getProjectActualCostBreakdown(project: ProjectAggregate) {
  const entries = getProjectActualCostEntries(project);
  const laborEntries = entries.filter((entry) => entry.category === "LABOR");
  const nonLaborEntries = entries.filter((entry) => entry.category !== "LABOR");

  return {
    labor: roundWorkHours(
      laborEntries.reduce((total, entry) => total + entry.amount, 0),
    ),
    nonLabor: roundWorkHours(
      nonLaborEntries.reduce((total, entry) => total + entry.amount, 0),
    ),
    count: entries.length,
  };
}
