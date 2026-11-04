import type {
  Dependency,
  ISODate,
  ProjectAggregate,
  ScheduleIssue,
  ScheduleResult,
  ScheduledTask,
  Task,
} from "@/types/planning";
import {
  addWorkingDays,
  compareIsoDates,
  countWorkingDaysInclusive,
  durationToFinishDate,
  finishToStartDate,
  maxIsoDate,
  minIsoDate,
  normalizeWorkingDate,
  workingDayDistance,
  type WorkingCalendarLike,
} from "@/lib/planning/date-utils";
import {
  deriveTaskDurationDays,
  getTaskWorkingCalendar,
} from "@/lib/planning/work-model";

type MutableScheduledTask = ScheduledTask;
type DependencyTaskReference = Pick<
  MutableScheduledTask,
  | "id"
  | "name"
  | "type"
  | "isSummary"
  | "scheduledStartDate"
  | "scheduledFinishDate"
  | "latestStartDate"
  | "latestFinishDate"
>;

interface HierarchyNode {
  task: Task;
  depth: number;
  wbsCode: string;
}

export interface ExternalScheduledTaskReference extends DependencyTaskReference {
  projectId: string;
  calendar: WorkingCalendarLike;
}

export interface BuildScheduleOptions {
  dependencies?: Dependency[];
  externalTasks?: ExternalScheduledTaskReference[];
}

function getTaskKey(projectId: string, taskId: string) {
  return `${projectId}:${taskId}`;
}

export function buildSchedule(
  project: ProjectAggregate,
  options: BuildScheduleOptions = {},
): ScheduleResult {
  const issues: ScheduleIssue[] = [];
  const taskMap = new Map(project.tasks.map((task) => [task.id, task]));
  const childrenMap = buildChildrenMap(project.tasks);
  const hierarchy = flattenHierarchy(project.tasks, childrenMap);
  const scheduledMap = new Map<string, MutableScheduledTask>();
  const taskCalendarMap = new Map<string, WorkingCalendarLike>();
  const externalTaskMap = new Map(
    (options.externalTasks ?? []).map((task) => [getTaskKey(task.projectId, task.id), task]),
  );
  const dependencyList = options.dependencies ?? project.dependencies;
  const localProjectId = project.project.id;

  function resolveTaskReference(
    projectId: string,
    taskId: string,
  ): (DependencyTaskReference & { calendar: WorkingCalendarLike }) | null {
    if (projectId === localProjectId) {
      const task = scheduledMap.get(taskId);
      if (!task) {
        return null;
      }

      return {
        ...task,
        calendar: taskCalendarMap.get(task.id) ?? project.calendar,
      };
    }

    return externalTaskMap.get(getTaskKey(projectId, taskId)) ?? null;
  }

  for (const node of hierarchy) {
    const childIds = childrenMap.get(node.task.id) ?? [];
    const normalizedDurationDays = deriveTaskDurationDays(node.task, project);
    const progressPercent = Math.min(Math.max(node.task.progressPercent, 0), 100);
    taskCalendarMap.set(node.task.id, getTaskWorkingCalendar(project, node.task));
    if (progressPercent !== node.task.progressPercent) {
      issues.push({
        code: "INVALID_PROGRESS",
        message: `La tache ${node.task.name} avait un avancement hors plage 0-100 et a ete normalisee.`,
        taskId: node.task.id,
      });
    }

    scheduledMap.set(node.task.id, {
      ...node.task,
      durationDays: normalizedDurationDays,
      progressPercent,
      parentId: node.task.parentId ?? null,
      wbsCode: node.wbsCode,
      depth: node.depth,
      childIds,
      isSummary: childIds.length > 0 || node.task.type === "SUMMARY",
      isCritical: false,
      totalSlackDays: null,
      freeSlackDays: null,
    });
  }

  const executableTasks = [...scheduledMap.values()].filter((task) => !task.isSummary);
  for (const task of project.tasks) {
    const parentId = task.parentId ?? null;
    if (parentId && !taskMap.has(parentId)) {
      issues.push({
        code: "ORPHAN_PARENT",
        message: `La tache ${task.name} reference un parent introuvable.`,
        taskId: task.id,
      });
    }
  }

  const incomingMap = new Map<string, Dependency[]>();
  const outgoingMap = new Map<string, Dependency[]>();
  const internalOutgoingMap = new Map<string, Dependency[]>();

  for (const dependency of dependencyList) {
    const predecessor = resolveTaskReference(
      dependency.predecessorProjectId,
      dependency.predecessorTaskId,
    );
    const successor = resolveTaskReference(
      dependency.successorProjectId,
      dependency.successorTaskId,
    );

    if (!predecessor || !successor) {
      issues.push({
        code: "MISSING_TASK",
        message: `La dependance ${dependency.id} reference une tache introuvable.`,
        dependencyId: dependency.id,
      });
      continue;
    }

    if (
      getTaskKey(dependency.predecessorProjectId, predecessor.id) ===
      getTaskKey(dependency.successorProjectId, successor.id)
    ) {
      issues.push({
        code: "SELF_DEPENDENCY",
        message: `La tache ${predecessor.name} ne peut pas dependre d'elle-meme.`,
        taskId: predecessor.id,
        dependencyId: dependency.id,
      });
      continue;
    }

    if (predecessor.isSummary || successor.isSummary) {
      issues.push({
        code: "SUMMARY_DEPENDENCY",
        message: `Les taches recapitulatives ne peuvent pas etre utilisees dans la logique de dependance (${predecessor.name} -> ${successor.name}).`,
        dependencyId: dependency.id,
      });
      continue;
    }

    if (dependency.predecessorProjectId === localProjectId) {
      const successors = outgoingMap.get(predecessor.id) ?? [];
      successors.push(dependency);
      outgoingMap.set(predecessor.id, successors);
    }

    if (dependency.successorProjectId === localProjectId) {
      const predecessors = incomingMap.get(successor.id) ?? [];
      predecessors.push(dependency);
      incomingMap.set(successor.id, predecessors);
    }

    if (
      dependency.predecessorProjectId === localProjectId &&
      dependency.successorProjectId === localProjectId
    ) {
      const successors = internalOutgoingMap.get(predecessor.id) ?? [];
      successors.push(dependency);
      internalOutgoingMap.set(predecessor.id, successors);
    }
  }

  const topoOrder = topologicalSort(
    executableTasks.map((task) => task.id),
    internalOutgoingMap,
  );
  if (!topoOrder) {
    issues.push({
      code: "CYCLE",
      message: "Le reseau de dependances contient un cycle. Les dates sont calculees sans les liens cycliques.",
    });
  }

  const orderedExecutableIds = topoOrder ?? executableTasks.map((task) => task.id);
  const calendar = project.calendar;
  const projectStartDate =
    normalizeWorkingDate(
      project.project.targetStartDate ??
        minIsoDate(executableTasks.map((task) => task.constraintDate)) ??
        "2026-01-05",
      calendar,
    );

  for (const taskId of orderedExecutableIds) {
    const task = scheduledMap.get(taskId);
    if (!task) {
      continue;
    }

    const taskCalendar = taskCalendarMap.get(task.id) ?? calendar;
    const baseStart = normalizeWorkingDate(projectStartDate, taskCalendar);
    const lowerBoundStart = getConstraintLowerBoundStart(task, taskCalendar);

    // Deux passes AVANT (spec François 29/08) :
    //  • earliest = « au plus tôt » PUR, sans nivellement (état « avant nivellement », figé) ;
    //  • scheduled = au plus tôt + délais de nivellement cascadés (état « après nivellement »).
    let earliestStart = baseStart;
    let scheduledStart = baseStart;
    if (lowerBoundStart && compareIsoDates(lowerBoundStart, earliestStart) > 0) {
      earliestStart = lowerBoundStart;
      scheduledStart = lowerBoundStart;
    }
    const predecessors = incomingMap.get(task.id) ?? [];

    for (const dependency of predecessors) {
      const predecessor = resolveTaskReference(
        dependency.predecessorProjectId,
        dependency.predecessorTaskId,
      );
      if (!predecessor) continue;

      // Prédécesseur d'un AUTRE projet (référence externe) : pas de date au plus tôt
      // exposée → on retombe sur ses dates planifiées (projet externe considéré figé).
      const predEarliestStart =
        (predecessor as { earliestStartDate?: string | null }).earliestStartDate ??
        predecessor.scheduledStartDate;
      const predEarliestFinish =
        (predecessor as { earliestFinishDate?: string | null }).earliestFinishDate ??
        predecessor.scheduledFinishDate;
      if (predEarliestStart && predEarliestFinish) {
        const c = getForwardConstraintStart(
          predEarliestStart,
          predEarliestFinish,
          task.durationDays,
          dependency,
          taskCalendar,
        );
        if (compareIsoDates(c, earliestStart) > 0) earliestStart = c;
      }
      if (predecessor.scheduledStartDate && predecessor.scheduledFinishDate) {
        const c = getForwardConstraintStart(
          predecessor.scheduledStartDate,
          predecessor.scheduledFinishDate,
          task.durationDays,
          dependency,
          taskCalendar,
        );
        if (compareIsoDates(c, scheduledStart) > 0) scheduledStart = c;
      }
    }

    task.earliestStartDate = earliestStart;
    task.earliestFinishDate = durationToFinishDate(
      earliestStart,
      getTaskDuration(task),
      taskCalendar,
    );

    // Le délai de nivellement ne s'applique QU'AU planifié (après nivellement).
    if (task.levelingDelayDays > 0) {
      scheduledStart = addWorkingDays(scheduledStart, task.levelingDelayDays, taskCalendar);
    }

    if (
      task.schedulingMode === "MANUAL" &&
      task.manualStartDate &&
      task.manualFinishDate
    ) {
      task.scheduledStartDate = task.manualStartDate;
      task.scheduledFinishDate = task.manualFinishDate;
    } else {
      task.scheduledStartDate = scheduledStart;
      task.scheduledFinishDate = durationToFinishDate(
        scheduledStart,
        getTaskDuration(task),
        taskCalendar,
      );
    }
  }

  const unconstrainedProjectFinish =
    maxIsoDate(
      executableTasks.map(
        (task) => scheduledMap.get(task.id)?.scheduledFinishDate ?? null,
      ),
    ) ?? projectStartDate;
  const projectRequiredFinish = project.project.targetFinishDate
    ? normalizeWorkingDate(project.project.targetFinishDate, calendar, -1)
    : unconstrainedProjectFinish;

  for (const taskId of [...orderedExecutableIds].reverse()) {
    const task = scheduledMap.get(taskId);
    if (!task?.scheduledStartDate || !task.scheduledFinishDate) {
      continue;
    }

    const taskCalendar = taskCalendarMap.get(task.id) ?? calendar;
    let latestFinish = normalizeWorkingDate(projectRequiredFinish, taskCalendar, -1);
    const successors = outgoingMap.get(task.id) ?? [];

    if (successors.length > 0) {
      const candidateFinishes = successors
        .map((dependency) => {
          const successor = resolveTaskReference(
            dependency.successorProjectId,
            dependency.successorTaskId,
          );
          if (!successor?.latestStartDate || !successor.latestFinishDate) {
            return null;
          }

          return getBackwardConstraintFinish(
            successor.latestStartDate,
            successor.latestFinishDate,
            task.durationDays,
            dependency,
            successor.calendar,
          );
        })
        .filter(Boolean) as ISODate[];

      const earliestRequiredFinish = minIsoDate(candidateFinishes);
      if (earliestRequiredFinish) {
        latestFinish = earliestRequiredFinish;
      }
    }

    const latestConstraintFinish = getConstraintUpperBoundFinish(task, taskCalendar);
    if (latestConstraintFinish) {
      const constrainedFinish = minIsoDate([latestFinish, latestConstraintFinish]);
      latestFinish = constrainedFinish ?? latestFinish;
    }

    task.latestFinishDate = latestFinish;
    task.latestStartDate = finishToStartDate(
      latestFinish,
      getTaskDuration(task),
      taskCalendar,
    );
    task.totalSlackDays = workingDayDistance(
      task.scheduledStartDate,
      task.latestStartDate,
      taskCalendar,
    );
    task.freeSlackDays = getFreeSlack(
      task,
      outgoingMap,
      resolveTaskReference,
      calendar,
    );
    task.isCritical = (task.totalSlackDays ?? 0) <= 0;
  }

  rollupSummaryTasks(hierarchy, scheduledMap, taskCalendarMap, calendar);
  applyConstraintAndDeadlineIssues(
    executableTasks,
    scheduledMap,
    taskCalendarMap,
    calendar,
    issues,
  );

  const orderedTaskIds = hierarchy.map((node) => node.task.id);
  const tasksById = Object.fromEntries(
    orderedTaskIds.map((taskId) => [taskId, scheduledMap.get(taskId)!]),
  );

  return {
    projectStartDate,
    projectFinishDate: maxIsoDate(
      Object.values(tasksById).map((task) => task.scheduledFinishDate),
    ),
    orderedTaskIds,
    tasksById,
    criticalPathTaskIds: orderedTaskIds.filter(
      (taskId) => tasksById[taskId]?.isCritical,
    ),
    issues,
  };
}

function buildChildrenMap(tasks: Task[]) {
  const childrenMap = new Map<string, string[]>();

  for (const task of [...tasks].sort((left, right) => left.sortOrder - right.sortOrder)) {
    if (!task.parentId) {
      continue;
    }

    const children = childrenMap.get(task.parentId) ?? [];
    children.push(task.id);
    childrenMap.set(task.parentId, children);
  }

  return childrenMap;
}

function flattenHierarchy(tasks: Task[], childrenMap: Map<string, string[]>) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const rootTasks = [...tasks]
    .filter((task) => !task.parentId)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const flattened: HierarchyNode[] = [];

  function visit(task: Task, depth: number, prefix: string) {
    flattened.push({
      task,
      depth,
      wbsCode: prefix,
    });

    const children = (childrenMap.get(task.id) ?? [])
      .map((childId) => taskMap.get(childId))
      .filter(Boolean) as Task[];

    children
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .forEach((child, index) => visit(child, depth + 1, `${prefix}.${index + 1}`));
  }

  rootTasks.forEach((task, index) => visit(task, 0, `${index + 1}`));

  return flattened;
}

function topologicalSort(taskIds: string[], outgoingMap: Map<string, Dependency[]>) {
  const inDegree = new Map(taskIds.map((taskId) => [taskId, 0]));

  for (const taskId of taskIds) {
    for (const dependency of outgoingMap.get(taskId) ?? []) {
      inDegree.set(
        dependency.successorTaskId,
        (inDegree.get(dependency.successorTaskId) ?? 0) + 1,
      );
    }
  }

  const queue = taskIds
    .filter((taskId) => (inDegree.get(taskId) ?? 0) === 0)
    .sort((left, right) => left.localeCompare(right));
  const ordered: string[] = [];

  while (queue.length > 0) {
    const taskId = queue.shift()!;
    ordered.push(taskId);

    for (const dependency of outgoingMap.get(taskId) ?? []) {
      const successorId = dependency.successorTaskId;
      const nextDegree = (inDegree.get(successorId) ?? 0) - 1;
      inDegree.set(successorId, nextDegree);
      if (nextDegree === 0) {
        queue.push(successorId);
      }
    }
  }

  return ordered.length === taskIds.length ? ordered : null;
}

function getTaskDuration(task: { durationDays: number; type: string }) {
  if (task.type === "MILESTONE" || task.type === "SUMMARY") {
    return 0;
  }

  return Math.max(task.durationDays, 1);
}

function roundWorkHours(value: number) {
  return Math.round(value * 100) / 100;
}

function getConstraintLowerBoundStart(
  task: MutableScheduledTask,
  calendar: WorkingCalendarLike,
) {
  if (!task.constraintDate) {
    return null;
  }

  switch (task.constraintType) {
    case "START_NO_EARLIER_THAN":
    case "MUST_START_ON":
      return normalizeWorkingDate(task.constraintDate, calendar);
    case "FINISH_NO_EARLIER_THAN":
    case "MUST_FINISH_ON":
      return finishToStartDate(
        normalizeWorkingDate(task.constraintDate, calendar),
        getTaskDuration(task),
        calendar,
      );
    default:
      return null;
  }
}

function getConstraintUpperBoundFinish(
  task: MutableScheduledTask,
  calendar: WorkingCalendarLike,
) {
  if (!task.constraintDate) {
    return null;
  }

  switch (task.constraintType) {
    case "START_NO_LATER_THAN":
    case "MUST_START_ON":
      return durationToFinishDate(
        normalizeWorkingDate(task.constraintDate, calendar),
        getTaskDuration(task),
        calendar,
      );
    case "FINISH_NO_LATER_THAN":
    case "MUST_FINISH_ON":
      return normalizeWorkingDate(task.constraintDate, calendar);
    default:
      return null;
  }
}

function applyConstraintAndDeadlineIssues(
  executableTasks: MutableScheduledTask[],
  scheduledMap: Map<string, MutableScheduledTask>,
  taskCalendarMap: Map<string, WorkingCalendarLike>,
  projectCalendar: ProjectAggregate["calendar"],
  issues: ScheduleIssue[],
) {
  for (const executableTask of executableTasks) {
    const task = scheduledMap.get(executableTask.id);
    if (!task?.scheduledStartDate || !task.scheduledFinishDate) {
      continue;
    }

    const taskCalendar = taskCalendarMap.get(task.id) ?? projectCalendar;

    if (task.constraintDate) {
      const constraintViolated = isConstraintViolated(task, taskCalendar);

      if (constraintViolated) {
        issues.push({
          code: "CONSTRAINT_VIOLATION",
          message: `${task.name} viole sa contrainte ${formatConstraintLabel(task.constraintType)}.`,
          taskId: task.id,
        });
      }
    }

    if (
      task.schedulingMode === "MANUAL" &&
      task.earliestStartDate &&
      compareIsoDates(task.scheduledStartDate, task.earliestStartDate) < 0
    ) {
      issues.push({
        code: "MANUAL_CONFLICT",
        message: `${task.name} est planifiee manuellement avant son debut au plus tot issu des dependances (${task.earliestStartDate}).`,
        taskId: task.id,
      });
    }

    if (
      task.deadlineDate &&
      compareIsoDates(task.scheduledFinishDate, task.deadlineDate) > 0
    ) {
      issues.push({
        code: "DEADLINE_MISSED",
        message: `${task.name} est prevue apres son echeance (${task.deadlineDate}).`,
        taskId: task.id,
      });
    }
  }
}

function isConstraintViolated(
  task: MutableScheduledTask,
  calendar: WorkingCalendarLike,
) {
  if (!task.constraintDate || !task.scheduledStartDate || !task.scheduledFinishDate) {
    return false;
  }

  const normalizedConstraintDate = normalizeWorkingDate(task.constraintDate, calendar);

  switch (task.constraintType) {
    case "ASAP":
      return false;
    case "START_NO_EARLIER_THAN":
      return compareIsoDates(task.scheduledStartDate, normalizedConstraintDate) < 0;
    case "START_NO_LATER_THAN":
      return compareIsoDates(task.scheduledStartDate, normalizedConstraintDate) > 0;
    case "FINISH_NO_EARLIER_THAN":
      return compareIsoDates(task.scheduledFinishDate, normalizedConstraintDate) < 0;
    case "FINISH_NO_LATER_THAN":
      return compareIsoDates(task.scheduledFinishDate, normalizedConstraintDate) > 0;
    case "MUST_START_ON":
      return compareIsoDates(task.scheduledStartDate, normalizedConstraintDate) !== 0;
    case "MUST_FINISH_ON":
      return compareIsoDates(task.scheduledFinishDate, normalizedConstraintDate) !== 0;
    default:
      return false;
  }
}

function formatConstraintLabel(constraintType: MutableScheduledTask["constraintType"]) {
  switch (constraintType) {
    case "ASAP":
      return "ASAP";
    case "START_NO_EARLIER_THAN":
      return "Debut au plus tot le";
    case "START_NO_LATER_THAN":
      return "Debut au plus tard le";
    case "FINISH_NO_EARLIER_THAN":
      return "Fin au plus tot le";
    case "FINISH_NO_LATER_THAN":
      return "Fin au plus tard le";
    case "MUST_START_ON":
      return "Doit debuter le";
    case "MUST_FINISH_ON":
      return "Doit finir le";
    default:
      return "Tache";
  }
}

function getForwardConstraintStart(
  predecessorStart: ISODate,
  predecessorFinish: ISODate,
  successorDurationDays: number,
  dependency: Dependency,
  calendar: WorkingCalendarLike,
) {
  switch (dependency.type) {
    case "FS":
      return addWorkingDays(predecessorFinish, dependency.lagDays + 1, calendar);
    case "SS":
      return addWorkingDays(predecessorStart, dependency.lagDays, calendar);
    case "FF":
      return finishToStartDate(
        addWorkingDays(predecessorFinish, dependency.lagDays, calendar),
        successorDurationDays,
        calendar,
      );
    case "SF":
      return finishToStartDate(
        addWorkingDays(predecessorStart, dependency.lagDays, calendar),
        successorDurationDays,
        calendar,
      );
    default:
      return predecessorFinish;
  }
}

function getBackwardConstraintFinish(
  successorLatestStart: ISODate,
  successorLatestFinish: ISODate,
  predecessorDurationDays: number,
  dependency: Dependency,
  calendar: WorkingCalendarLike,
) {
  switch (dependency.type) {
    case "FS":
      return addWorkingDays(successorLatestStart, -(dependency.lagDays + 1), calendar);
    case "SS": {
      const predecessorLatestStart = addWorkingDays(
        successorLatestStart,
        -dependency.lagDays,
        calendar,
      );
      return durationToFinishDate(
        predecessorLatestStart,
        predecessorDurationDays,
        calendar,
      );
    }
    case "FF":
      return addWorkingDays(successorLatestFinish, -dependency.lagDays, calendar);
    case "SF": {
      const predecessorLatestStart = addWorkingDays(
        successorLatestFinish,
        -dependency.lagDays,
        calendar,
      );
      return durationToFinishDate(
        predecessorLatestStart,
        predecessorDurationDays,
        calendar,
      );
    }
    default:
      return successorLatestFinish;
  }
}

function getFreeSlack(
  task: MutableScheduledTask,
  outgoingMap: Map<string, Dependency[]>,
  resolveTaskReference: (
    projectId: string,
    taskId: string,
  ) => (DependencyTaskReference & { calendar: WorkingCalendarLike }) | null,
  projectCalendar: ProjectAggregate["calendar"],
) {
  if (!task.scheduledStartDate || !task.scheduledFinishDate) {
    return null;
  }

  const successors = outgoingMap.get(task.id) ?? [];
  if (!successors.length) {
    return task.totalSlackDays ?? 0;
  }

  const candidateSlack = successors
    .map((dependency) => {
      const successor = resolveTaskReference(
        dependency.successorProjectId,
        dependency.successorTaskId,
      );
      if (!successor?.scheduledStartDate || !successor.scheduledFinishDate) {
        return null;
      }

      const successorCalendar = successor.calendar ?? projectCalendar;

      switch (dependency.type) {
        case "FS":
          return workingDayDistance(
            addWorkingDays(
              task.scheduledFinishDate!,
              dependency.lagDays + 1,
              successorCalendar,
            ),
            successor.scheduledStartDate,
            successorCalendar,
          );
        case "SS":
          return workingDayDistance(
            addWorkingDays(
              task.scheduledStartDate!,
              dependency.lagDays,
              successorCalendar,
            ),
            successor.scheduledStartDate,
            successorCalendar,
          );
        case "FF":
          return workingDayDistance(
            addWorkingDays(
              task.scheduledFinishDate!,
              dependency.lagDays,
              successorCalendar,
            ),
            successor.scheduledFinishDate,
            successorCalendar,
          );
        case "SF":
          return workingDayDistance(
            addWorkingDays(
              task.scheduledStartDate!,
              dependency.lagDays,
              successorCalendar,
            ),
            successor.scheduledFinishDate,
            successorCalendar,
          );
        default:
          return null;
      }
    })
    .filter((value) => value !== null) as number[];

  return candidateSlack.length ? Math.min(...candidateSlack) : task.totalSlackDays ?? 0;
}

function rollupSummaryTasks(
  hierarchy: HierarchyNode[],
  scheduledMap: Map<string, MutableScheduledTask>,
  taskCalendarMap: Map<string, WorkingCalendarLike>,
  projectCalendar: ProjectAggregate["calendar"],
) {
  for (const { task } of [...hierarchy].reverse()) {
    const scheduled = scheduledMap.get(task.id);
    if (!scheduled?.isSummary) {
      continue;
    }

    const children = scheduled.childIds
      .map((childId) => scheduledMap.get(childId))
      .filter(Boolean) as MutableScheduledTask[];

    if (!children.length) {
      scheduled.scheduledStartDate = null;
      scheduled.scheduledFinishDate = null;
      scheduled.earliestStartDate = null;
      scheduled.earliestFinishDate = null;
      scheduled.latestStartDate = null;
      scheduled.latestFinishDate = null;
      scheduled.durationDays = 0;
      scheduled.totalSlackDays = null;
      scheduled.freeSlackDays = null;
      scheduled.isCritical = false;
      scheduled.progressPercent = 0;
      scheduled.status = "NOT_STARTED";
      scheduled.actualStartDate = null;
      scheduled.actualFinishDate = null;
      scheduled.actualWorkHours = 0;
      scheduled.remainingWorkHours = 0;
      continue;
    }

    const childStarts = children.map((child) => child.scheduledStartDate ?? null);
    const childFinishes = children.map((child) => child.scheduledFinishDate ?? null);
    const childEarliestStarts = children.map((child) => child.earliestStartDate ?? null);
    const childEarliestFinishes = children.map((child) => child.earliestFinishDate ?? null);
    const childLatestStarts = children.map((child) => child.latestStartDate ?? null);
    const childLatestFinishes = children.map((child) => child.latestFinishDate ?? null);
    const childActualStarts = children.map((child) => child.actualStartDate ?? null);
    const childActualFinishes = children.map((child) => child.actualFinishDate ?? null);

    scheduled.scheduledStartDate = minIsoDate(childStarts);
    scheduled.scheduledFinishDate = maxIsoDate(childFinishes);
    scheduled.earliestStartDate = minIsoDate(childEarliestStarts);
    scheduled.earliestFinishDate = maxIsoDate(childEarliestFinishes);
    scheduled.latestStartDate = minIsoDate(childLatestStarts);
    scheduled.latestFinishDate = maxIsoDate(childLatestFinishes);
    scheduled.durationDays = countWorkingDaysInclusive(
      scheduled.scheduledStartDate,
      scheduled.scheduledFinishDate,
      taskCalendarMap.get(scheduled.id) ?? projectCalendar,
    );
    scheduled.totalSlackDays = Math.min(
      ...children.map((child) => child.totalSlackDays ?? 0),
    );
    scheduled.freeSlackDays = Math.min(
      ...children.map((child) => child.freeSlackDays ?? 0),
    );
    scheduled.isCritical = children.some((child) => child.isCritical);
    scheduled.progressPercent = calculateSummaryProgress(children);
    scheduled.status = summarizeStatus(children);
    scheduled.actualStartDate = minIsoDate(childActualStarts);
    scheduled.actualFinishDate = children.every((child) => child.actualFinishDate)
      ? maxIsoDate(childActualFinishes)
      : null;
    scheduled.actualWorkHours = roundWorkHours(
      children.reduce((total, child) => total + (child.actualWorkHours ?? 0), 0),
    );
    scheduled.remainingWorkHours = roundWorkHours(
      children.reduce((total, child) => total + (child.remainingWorkHours ?? 0), 0),
    );
  }
}

function calculateSummaryProgress(children: MutableScheduledTask[]) {
  const weightedDuration = children.reduce(
    (total, child) => total + Math.max(getTaskDuration(child), 1),
    0,
  );

  if (weightedDuration === 0) {
    return 0;
  }

  const weightedProgress = children.reduce(
    (total, child) =>
      total + Math.max(getTaskDuration(child), 1) * child.progressPercent,
    0,
  );

  return Math.round(weightedProgress / weightedDuration);
}

function summarizeStatus(children: MutableScheduledTask[]) {
  if (children.every((child) => child.status === "DONE")) {
    return "DONE";
  }

  if (children.some((child) => child.status === "BLOCKED")) {
    return "BLOCKED";
  }

  if (
    children.some(
      (child) =>
        child.status === "IN_PROGRESS" || child.status === "DONE" || child.progressPercent > 0,
    )
  ) {
    return "IN_PROGRESS";
  }

  return "NOT_STARTED";
}
