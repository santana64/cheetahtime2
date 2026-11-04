import { buildSchedule } from "@/lib/planning/schedule-engine";
import {
  addCalendarDays,
  addWorkingDays,
  compareIsoDates,
  formatIsoDate,
  maxIsoDate,
  minIsoDate,
  parseIsoDate,
  workingDayDistance,
} from "@/lib/planning/date-utils";
import {
  getResourceDailyCapacityHours,
  getTaskPlannedCost,
} from "@/lib/planning/work-model";
import { calculateBridgeCostImpact } from "@/services/cost-bridge";
import { listProjectViews } from "@/services/projects";
import type {
  BaselineTaskSnapshot,
  ISODate,
  ProjectAggregate,
  ProjectView,
  ScheduledTask,
} from "@/types/planning";

export interface EarnedScheduleMetrics {
  ES: number;
  AT: number;
  SPI_t: number | null;
  IEAC_t: ISODate | null;
  predictedSlip: number;
  earnedScheduleDate: ISODate | null;
}

export interface TaskRisk {
  taskId: string;
  durationOptimistic: number;
  durationMostLikely: number;
  durationPessimistic: number;
  correlationGroup?: string;
}

export interface MonteCarloResult {
  iterations: number;
  p10: ISODate | null;
  p50: ISODate | null;
  p80: ISODate | null;
  p90: ISODate | null;
  histogram: Array<{ date: ISODate; probability: number }>;
  criticalTasks: string[];
}

export interface ProgressTrend {
  date: ISODate;
  plannedProgress: number;
  actualProgress: number;
  forecastProgress: number;
  plannedCost: number;
  earnedValue: number;
  forecastCost: number;
  earnedSchedule: number;
  forecastFinish: ISODate | null;
}

export interface LookAheadTask {
  task: ScheduledTask;
  status: "late" | "at_risk" | "ok";
  reason: string;
  resourceNames: string[];
}

export interface NetworkNode {
  id: string;
  label: string;
  type: ScheduledTask["type"];
  critical: boolean;
  depth: number;
}

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  lagDays: number;
  external: boolean;
}

export interface WhatIfInput {
  shiftTask?: {
    taskId: string;
    days: number;
  };
  addResource?: {
    taskId: string;
    resourceName?: string;
    dailyRate?: number;
    compressionPercent?: number;
  };
  removeLot?: {
    taskId: string;
  };
}

export interface WhatIfResult {
  projectFinishDate: ISODate | null;
  simulatedFinishDate: ISODate | null;
  finishDeltaDays: number;
  plannedCostDelta: number;
  /** Coût du glissement : jours de dérive × charge ressource/jour (méthode FGF). */
  costOfDelayDelta: number;
  criticalPathTaskIds: string[];
  changedTaskIds: string[];
  summary: string;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateToWeekDistance(start?: ISODate | null, finish?: ISODate | null) {
  if (!start || !finish) {
    return 0;
  }

  const days = Math.max(
    0,
    Math.round(
      (parseIsoDate(finish).getTime() - parseIsoDate(start).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );
  return round(days / 7, 2);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, round(value, 1)));
}

function getExecutableTasks(view: ProjectView) {
  return view.tasks.filter((task) => !task.isSummary);
}

function getBaselineStart(view: ProjectView) {
  return (
    minIsoDate(
      view.activeBaseline?.snapshots.map((snapshot) => snapshot.startDate ?? null) ?? [],
    ) ??
    view.schedule.projectStartDate ??
    view.aggregate.project.targetStartDate
  );
}

function getBaselineFinish(view: ProjectView) {
  return (
    maxIsoDate(
      view.activeBaseline?.snapshots.map((snapshot) => snapshot.finishDate ?? null) ?? [],
    ) ??
    view.aggregate.project.targetFinishDate ??
    view.schedule.projectFinishDate ??
    view.aggregate.project.targetStartDate
  );
}

function getPlannedCostAtDate(
  snapshots: BaselineTaskSnapshot[],
  date: ISODate,
) {
  return snapshots.reduce((sum, snapshot) => {
    if (!snapshot.startDate || !snapshot.finishDate) {
      return sum;
    }

    if (compareIsoDates(date, snapshot.startDate) < 0) {
      return sum;
    }

    if (compareIsoDates(date, snapshot.finishDate) >= 0) {
      return sum + snapshot.plannedCost;
    }

    const totalDays = Math.max(
      1,
      workingDayDistance(snapshot.startDate, snapshot.finishDate, {
        workingDays: [1, 2, 3, 4, 5],
        hoursPerDay: 8,
        exceptions: [],
      }),
    );
    const elapsedDays = Math.max(
      0,
      workingDayDistance(snapshot.startDate, date, {
        workingDays: [1, 2, 3, 4, 5],
        hoursPerDay: 8,
        exceptions: [],
      }),
    );
    return sum + snapshot.plannedCost * Math.min(elapsedDays / totalDays, 1);
  }, 0);
}

function addCalendarDaysToDate(date: ISODate, amount: number) {
  return formatIsoDate(
    new Date(parseIsoDate(date).getTime() + amount * 24 * 60 * 60 * 1000),
  );
}

export function calculateEarnedSchedule(view: ProjectView): EarnedScheduleMetrics {
  const baseline = view.activeBaseline;
  const baselineStart = getBaselineStart(view);
  const baselineFinish = getBaselineFinish(view);
  const statusDate = todayIso();

  if (!baseline || !baseline.snapshots.length || !view.metrics.earnedValue) {
    return {
      ES: 0,
      AT: dateToWeekDistance(baselineStart, statusDate),
      SPI_t: null,
      IEAC_t: null,
      predictedSlip: view.metrics.scheduleSlipDays ?? 0,
      earnedScheduleDate: null,
    };
  }

  const snapshots = baseline.snapshots;
  const earnedValue = view.metrics.earnedValue ?? 0;
  let cursor = baselineStart;
  let earnedScheduleDate = baselineStart;
  let guard = 0;

  while (compareIsoDates(cursor, baselineFinish) <= 0 && guard < 1000) {
    if (getPlannedCostAtDate(snapshots, cursor) >= earnedValue) {
      earnedScheduleDate = cursor;
      break;
    }
    earnedScheduleDate = cursor;
    cursor = addCalendarDays(cursor, 1);
    guard += 1;
  }

  const ES = dateToWeekDistance(baselineStart, earnedScheduleDate);
  const AT = Math.max(dateToWeekDistance(baselineStart, statusDate), 0.01);
  const SPI_t = ES > 0 ? round(ES / AT, 3) : null;
  const plannedDurationDays = Math.max(
    1,
    Math.round(
      (parseIsoDate(baselineFinish).getTime() - parseIsoDate(baselineStart).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );
  const ieacDurationDays =
    SPI_t && SPI_t > 0 ? Math.ceil(plannedDurationDays / SPI_t) : plannedDurationDays;
  const IEAC_t = addCalendarDaysToDate(baselineStart, ieacDurationDays);
  const predictedSlip = Math.max(
    0,
    workingDayDistance(baselineFinish, IEAC_t, view.aggregate.calendar),
  );

  return {
    ES,
    AT,
    SPI_t,
    IEAC_t,
    predictedSlip,
    earnedScheduleDate,
  };
}

function actualProgressAtDate(view: ProjectView, date: ISODate) {
  const executableTasks = getExecutableTasks(view);
  const weightedDuration = executableTasks.reduce(
    (sum, task) => sum + Math.max(task.durationDays, task.type === "MILESTONE" ? 1 : 0),
    0,
  );

  if (!weightedDuration) {
    return 0;
  }

  return clampPercent(
    executableTasks.reduce((sum, task) => {
      const weight = Math.max(task.durationDays, task.type === "MILESTONE" ? 1 : 0);
      if (task.actualFinishDate && compareIsoDates(task.actualFinishDate, date) <= 0) {
        return sum + weight * 100;
      }
      if (task.actualStartDate && compareIsoDates(task.actualStartDate, date) <= 0) {
        return sum + weight * task.progressPercent;
      }
      if (
        task.scheduledStartDate &&
        task.scheduledFinishDate &&
        compareIsoDates(task.scheduledStartDate, date) <= 0 &&
        compareIsoDates(date, task.scheduledFinishDate) <= 0
      ) {
        return sum + weight * task.progressPercent;
      }
      return sum;
    }, 0) / weightedDuration,
  );
}

export function buildProgressTrend(view: ProjectView): ProgressTrend[] {
  const baseline = view.activeBaseline;
  const start = getBaselineStart(view);
  const finish =
    maxIsoDate([
      getBaselineFinish(view),
      view.schedule.projectFinishDate,
      view.aggregate.project.targetFinishDate,
    ]) ?? start;
  const totalBaselineCost =
    baseline?.snapshots.reduce((sum, snapshot) => sum + snapshot.plannedCost, 0) ??
    view.metrics.totalPlannedCost;
  const earnedSchedule = calculateEarnedSchedule(view);
  const points: ProgressTrend[] = [];
  let cursor = start;
  let guard = 0;

  while (compareIsoDates(cursor, finish) <= 0 && guard < 160) {
    const plannedCost = baseline
      ? getPlannedCostAtDate(baseline.snapshots, cursor)
      : view.metrics.totalPlannedCost *
        Math.min(
          guard / Math.max(1, Math.ceil(dateToWeekDistance(start, finish))),
          1,
        );
    const plannedProgress = totalBaselineCost > 0
      ? clampPercent((plannedCost / totalBaselineCost) * 100)
      : 0;
    const actualProgress = actualProgressAtDate(view, cursor);
    const forecastProgress =
      view.schedule.projectFinishDate && compareIsoDates(cursor, view.schedule.projectFinishDate) >= 0
        ? 100
        : clampPercent(Math.max(actualProgress, plannedProgress * 0.85));

    points.push({
      date: cursor,
      plannedProgress,
      actualProgress,
      forecastProgress,
      plannedCost: round(plannedCost),
      earnedValue: round((view.metrics.earnedValue ?? 0) * (actualProgress / Math.max(view.metrics.overallProgress, 1))),
      forecastCost: round(view.metrics.totalActualCost + view.metrics.totalRemainingWorkHours * 0),
      earnedSchedule: earnedSchedule.ES,
      forecastFinish: earnedSchedule.IEAC_t ?? view.schedule.projectFinishDate ?? null,
    });

    cursor = addCalendarDays(cursor, 7);
    guard += 1;
  }

  return points;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function triangularSample(random: () => number, optimistic: number, likely: number, pessimistic: number) {
  const min = Math.max(0, optimistic);
  const mode = Math.max(min, likely);
  const max = Math.max(mode, pessimistic);
  if (max <= min) {
    return Math.max(0, Math.round(mode));
  }

  const u = random();
  const c = (mode - min) / (max - min);
  if (u < c) {
    return Math.round(min + Math.sqrt(u * (max - min) * (mode - min)));
  }
  return Math.round(max - Math.sqrt((1 - u) * (max - min) * (max - mode)));
}

export function buildDefaultTaskRisks(view: ProjectView): TaskRisk[] {
  return getExecutableTasks(view).map((task) => {
    const duration = Math.max(task.durationDays, task.type === "MILESTONE" ? 0 : 1);
    return {
      taskId: task.id,
      durationOptimistic: Math.max(task.type === "MILESTONE" ? 0 : 1, Math.floor(duration * 0.8)),
      durationMostLikely: duration,
      durationPessimistic: Math.max(duration, Math.ceil(duration * 1.45)),
      correlationGroup: task.priority === "HIGH" || task.priority === "URGENT" ? "critical-delivery" : undefined,
    };
  });
}

export function runMonteCarloSchedule(
  view: ProjectView,
  risks: TaskRisk[] = buildDefaultTaskRisks(view),
  iterations = 10_000,
): MonteCarloResult {
  const cappedIterations = Math.min(Math.max(Math.round(iterations), 100), 10_000);
  const riskMap = new Map(risks.map((risk) => [risk.taskId, risk]));
  const finishes: ISODate[] = [];
  const finishCounts = new Map<ISODate, number>();
  const criticalCounts = new Map<string, number>();
  const random = seededRandom(
    view.aggregate.project.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 2166136261),
  );

  for (let index = 0; index < cappedIterations; index += 1) {
    const simulated: ProjectAggregate = {
      ...view.aggregate,
      tasks: view.aggregate.tasks.map((task) => {
        const risk = riskMap.get(task.id);
        if (!risk || task.type === "SUMMARY") {
          return task;
        }

        return {
          ...task,
          durationDays:
            task.type === "MILESTONE"
              ? 0
              : Math.max(
                  1,
                  triangularSample(
                    random,
                    risk.durationOptimistic,
                    risk.durationMostLikely,
                    risk.durationPessimistic,
                  ),
                ),
        };
      }),
    };
    const schedule = buildSchedule(simulated);
    if (schedule.projectFinishDate) {
      finishes.push(schedule.projectFinishDate);
      finishCounts.set(schedule.projectFinishDate, (finishCounts.get(schedule.projectFinishDate) ?? 0) + 1);
    }
    for (const taskId of schedule.criticalPathTaskIds) {
      criticalCounts.set(taskId, (criticalCounts.get(taskId) ?? 0) + 1);
    }
  }

  finishes.sort((left, right) => left.localeCompare(right));
  const percentile = (p: number) =>
    finishes.length ? finishes[Math.min(finishes.length - 1, Math.floor((finishes.length - 1) * p))] : null;

  return {
    iterations: cappedIterations,
    p10: percentile(0.1),
    p50: percentile(0.5),
    p80: percentile(0.8),
    p90: percentile(0.9),
    histogram: [...finishCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, count]) => ({
        date,
        probability: round(count / cappedIterations, 4),
      })),
    criticalTasks: [...criticalCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12)
      .map(([taskId]) => taskId),
  };
}

function collectDescendantIds(tasks: ScheduledTask[], taskId: string) {
  const childrenByParent = new Map<string, ScheduledTask[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const children = childrenByParent.get(task.parentId) ?? [];
    children.push(task);
    childrenByParent.set(task.parentId, children);
  }
  const ids = new Set<string>();
  const queue = [...(childrenByParent.get(taskId) ?? [])];
  while (queue.length) {
    const task = queue.shift()!;
    ids.add(task.id);
    queue.push(...(childrenByParent.get(task.id) ?? []));
  }
  return ids;
}

export function simulateWhatIf(view: ProjectView, input: WhatIfInput): WhatIfResult {
  const changedTaskIds = new Set<string>();
  const simulated: ProjectAggregate = structuredClone(view.aggregate);
  const beforeCost = view.tasks.reduce(
    (sum, task) => sum + (task.isSummary ? 0 : getTaskPlannedCost(task, view.aggregate)),
    0,
  );

  if (input.shiftTask) {
    const task = simulated.tasks.find((entry) => entry.id === input.shiftTask?.taskId);
    const scheduled = view.schedule.tasksById[input.shiftTask.taskId];
    if (task && scheduled?.scheduledStartDate && scheduled.scheduledFinishDate) {
      task.schedulingMode = "MANUAL";
      task.manualStartDate = addWorkingDays(
        scheduled.scheduledStartDate,
        input.shiftTask.days,
        simulated.calendar,
      );
      task.manualFinishDate = addWorkingDays(
        scheduled.scheduledFinishDate,
        input.shiftTask.days,
        simulated.calendar,
      );
      changedTaskIds.add(task.id);
    }
  }

  if (input.addResource) {
    const task = simulated.tasks.find((entry) => entry.id === input.addResource?.taskId);
    if (task && task.type === "TASK") {
      const compression = Math.max(0, Math.min(input.addResource.compressionPercent ?? 20, 80));
      task.durationDays = Math.max(1, Math.ceil(task.durationDays * (1 - compression / 100)));
      if (input.addResource.dailyRate) {
        task.effortHours = (task.effortHours ?? task.durationDays * simulated.calendar.hoursPerDay) +
          simulated.calendar.hoursPerDay;
      }
      changedTaskIds.add(task.id);
    }
  }

  if (input.removeLot) {
    const removedIds = collectDescendantIds(view.tasks, input.removeLot.taskId);
    removedIds.add(input.removeLot.taskId);
    simulated.tasks = simulated.tasks.filter((task) => !removedIds.has(task.id));
    simulated.dependencies = simulated.dependencies.filter(
      (dependency) =>
        !removedIds.has(dependency.predecessorTaskId) &&
        !removedIds.has(dependency.successorTaskId),
    );
    simulated.assignments = simulated.assignments.filter(
      (assignment) => !removedIds.has(assignment.taskId),
    );
    for (const taskId of removedIds) changedTaskIds.add(taskId);
  }

  const schedule = buildSchedule(simulated);
  const afterCost = simulated.tasks.reduce(
    (sum, task) => sum + (task.type === "SUMMARY" ? 0 : getTaskPlannedCost(task, simulated)),
    0,
  );
  const finishDeltaDays =
    view.schedule.projectFinishDate && schedule.projectFinishDate
      ? workingDayDistance(
          view.schedule.projectFinishDate,
          schedule.projectFinishDate,
          view.aggregate.calendar,
        )
      : 0;
  const currency = view.aggregate.project.currencyCode;

  // Coût du glissement (FGF) : jours de dérive × charge ressource/jour des tâches
  // impactées (à défaut, du chemin critique simulé).
  const burnTaskIds =
    changedTaskIds.size > 0
      ? [...changedTaskIds]
      : schedule.criticalPathTaskIds;
  const resourceMap = new Map(
    view.aggregate.resources.map((resource) => [resource.id, resource]),
  );
  const dailyBurn = burnTaskIds.reduce((total, taskId) => {
    const assignments = view.aggregate.assignments.filter(
      (assignment) => assignment.taskId === taskId,
    );
    return (
      total +
      assignments.reduce((sub, assignment) => {
        const resource = resourceMap.get(assignment.resourceId);
        if (!resource?.costRate) return sub;
        return (
          sub +
          resource.costRate *
            getResourceDailyCapacityHours(resource, view.aggregate) *
            (assignment.allocationPct / 100)
        );
      }, 0)
    );
  }, 0);
  const costOfDelayDelta = round(Math.max(finishDeltaDays, 0) * dailyBurn);
  const plannedCostDelta = round(afterCost - beforeCost);

  return {
    projectFinishDate: view.schedule.projectFinishDate ?? null,
    simulatedFinishDate: schedule.projectFinishDate ?? null,
    finishDeltaDays,
    plannedCostDelta,
    costOfDelayDelta,
    criticalPathTaskIds: schedule.criticalPathTaskIds,
    changedTaskIds: [...changedTaskIds],
    summary:
      finishDeltaDays === 0
        ? `Simulation sans impact net sur la date de fin. Delta coût planifié ${plannedCostDelta.toLocaleString("fr-FR")} ${currency}.`
        : `Glissement de ${finishDeltaDays > 0 ? "+" : ""}${finishDeltaDays} jour(s) sur la fin projet — coût du glissement estimé ${costOfDelayDelta.toLocaleString("fr-FR")} ${currency}.`,
  };
}

export function buildLookAhead(view: ProjectView, weeks = 4): LookAheadTask[] {
  const start = todayIso();
  const finish = addCalendarDays(start, Math.max(1, weeks) * 7);
  const resourceMap = new Map(
    view.aggregate.resources.map((resource) => [resource.id, resource.name]),
  );

  return getExecutableTasks(view)
    .filter((task) => {
      if (!task.scheduledStartDate || !task.scheduledFinishDate) return false;
      return (
        compareIsoDates(task.scheduledFinishDate, start) >= 0 &&
        compareIsoDates(task.scheduledStartDate, finish) <= 0
      );
    })
    .map((task): LookAheadTask => {
      const variance = view.baselineVarianceByTaskId[task.id];
      const late = task.scheduledFinishDate != null &&
        compareIsoDates(task.scheduledFinishDate, start) < 0 &&
        task.status !== "DONE";
      const atRisk =
        !late &&
        ((variance?.finishVarianceDays ?? 0) > 0 ||
          (task.freeSlackDays != null && task.freeSlackDays <= 2) ||
          task.isCritical);
      const assignments = view.aggregate.assignments.filter(
        (assignment) => assignment.taskId === task.id,
      );

      return {
        task,
        status: late ? "late" : atRisk ? "at_risk" : "ok",
        reason: late
          ? "Tâche en retard"
          : atRisk
            ? task.isCritical
              ? "Chemin critique"
              : "Marge faible ou écart baseline"
            : "Pret pour execution",
        resourceNames: assignments
          .map((assignment) => resourceMap.get(assignment.resourceId))
          .filter(Boolean) as string[],
      };
    })
    .sort((left, right) =>
      compareIsoDates(left.task.scheduledStartDate ?? null, right.task.scheduledStartDate ?? null),
    );
}

export function buildPertNetwork(view: ProjectView) {
  const nodes: NetworkNode[] = view.tasks.map((task) => ({
    id: task.id,
    label: `${task.wbsCode} ${task.name}`,
    type: task.type,
    critical: task.isCritical,
    depth: task.depth,
  }));
  const edges: NetworkEdge[] = view.dependencyNetwork.map((entry) => ({
    id: entry.dependency.id,
    source: entry.predecessor.taskId,
    target: entry.successor.taskId,
    type: entry.dependency.type,
    lagDays: entry.dependency.lagDays,
    external: entry.externalToProject,
  }));
  return { nodes, edges };
}

export function buildAdvancedPlanningSummary(view: ProjectView) {
  const earnedSchedule = calculateEarnedSchedule(view);
  const monteCarlo = runMonteCarloSchedule(view, undefined, 1500);
  const trends = buildProgressTrend(view);
  const costImpact = calculateBridgeCostImpact(view);

  return {
    generatedAt: new Date().toISOString(),
    projectId: view.aggregate.project.id,
    earnedSchedule,
    monteCarlo,
    trends,
    lookAhead: buildLookAhead(view, 4),
    network: buildPertNetwork(view),
    costImpact,
  };
}

export async function buildPortfolioRoadmap(workspaceId: string) {
  const views = await listProjectViews({ includeArchived: false, workspaceId });
  const sharedResourceBuckets = new Map<string, Array<{ projectId: string; taskId: string; week: string }>>();

  for (const view of views) {
    for (const summary of view.resourceSummaries) {
      for (const week of summary.loadByWeek) {
        if (week.allocationPct <= 100) continue;
        const key = `${summary.resource.name.toLowerCase()}|${summary.resource.role.toLowerCase()}|${week.weekLabel}`;
        const bucket = sharedResourceBuckets.get(key) ?? [];
        bucket.push({
          projectId: view.aggregate.project.id,
          taskId: summary.resource.id,
          week: week.weekLabel,
        });
        sharedResourceBuckets.set(key, bucket);
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    projects: views.map((view) => ({
      project: view.aggregate.project,
      finishDate: view.schedule.projectFinishDate,
      health: view.metrics.derivedHealth,
      milestones: view.tasks
        .filter((task) => task.type === "MILESTONE")
        .map((task) => ({
          taskId: task.id,
          name: task.name,
          wbsCode: task.wbsCode,
          date: task.scheduledFinishDate,
          critical: task.isCritical,
        })),
      criticalTasks: view.metrics.criticalTasks.slice(0, 8),
      resourceConflicts: view.resourceSummaries
        .filter((summary) => summary.overloadedWeeks > 0)
        .map((summary) => ({
          resourceId: summary.resource.id,
          name: summary.resource.name,
          maxAllocationPct: summary.maxAllocationPct,
          overloadedWeeks: summary.overloadedWeeks,
        })),
    })),
    sharedResourceConflicts: [...sharedResourceBuckets.entries()]
      .filter(([, refs]) => refs.length > 1)
      .map(([key, refs]) => ({ key, refs })),
  };
}

