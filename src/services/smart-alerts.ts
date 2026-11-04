import { compareIsoDates, workingDayDistance } from "@/lib/planning/date-utils";
import { calculateBridgeCostImpact } from "@/services/cost-bridge";
import {
  calculateEarnedSchedule,
  runMonteCarloSchedule,
} from "@/services/advanced-planning";
import { createNotification, type NotificationChannel } from "@/services/notifications";
import { listProjectViews } from "@/services/projects";
import type { ISODate, ProjectView, ScheduledTask } from "@/types/planning";

export enum AlertType {
  CRITICAL_PATH_CHANGED = "CRITICAL_PATH_CHANGED",
  MILESTONE_AT_RISK = "MILESTONE_AT_RISK",
  MILESTONE_DELAYED = "MILESTONE_DELAYED",
  RESOURCE_OVERLOAD = "RESOURCE_OVERLOAD",
  SCHEDULE_SLIP_TREND = "SCHEDULE_SLIP_TREND",
  BASELINE_DEVIATION = "BASELINE_DEVIATION",
  COST_IMPACT = "COST_IMPACT",
  MONTE_CARLO_DEGRADED = "MONTE_CARLO_DEGRADED",
  DEPENDENCY_CHAIN_RISK = "DEPENDENCY_CHAIN_RISK",
  FREE_FLOAT_CONSUMED = "FREE_FLOAT_CONSUMED",
  SUBCONTRACTOR_AT_RISK = "SUBCONTRACTOR_AT_RISK",
}

export interface SmartAlert {
  id: string;
  type: AlertType;
  severity: "critical" | "warning" | "info";
  projectId: string;
  taskId?: string;
  message: string;
  detectedAt: string;
  acknowledgedAt?: string;
  autoResolvedAt?: string;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10) as ISODate;
}

function buildId(view: ProjectView, type: AlertType, suffix = "global") {
  return `${view.aggregate.project.id}:${type}:${suffix}`;
}

function addAlert(
  alerts: SmartAlert[],
  view: ProjectView,
  type: AlertType,
  severity: SmartAlert["severity"],
  message: string,
  taskId?: string,
) {
  alerts.push({
    id: buildId(view, type, taskId ?? message.slice(0, 48).toLowerCase().replace(/\W+/g, "-")),
    type,
    severity,
    projectId: view.aggregate.project.id,
    taskId,
    message,
    detectedAt: new Date().toISOString(),
  });
}

function assignedResourceNames(view: ProjectView, taskId: string) {
  const resourceById = new Map(
    view.aggregate.resources.map((resource) => [resource.id, resource]),
  );
  return view.aggregate.assignments
    .filter((assignment) => assignment.taskId === taskId)
    .map((assignment) => resourceById.get(assignment.resourceId)?.name)
    .filter(Boolean) as string[];
}

function getSuccessors(view: ProjectView, taskId: string) {
  return view.dependencyNetwork.filter(
    (entry) =>
      entry.predecessor.projectId === view.aggregate.project.id &&
      entry.predecessor.taskId === taskId,
  );
}

function isDelayed(task: ScheduledTask, date = todayIso()) {
  return (
    task.status !== "DONE" &&
    Boolean(task.scheduledFinishDate) &&
    compareIsoDates(task.scheduledFinishDate, date) < 0
  );
}

export function buildSmartAlerts(view: ProjectView): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const today = todayIso();
  const currency = view.aggregate.project.currencyCode;

  for (const issue of view.schedule.issues.slice(0, 8)) {
    addAlert(
      alerts,
      view,
      issue.code === "DEADLINE_MISSED"
        ? AlertType.MILESTONE_DELAYED
        : AlertType.BASELINE_DEVIATION,
      issue.code === "DEADLINE_MISSED" ? "critical" : "warning",
      issue.message,
      issue.taskId,
    );
  }

  for (const task of view.tasks) {
    if (task.type !== "MILESTONE" || !task.scheduledFinishDate) {
      continue;
    }

    if (isDelayed(task, today)) {
      addAlert(
        alerts,
        view,
        AlertType.MILESTONE_DELAYED,
        "critical",
        `Jalon depasse: ${task.wbsCode} ${task.name} devait finir le ${task.scheduledFinishDate}.`,
        task.id,
      );
      continue;
    }

    const daysToMilestone = workingDayDistance(today, task.scheduledFinishDate, view.aggregate.calendar);
    if (daysToMilestone <= 14 && (task.isCritical || task.freeSlackDays === 0)) {
      addAlert(
        alerts,
        view,
        AlertType.MILESTONE_AT_RISK,
        "critical",
        `Jalon contractuel menace sous ${Math.max(daysToMilestone, 0)} jour(s): ${task.name}.`,
        task.id,
      );
    }
  }

  for (const summary of view.resourceSummaries) {
    if (summary.overloadedWeeks > 0) {
      addAlert(
        alerts,
        view,
        AlertType.RESOURCE_OVERLOAD,
        summary.maxAllocationPct >= 140 ? "critical" : "warning",
        `${summary.resource.name} charge a ${Math.round(summary.maxAllocationPct)}% sur ${summary.overloadedWeeks} semaine(s).`,
        summary.resource.id,
      );
    }
  }

  for (const task of view.tasks.filter((entry) => !entry.isSummary)) {
    const variance = view.baselineVarianceByTaskId[task.id];
    if ((variance?.finishVarianceDays ?? 0) >= 5) {
      addAlert(
        alerts,
        view,
        AlertType.BASELINE_DEVIATION,
        "warning",
        `${task.wbsCode} ${task.name} derive de ${variance?.finishVarianceDays} jour(s) vs baseline.`,
        task.id,
      );
    }

    if (
      task.status !== "DONE" &&
      task.freeSlackDays != null &&
      task.freeSlackDays <= 2 &&
      !task.isCritical
    ) {
      addAlert(
        alerts,
        view,
        AlertType.FREE_FLOAT_CONSUMED,
        "warning",
        `${task.wbsCode} ${task.name} a consomme sa marge libre: ${task.freeSlackDays} jour(s) restant(s).`,
        task.id,
      );
    }

    if (isDelayed(task, today) && getSuccessors(view, task.id).length > 0) {
      addAlert(
        alerts,
        view,
        AlertType.DEPENDENCY_CHAIN_RISK,
        task.isCritical ? "critical" : "warning",
        `${task.wbsCode} ${task.name} est en retard et pilote ${getSuccessors(view, task.id).length} successeur(s).`,
        task.id,
      );
    }
  }

  const costImpact = calculateBridgeCostImpact(view);
  if (costImpact.scheduleSlipDays > 0 && costImpact.totalCostImpact > 0) {
    addAlert(
      alerts,
      view,
      AlertType.COST_IMPACT,
      costImpact.totalCostImpact > 50_000 ? "critical" : "warning",
      `Glissement de ${costImpact.scheduleSlipDays} jour(s): impact cout estime ${Math.round(costImpact.totalCostImpact).toLocaleString("fr-FR")} ${currency}.`,
    );
  }

  const earnedSchedule = calculateEarnedSchedule(view);
  if ((earnedSchedule.SPI_t ?? 1) < 0.92 || earnedSchedule.predictedSlip >= 7) {
    addAlert(
      alerts,
      view,
      AlertType.SCHEDULE_SLIP_TREND,
      earnedSchedule.predictedSlip >= 14 ? "critical" : "warning",
      `Tendance delai negative: SPI_t ${earnedSchedule.SPI_t?.toFixed(2) ?? "n/a"}, fin projet projetee ${earnedSchedule.IEAC_t ?? "n/a"}.`,
    );
  }

  const monteCarlo = runMonteCarloSchedule(view, undefined, 600);
  if (monteCarlo.p80 && view.schedule.projectFinishDate) {
    const p80Slip = workingDayDistance(
      view.schedule.projectFinishDate,
      monteCarlo.p80,
      view.aggregate.calendar,
    );
    if (p80Slip >= 7) {
      addAlert(
        alerts,
        view,
        AlertType.MONTE_CARLO_DEGRADED,
        p80Slip >= 15 ? "critical" : "warning",
        `Risque probabiliste degrade: P80 a ${p80Slip} jour(s) au-dela du planning courant.`,
      );
    }
  }

  const delayedByResource = new Map<string, ScheduledTask[]>();
  for (const task of view.tasks.filter((entry) => !entry.isSummary && isDelayed(entry, today))) {
    for (const resourceName of assignedResourceNames(view, task.id)) {
      const bucket = delayedByResource.get(resourceName) ?? [];
      bucket.push(task);
      delayedByResource.set(resourceName, bucket);
    }
  }
  for (const [resourceName, tasks] of delayedByResource.entries()) {
    if (tasks.length >= 3) {
      addAlert(
        alerts,
        view,
        AlertType.SUBCONTRACTOR_AT_RISK,
        "warning",
        `${resourceName} concentre ${tasks.length} taches en retard: sous-traitant ou equipe a risque.`,
        tasks[0]?.id,
      );
    }
  }

  return alerts.sort((left, right) => {
    const severityRank = { critical: 0, warning: 1, info: 2 };
    return severityRank[left.severity] - severityRank[right.severity] || left.type.localeCompare(right.type);
  });
}

export async function listWorkspaceSmartAlerts(workspaceId: string) {
  const views = await listProjectViews({ includeArchived: false, workspaceId });
  return views.flatMap((view) => buildSmartAlerts(view));
}

export async function createSmartAlertDigest(input: {
  workspaceId: string;
  userId: string;
  channel?: NotificationChannel;
}) {
  const alerts = await listWorkspaceSmartAlerts(input.workspaceId);
  const critical = alerts.filter((alert) => alert.severity === "critical");
  const warning = alerts.filter((alert) => alert.severity === "warning");
  await createNotification({
    workspaceId: input.workspaceId,
    userId: input.userId,
    channel: input.channel ?? "IN_APP",
    title: `Etat de vos projets: ${critical.length} critique(s), ${warning.length} avertissement(s)`,
    body:
      alerts
        .slice(0, 12)
        .map((alert) => `[${alert.severity}] ${alert.message}`)
        .join("\n") || "Aucune alerte active detectee.",
    entityType: "SmartAlertDigest",
    entityId: input.workspaceId,
  });
  return { critical: critical.length, warning: warning.length, total: alerts.length };
}
