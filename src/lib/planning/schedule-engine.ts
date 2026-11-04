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
import {
  inferMonths,
  monthAfter,
  monthFinish,
  monthFinishShift,
  monthShift,
  monthStart,
  monthsBetween,
} from "@/lib/planning/month-calendar";
import { fromWorkingDays } from "@/lib/planning/time-unit";

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
  /** Date d'état imposée (sinon : project.statusDate, ou aujourd'hui si un PI est figé). */
  statusDate?: ISODate | null;
}

export const DEFAULT_PSEUDO_CRITICAL_COEFFICIENT = 1.3;

function todayIsoUtc(): ISODate {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Date d'état effective : explicite si saisie ; sinon la date du jour dès que le
 * projet est en suivi (PI figé) ; sinon aucune (planification pure).
 */
export function resolveStatusDate(project: ProjectAggregate, override?: ISODate | null): ISODate | null {
  if (override !== undefined) return override;
  if (project.project.statusDate) return project.project.statusDate;
  if (project.baselines?.some((baseline) => baseline.isActive)) return todayIsoUtc();
  return null;
}

/**
 * Arithmétique des durées : jours ouvrés (par défaut) ou MOIS CALENDAIRES
 * (projet en « mois » : 3 mois au 1er avril finissent le 30 juin).
 */
interface DurationArithmetic {
  monthMode: boolean;
  finishFrom(start: ISODate, task: Pick<Task, "durationDays" | "type" | "durationUnits">, calendar: WorkingCalendarLike): ISODate;
  startFrom(finish: ISODate, task: Pick<Task, "durationDays" | "type" | "durationUnits">, calendar: WorkingCalendarLike): ISODate;
  forward(predStart: ISODate, predFinish: ISODate, successor: Pick<Task, "durationDays" | "type" | "durationUnits">, dependency: Dependency, calendar: WorkingCalendarLike): ISODate;
  backward(succLatestStart: ISODate, succLatestFinish: ISODate, predecessor: Pick<Task, "durationDays" | "type" | "durationUnits">, dependency: Dependency, calendar: WorkingCalendarLike): ISODate;
  distance(from: ISODate, to: ISODate, calendar: WorkingCalendarLike): number;
}

function taskMonths(task: Pick<Task, "durationDays" | "type" | "durationUnits">) {
  if (task.type === "MILESTONE" || task.type === "SUMMARY") return 0;
  if (typeof task.durationUnits === "number" && task.durationUnits > 0) return task.durationUnits;
  return Math.max(inferMonths(Math.max(task.durationDays, 1)), 0.05);
}

function lagMonths(dependency: Dependency) {
  if (typeof dependency.lagUnits === "number") return dependency.lagUnits;
  return dependency.lagDays ? inferMonths(dependency.lagDays) : 0;
}

function createArithmetic(monthMode: boolean): DurationArithmetic {
  if (!monthMode) {
    return {
      monthMode,
      finishFrom: (start, task, calendar) => durationToFinishDate(start, getTaskDuration(task), calendar),
      startFrom: (finish, task, calendar) => finishToStartDate(finish, getTaskDuration(task), calendar),
      forward: (ps, pf, succ, dep, cal) => getForwardConstraintStart(ps, pf, getTaskDuration(succ), dep, cal),
      backward: (ls, lf, pred, dep, cal) => getBackwardConstraintFinish(ls, lf, getTaskDuration(pred), dep, cal),
      distance: (from, to, cal) => workingDayDistance(from, to, cal),
    };
  }
  return {
    monthMode,
    finishFrom: (start, task, calendar) => monthFinish(start, taskMonths(task), calendar),
    startFrom: (finish, task, calendar) => monthStart(finish, taskMonths(task), calendar),
    forward: (ps, pf, succ, dep, cal) => {
      const lag = lagMonths(dep);
      switch (dep.type) {
        case "FS":
          return monthAfter(pf, lag, cal);
        case "SS":
          return monthShift(ps, lag, cal, 1);
        case "FF":
          return monthStart(monthFinishShift(pf, lag, cal), taskMonths(succ), cal);
        case "SF":
          return monthStart(monthFinishShift(addCalendarDaysSafe(ps, -1), lag, cal), taskMonths(succ), cal);
        default:
          return pf;
      }
    },
    backward: (ls, lf, pred, dep, cal) => {
      const lag = lagMonths(dep);
      switch (dep.type) {
        case "FS":
          // fin au plus tard = veille de (début au plus tard − délai)
          return monthFinishShift(addCalendarDaysSafe(ls, -1), -lag, cal);
        case "SS":
          return monthFinish(monthShift(ls, -lag, cal, 1), taskMonths(pred), cal);
        case "FF":
          return monthFinishShift(lf, -lag, cal);
        case "SF":
          return monthFinish(monthShift(addCalendarDaysSafe(lf, 1), -lag, cal, 1), taskMonths(pred), cal);
        default:
          return lf;
      }
    },
    distance: (from, to, cal) => workingDayDistance(from, to, cal),
  };
}

function addCalendarDaysSafe(date: ISODate, amount: number): ISODate {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
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
  // Mode MOIS : planification en mois calendaires → tous les jours comptent
  // (un mois commence le 1er même si c'est un samedi). Les charges ressources
  // restent, elles, réparties sur les jours ouvrés.
  const monthMode = project.project.timeUnit === "mois";
  const monthCalendar: WorkingCalendarLike = {
    ...project.calendar,
    workingDays: [1, 2, 3, 4, 5, 6, 7],
    exceptions: [],
  } as WorkingCalendarLike;

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
        calendar: taskCalendarMap.get(task.id) ?? (monthMode ? monthCalendar : project.calendar),
      };
    }

    return externalTaskMap.get(getTaskKey(projectId, taskId)) ?? null;
  }

  for (const node of hierarchy) {
    const childIds = childrenMap.get(node.task.id) ?? [];
    const normalizedDurationDays = deriveTaskDurationDays(node.task, project);
    const progressPercent = Math.min(Math.max(node.task.progressPercent, 0), 100);
    taskCalendarMap.set(node.task.id, monthMode ? monthCalendar : getTaskWorkingCalendar(project, node.task));
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
  const calendar = monthMode ? (monthCalendar as typeof project.calendar) : project.calendar;
  const arith = createArithmetic(monthMode);
  const statusDate = resolveStatusDate(project, options.statusDate);
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
      // Les liens ressources (nivellement) ne contraignent pas le « au plus tôt pur ».
      if (predEarliestStart && predEarliestFinish && dependency.kind !== "RESOURCE") {
        const c = arith.forward(predEarliestStart, predEarliestFinish, task, dependency, taskCalendar);
        if (compareIsoDates(c, earliestStart) > 0) earliestStart = c;
      }
      if (predecessor.scheduledStartDate && predecessor.scheduledFinishDate) {
        const c = arith.forward(
          predecessor.scheduledStartDate,
          predecessor.scheduledFinishDate,
          task,
          dependency,
          taskCalendar,
        );
        if (compareIsoDates(c, scheduledStart) > 0) scheduledStart = c;
      }
    }

    // ── Date d'état (data date, façon P6 / « replanifier le travail restant ») ──
    // Un LT non commencé ne peut plus démarrer avant la date d'état ; un LT en
    // cours voit son reste à faire replanifié à partir de cette date.
    const started = Boolean(task.actualStartDate) || task.progressPercent > 0;
    const finished = task.status === "DONE" || task.progressPercent >= 100;
    if (statusDate && !finished && !started) {
      const floor = normalizeWorkingDate(statusDate, taskCalendar);
      if (compareIsoDates(floor, earliestStart) > 0) earliestStart = floor;
      if (compareIsoDates(floor, scheduledStart) > 0) scheduledStart = floor;
    }

    task.earliestStartDate = earliestStart;
    task.earliestFinishDate = arith.finishFrom(earliestStart, task, taskCalendar);

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
    } else if (statusDate && (started || finished) && task.actualStartDate) {
      // Avancement réel : début réel ; fin réelle si terminé, sinon
      // max(fin théorique, date d'état + reste à faire).
      task.scheduledStartDate = task.actualStartDate;
      if (finished) {
        task.scheduledFinishDate =
          task.actualFinishDate ?? arith.finishFrom(task.actualStartDate, task, taskCalendar);
      } else {
        const planned = arith.finishFrom(task.actualStartDate, task, taskCalendar);
        const remainingShare = Math.max(0, 1 - task.progressPercent / 100);
        const remainingTask = {
          ...task,
          durationDays: Math.max(1, Math.ceil(getTaskDuration(task) * remainingShare)),
          durationUnits:
            typeof task.durationUnits === "number" ? task.durationUnits * remainingShare : task.durationUnits,
        };
        const fromStatus = arith.finishFrom(normalizeWorkingDate(statusDate, taskCalendar), remainingTask, taskCalendar);
        task.scheduledFinishDate = compareIsoDates(fromStatus, planned) > 0 ? fromStatus : planned;
      }
    } else if (statusDate && started && !finished) {
      // En cours sans début réel saisi : le reste à faire part de la date d'état.
      task.scheduledStartDate = scheduledStart;
      const planned = arith.finishFrom(scheduledStart, task, taskCalendar);
      const remainingShare = Math.max(0, 1 - task.progressPercent / 100);
      const remainingTask = {
        ...task,
        durationDays: Math.max(1, Math.ceil(getTaskDuration(task) * remainingShare)),
        durationUnits:
          typeof task.durationUnits === "number" ? task.durationUnits * remainingShare : task.durationUnits,
      };
      const fromStatus = arith.finishFrom(normalizeWorkingDate(statusDate, taskCalendar), remainingTask, taskCalendar);
      task.scheduledFinishDate = compareIsoDates(fromStatus, planned) > 0 ? fromStatus : planned;
    } else {
      task.scheduledStartDate = scheduledStart;
      task.scheduledFinishDate = arith.finishFrom(scheduledStart, task, taskCalendar);
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

          return arith.backward(
            successor.latestStartDate,
            successor.latestFinishDate,
            task,
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
    task.latestStartDate = arith.startFrom(latestFinish, task, taskCalendar);
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
    if (arith.monthMode) {
      task.totalSlackUnits = monthsBetween(task.scheduledStartDate, task.latestStartDate);
      task.freeSlackUnits =
        getFreeSlackMonths(task, outgoingMap, resolveTaskReference) ?? task.totalSlackUnits;
      // En mode mois, la criticité suit la marge en mois (évite les « 0,03 mois » parasites).
      task.isCritical = task.totalSlackUnits <= 0.01;
    } else {
      const unit = project.project.timeUnit ?? "jours";
      task.totalSlackUnits = fromWorkingDays(task.totalSlackDays ?? 0, unit, calendar.hoursPerDay);
      task.freeSlackUnits = fromWorkingDays(task.freeSlackDays ?? 0, unit, calendar.hoursPerDay);
    }
  }

  // ── Chemin pseudo-critique (CdC p. 4) : coefficient au choix du planificateur ──
  {
    const coefficient =
      typeof project.project.pseudoCriticalCoefficient === "number" &&
      project.project.pseudoCriticalCoefficient >= 1
        ? project.project.pseudoCriticalCoefficient
        : DEFAULT_PSEUDO_CRITICAL_COEFFICIENT;
    const slackOf = (t: MutableScheduledTask) =>
      arith.monthMode ? t.totalSlackUnits ?? 0 : t.totalSlackDays ?? 0;
    const positives = executableTasks
      .map((t) => scheduledMap.get(t.id)!)
      .filter((t) => !t.isCritical && slackOf(t) > 0)
      .map(slackOf);
    const minPositive = positives.length ? Math.min(...positives) : 0;
    const threshold = minPositive * coefficient + 1e-9;
    for (const t of executableTasks) {
      const st = scheduledMap.get(t.id)!;
      st.isPseudoCritical = !st.isCritical && minPositive > 0 && slackOf(st) > 0 && slackOf(st) <= threshold;
    }
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
    statusDate,
  };
}

/** Marge libre en mois calendaires (mode mois). */
function getFreeSlackMonths(
  task: MutableScheduledTask,
  outgoingMap: Map<string, Dependency[]>,
  resolveTaskReference: (
    projectId: string,
    taskId: string,
  ) => (DependencyTaskReference & { calendar: WorkingCalendarLike }) | null,
): number | null {
  if (!task.scheduledStartDate || !task.scheduledFinishDate) return null;
  const successors = outgoingMap.get(task.id) ?? [];
  if (!successors.length) return null;
  const values: number[] = [];
  for (const dependency of successors) {
    const successor = resolveTaskReference(dependency.successorProjectId, dependency.successorTaskId);
    if (!successor?.scheduledStartDate || !successor.scheduledFinishDate) continue;
    const cal = successor.calendar;
    const lag = lagMonths(dependency);
    switch (dependency.type) {
      case "FS":
        values.push(monthsBetween(monthAfter(task.scheduledFinishDate, lag, cal), successor.scheduledStartDate));
        break;
      case "SS":
        values.push(monthsBetween(monthShift(task.scheduledStartDate, lag, cal), successor.scheduledStartDate));
        break;
      case "FF":
        values.push(
          monthsBetween(
            addCalendarDaysSafe(monthFinishShift(task.scheduledFinishDate, lag, cal), 1),
            addCalendarDaysSafe(successor.scheduledFinishDate, 1),
          ),
        );
        break;
      case "SF":
        values.push(monthsBetween(monthShift(task.scheduledStartDate, lag, cal), addCalendarDaysSafe(successor.scheduledFinishDate, 1)));
        break;
    }
  }
  return values.length ? Math.max(0, Math.min(...values)) : null;
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
