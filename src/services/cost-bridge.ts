import {
  compareIsoDates,
  parseIsoDate,
} from "@/lib/planning/date-utils";
import { buildFgfLine, type FgfLine } from "@/lib/fgf/coutenance";
import {
  getResourceDailyCapacityHours,
  getTaskActualCost,
  getTaskPlannedCost,
} from "@/lib/planning/work-model";
import { getProjectView } from "@/services/projects";
import type {
  Assignment,
  Baseline,
  BaselineVariance,
  ISODate,
  ProjectAggregate,
  ProjectView,
  Resource,
  ScheduledTask,
} from "@/types/planning";

export const COST_BRIDGE_VERSION = "2026-05-18";

export type CostBridgeSignalType =
  | "schedule.slip"
  | "milestone.at_risk"
  | "progress.lag"
  | "baseline.new"
  | "resource.change";

export type CostBridgeSeverity = "critical" | "warning" | "info";

export type CostBridgeMutationKind =
  | "task.create"
  | "task.update"
  | "task.delete"
  | "task.move"
  | "task.reschedule"
  | "dependency.create"
  | "dependency.delete"
  | "baseline.capture"
  | "baseline.activate"
  | "resource.create"
  | "resource.update"
  | "resource.delete"
  | "assignment.save"
  | "assignment.delete"
  | "calendar.update"
  | "leveling.apply"
  | "leveling.clear";

export interface CostBridgeMutationHint {
  kind: CostBridgeMutationKind;
  taskId?: string | null;
  resourceId?: string | null;
  baselineId?: string | null;
  description?: string | null;
}

export interface CheetahBridgeResourceAssignment {
  assignmentId: string;
  resourceId: string;
  name: string;
  role: string;
  type: Resource["type"];
  allocationPct: number;
  hourlyRate: number | null;
  dailyCostRate: number;
  currencyCode: string;
}

export interface CheetahBridgeWBSNode {
  id: string;
  taskId: string;
  projectId: string;
  parentId: string | null;
  wbsCode: string;
  depth: number;
  sortOrder: number;
  name: string;
  type: ScheduledTask["type"];
  status: ScheduledTask["status"];
  priority: ScheduledTask["priority"];
  isCritical: boolean;
  totalSlackDays: number | null;
  freeSlackDays: number | null;
  schedule: {
    durationDays: number;
    scheduledStartDate: ISODate | null;
    scheduledFinishDate: ISODate | null;
    actualStartDate: ISODate | null;
    actualFinishDate: ISODate | null;
    deadlineDate: ISODate | null;
    baselineStartDate: ISODate | null;
    baselineFinishDate: ISODate | null;
    baselineDurationDays: number | null;
  };
  progress: {
    actualPercent: number;
    baselinePercent: number | null;
    plannedPercentAtStatusDate: number | null;
  };
  cost: {
    plannedCost: number;
    actualCost: number;
    baselinePlannedCost: number | null;
    plannedValue: number | null;
    earnedValue: number | null;
    costVariance: number | null;
    scheduleVariance: number | null;
    earnedValueCostVariance: number | null;
  };
  variance: {
    startVarianceDays: number | null;
    finishVarianceDays: number | null;
    durationVarianceDays: number | null;
    workVarianceHours: number | null;
  };
  /** Ligne FGF de Coûtenance (formules canoniques de la méthode FGF). */
  fgf: FgfLine;
  resources: CheetahBridgeResourceAssignment[];
  children: CheetahBridgeWBSNode[];
}

export interface CheetahBaselineRef {
  id: string;
  name: string;
  capturedAt: string;
  capturedBy: string;
  budgetAtCompletion: number;
  plannedValue: number | null;
  earnedValue: number | null;
  schedulePerformanceIndex: number | null;
  costPerformanceIndex: number | null;
  estimateAtCompletion: number | null;
  varianceAtCompletion: number | null;
}

export interface CheetahBridgeMilestone {
  taskId: string;
  wbsCode: string;
  name: string;
  scheduledDate: ISODate | null;
  baselineDate: ISODate | null;
  deadlineDate: ISODate | null;
  finishVarianceDays: number | null;
  atRisk: boolean;
  riskReason: string | null;
}

export interface CheetahBridgeCostImpactTask {
  taskId: string;
  wbsCode: string;
  name: string;
  slipDays: number;
  dailyResourceCost: number;
  laborCostImpact: number;
  fixedMilestoneCostImpact: number;
  totalCostImpact: number;
  resourceIds: string[];
}

export interface CheetahBridgeCostImpact {
  scheduleSlipDays: number;
  laborCostImpact: number;
  fixedMilestoneCostImpact: number;
  totalCostImpact: number;
  currencyCode: string;
  impactedTaskIds: string[];
  impactedTasks: CheetahBridgeCostImpactTask[];
  narrative: string;
  costProjectUrl: string | null;
}

export interface CheetahFgfSynthese {
  budgetInitial: number;
  budgetADate: number;
  depenses: number;
  valeurAcquise: number;
  resteAFaire: number;
  coutPrevisionnelTerminaison: number;
  varianceCout: number;
  ecartFinal: number;
  ecartSurBad: number;
  currencyCode: string;
}

export interface CheetahProjectBridge {
  bridgeVersion: string;
  product: "Cheetah Time";
  generatedAt: string;
  projectId: string;
  workspaceId: string;
  project: {
    id: string;
    slug: string;
    code: string;
    name: string;
    clientName: string;
    portfolio: string;
    status: string;
    health: string;
    targetStartDate: ISODate;
    targetFinishDate: ISODate | null;
    currencyCode: string;
    budgetAmount: number;
  };
  wbs: CheetahBridgeWBSNode[];
  flatTasks: CheetahBridgeWBSNode[];
  baseline: CheetahBaselineRef | null;
  milestones: CheetahBridgeMilestone[];
  variances: {
    scheduleSlipDays: number;
    maxBaselineFinishVarianceDays: number;
    baselineCostVariance: number | null;
    earnedValueScheduleVariance: number | null;
    earnedValueCostVariance: number | null;
    schedulePerformanceIndex: number | null;
    costPerformanceIndex: number | null;
  };
  costImpact: CheetahBridgeCostImpact;
  /** Synthèse FGF de Coûtenance au niveau projet (formules canoniques de la méthode FGF). */
  fgfSynthese: CheetahFgfSynthese;
}

export interface CheetahCostBridgeSignal {
  id: string;
  type: CostBridgeSignalType;
  severity: CostBridgeSeverity;
  projectId: string;
  workspaceId: string;
  taskId?: string | null;
  resourceIds?: string[];
  baselineId?: string | null;
  message: string;
  scheduleSlipDays?: number | null;
  progressLagPercent?: number | null;
  costImpactAmount?: number | null;
  currencyCode: string;
  detectedAt: string;
  payload: Record<string, unknown>;
}

export interface CheetahProjectBridgeExport extends CheetahProjectBridge {
  signals: CheetahCostBridgeSignal[];
  webhook: {
    configured: boolean;
    endpoint: string | null;
  };
}

export interface CostBridgeDispatchResult {
  status: "sent" | "skipped" | "failed";
  reason?: string;
  signalCount: number;
  endpoint?: string | null;
  providerStatus?: number;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}

function nowIso() {
  return new Date().toISOString();
}

function calendarDayDistance(startDate: ISODate, endDate: ISODate) {
  const start = parseIsoDate(startDate).getTime();
  const end = parseIsoDate(endDate).getTime();
  return Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)));
}

function safeCostWebhookEndpoint() {
  return (
    process.env["CHEETAH_COST_WEBHOOK_URL"]?.trim() ||
    process.env["CHEETAH_TIME_COST_WEBHOOK_URL"]?.trim() ||
    null
  );
}

function safeEndpointLabel(endpoint: string | null) {
  if (!endpoint) {
    return null;
  }

  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return endpoint.slice(0, 160);
  }
}

function getCostProjectUrl(projectId: string) {
  const baseUrl =
    process.env["CHEETAH_COST_PROJECT_BASE_URL"]?.trim() ||
    process.env["CHEETAH_COST_BASE_URL"]?.trim() ||
    null;

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl.replace(/\/+$/, "")}/projects/${encodeURIComponent(projectId)}`;
}

function getTaskAssignments(
  aggregate: ProjectAggregate,
  taskId: string,
) {
  return aggregate.assignments.filter((assignment) => assignment.taskId === taskId);
}

function getAssignmentResource(
  aggregate: ProjectAggregate,
  assignment: Assignment,
) {
  return aggregate.resources.find((resource) => resource.id === assignment.resourceId) ?? null;
}

function getAssignmentDailyCost(
  aggregate: ProjectAggregate,
  assignment: Assignment,
  resource: Resource,
) {
  if (resource.costRate == null) {
    return 0;
  }

  return roundCurrency(
    resource.costRate *
      getResourceDailyCapacityHours(resource, aggregate) *
      (assignment.allocationPct / 100),
  );
}

function buildResourceAssignments(
  aggregate: ProjectAggregate,
  task: ScheduledTask,
): CheetahBridgeResourceAssignment[] {
  return getTaskAssignments(aggregate, task.id)
    .map((assignment) => {
      const resource = getAssignmentResource(aggregate, assignment);
      if (!resource) {
        return null;
      }

      return {
        assignmentId: assignment.id,
        resourceId: resource.id,
        name: resource.name,
        role: resource.role,
        type: resource.type,
        allocationPct: assignment.allocationPct,
        hourlyRate: resource.costRate ?? null,
        dailyCostRate: getAssignmentDailyCost(aggregate, assignment, resource),
        currencyCode: aggregate.project.currencyCode,
      } satisfies CheetahBridgeResourceAssignment;
    })
    .filter((entry): entry is CheetahBridgeResourceAssignment => Boolean(entry));
}

function plannedPercentFromVariance(variance?: BaselineVariance) {
  const baselineCost = variance?.snapshot?.plannedCost ?? 0;
  if (!variance || baselineCost <= 0 || variance.plannedValue == null) {
    return null;
  }

  return roundPercent((variance.plannedValue / baselineCost) * 100);
}

function baselinePercentFromVariance(variance?: BaselineVariance) {
  const baselineCost = variance?.snapshot?.plannedCost ?? 0;
  if (!variance || baselineCost <= 0 || variance.earnedValue == null) {
    return null;
  }

  return roundPercent((variance.earnedValue / baselineCost) * 100);
}

function buildFlatBridgeNodes(view: ProjectView) {
  const aggregate = view.aggregate;

  return view.tasks.map((task): CheetahBridgeWBSNode => {
    const variance = view.baselineVarianceByTaskId[task.id];
    const snapshot = variance?.snapshot;

    return {
      id: task.id,
      taskId: task.id,
      projectId: task.projectId,
      parentId: task.parentId ?? null,
      wbsCode: task.wbsCode,
      depth: task.depth,
      sortOrder: task.sortOrder,
      name: task.name,
      type: task.type,
      status: task.status,
      priority: task.priority,
      isCritical: task.isCritical,
      totalSlackDays: task.totalSlackDays ?? null,
      freeSlackDays: task.freeSlackDays ?? null,
      schedule: {
        durationDays: task.durationDays,
        scheduledStartDate: task.scheduledStartDate ?? null,
        scheduledFinishDate: task.scheduledFinishDate ?? null,
        actualStartDate: task.actualStartDate ?? null,
        actualFinishDate: task.actualFinishDate ?? null,
        deadlineDate: task.deadlineDate ?? null,
        baselineStartDate: snapshot?.startDate ?? null,
        baselineFinishDate: snapshot?.finishDate ?? null,
        baselineDurationDays: snapshot?.durationDays ?? null,
      },
      progress: {
        actualPercent: task.progressPercent,
        baselinePercent: baselinePercentFromVariance(variance),
        plannedPercentAtStatusDate: plannedPercentFromVariance(variance),
      },
      cost: {
        plannedCost: roundCurrency(getTaskPlannedCost(task, aggregate)),
        actualCost: roundCurrency(getTaskActualCost(task, aggregate)),
        baselinePlannedCost: snapshot?.plannedCost ?? null,
        plannedValue: variance?.plannedValue ?? null,
        earnedValue: variance?.earnedValue ?? null,
        costVariance: variance?.costVariance ?? null,
        scheduleVariance: variance?.scheduleVariance ?? null,
        earnedValueCostVariance: variance?.earnedValueCostVariance ?? null,
      },
      variance: {
        startVarianceDays: variance?.startVarianceDays ?? null,
        finishVarianceDays: variance?.finishVarianceDays ?? null,
        durationVarianceDays: variance?.durationVarianceDays ?? null,
        workVarianceHours: variance?.workVarianceHours ?? null,
      },
      fgf: buildFgfLine({
        // Budget de référence figé = coût planifié de la baseline active (sinon coût planifié courant).
        budgetInitial:
          snapshot?.plannedCost ?? roundCurrency(getTaskPlannedCost(task, aggregate)),
        // Budget à Date = coût planifié courant.
        budgetADate: roundCurrency(getTaskPlannedCost(task, aggregate)),
        // Dépenses = coût réel encouru.
        depenses: roundCurrency(getTaskActualCost(task, aggregate)),
        // Avancement physique = % d'avancement de la tâche.
        avancementPhysique: task.progressPercent,
      }),
      resources: buildResourceAssignments(aggregate, task),
      children: [],
    };
  });
}

function buildWbsTree(flatTasks: CheetahBridgeWBSNode[]) {
  const nodesById = new Map(
    flatTasks.map((node) => [node.taskId, { ...node, children: [] as CheetahBridgeWBSNode[] }]),
  );
  const roots: CheetahBridgeWBSNode[] = [];

  for (const node of nodesById.values()) {
    if (node.parentId && nodesById.has(node.parentId)) {
      nodesById.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function sortChildren(node: CheetahBridgeWBSNode) {
    node.children.sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.wbsCode.localeCompare(right.wbsCode),
    );
    for (const child of node.children) {
      sortChildren(child);
    }
  }

  roots.sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.wbsCode.localeCompare(right.wbsCode),
  );
  for (const root of roots) {
    sortChildren(root);
  }

  return roots;
}

function buildBaselineRef(
  baseline: Baseline | undefined,
  view: ProjectView,
): CheetahBaselineRef | null {
  if (!baseline) {
    return null;
  }

  const budgetAtCompletion = roundCurrency(
    baseline.snapshots.reduce(
      (total, snapshot) => total + snapshot.plannedCost,
      0,
    ),
  );

  return {
    id: baseline.id,
    name: baseline.name,
    capturedAt: baseline.capturedAt,
    capturedBy: baseline.capturedBy,
    budgetAtCompletion,
    plannedValue: view.metrics.plannedValue ?? null,
    earnedValue: view.metrics.earnedValue ?? null,
    schedulePerformanceIndex: view.metrics.schedulePerformanceIndex ?? null,
    costPerformanceIndex: view.metrics.costPerformanceIndex ?? null,
    estimateAtCompletion: view.metrics.estimateAtCompletion ?? null,
    varianceAtCompletion: view.metrics.varianceAtCompletion ?? null,
  };
}

function getMilestoneRiskReason(task: CheetahBridgeWBSNode) {
  const finishVariance = task.variance.finishVarianceDays ?? 0;
  if (finishVariance > 0) {
    return `Baseline finish slipped by ${finishVariance} day(s).`;
  }

  if (
    task.schedule.deadlineDate &&
    task.schedule.scheduledFinishDate &&
    compareIsoDates(task.schedule.scheduledFinishDate, task.schedule.deadlineDate) > 0
  ) {
    return `Contractual deadline ${task.schedule.deadlineDate} is exceeded.`;
  }

  return null;
}

function buildMilestones(flatTasks: CheetahBridgeWBSNode[]) {
  return flatTasks
    .filter((task) => task.type === "MILESTONE")
    .map((task): CheetahBridgeMilestone => {
      const riskReason = getMilestoneRiskReason(task);
      return {
        taskId: task.taskId,
        wbsCode: task.wbsCode,
        name: task.name,
        scheduledDate: task.schedule.scheduledFinishDate,
        baselineDate: task.schedule.baselineFinishDate,
        deadlineDate: task.schedule.deadlineDate,
        finishVarianceDays: task.variance.finishVarianceDays,
        atRisk: Boolean(riskReason),
        riskReason,
      };
    });
}

function getFixedMilestoneCostImpact(
  task: ScheduledTask,
  variance?: BaselineVariance,
) {
  if (task.type !== "MILESTONE") {
    return 0;
  }

  return roundCurrency(variance?.snapshot?.plannedCost ?? 0);
}

export function calculateBridgeCostImpact(view: ProjectView): CheetahBridgeCostImpact {
  const aggregate = view.aggregate;
  const executableTasks = view.tasks.filter((task) => !task.isSummary);
  const maxBaselineSlip = Math.max(
    0,
    ...Object.values(view.baselineVarianceByTaskId).map(
      (variance) => variance.finishVarianceDays ?? 0,
    ),
  );
  const projectSlipDays = Math.max(view.metrics.scheduleSlipDays ?? 0, maxBaselineSlip);
  const positiveVarianceTasks = executableTasks.filter((task) => {
    const finishVariance = view.baselineVarianceByTaskId[task.id]?.finishVarianceDays ?? 0;
    return finishVariance > 0 && (task.isCritical || task.type === "MILESTONE");
  });
  const fallbackCriticalTasks =
    positiveVarianceTasks.length === 0 && projectSlipDays > 0
      ? executableTasks.filter((task) => task.isCritical && task.status !== "DONE")
      : [];
  const impactedSourceTasks = positiveVarianceTasks.length
    ? positiveVarianceTasks
    : fallbackCriticalTasks;

  const impactedTasks = impactedSourceTasks
    .map((task): CheetahBridgeCostImpactTask | null => {
      const variance = view.baselineVarianceByTaskId[task.id];
      const slipDays = Math.max(
        0,
        variance?.finishVarianceDays ?? projectSlipDays,
      );
      if (slipDays <= 0) {
        return null;
      }

      const assignments = getTaskAssignments(aggregate, task.id);
      const dailyResourceCost = roundCurrency(
        assignments.reduce((total, assignment) => {
          const resource = getAssignmentResource(aggregate, assignment);
          return resource
            ? total + getAssignmentDailyCost(aggregate, assignment, resource)
            : total;
        }, 0),
      );
      const laborCostImpact = roundCurrency(dailyResourceCost * slipDays);
      const fixedMilestoneCostImpact = getFixedMilestoneCostImpact(task, variance);
      const totalCostImpact = roundCurrency(laborCostImpact + fixedMilestoneCostImpact);

      return {
        taskId: task.id,
        wbsCode: task.wbsCode,
        name: task.name,
        slipDays,
        dailyResourceCost,
        laborCostImpact,
        fixedMilestoneCostImpact,
        totalCostImpact,
        resourceIds: assignments.map((assignment) => assignment.resourceId),
      };
    })
    .filter((entry): entry is CheetahBridgeCostImpactTask => Boolean(entry));

  const laborCostImpact = roundCurrency(
    impactedTasks.reduce((total, task) => total + task.laborCostImpact, 0),
  );
  const fixedMilestoneCostImpact = roundCurrency(
    impactedTasks.reduce((total, task) => total + task.fixedMilestoneCostImpact, 0),
  );
  const totalCostImpact = roundCurrency(laborCostImpact + fixedMilestoneCostImpact);
  const scheduleSlipDays = Math.max(
    projectSlipDays,
    ...impactedTasks.map((task) => task.slipDays),
    0,
  );

  return {
    scheduleSlipDays,
    laborCostImpact,
    fixedMilestoneCostImpact,
    totalCostImpact,
    currencyCode: aggregate.project.currencyCode,
    impactedTaskIds: impactedTasks.map((task) => task.taskId),
    impactedTasks,
    narrative:
      scheduleSlipDays > 0
        ? `Ce glissement de ${scheduleSlipDays} jour(s) impacte le budget de +${Math.round(totalCostImpact).toLocaleString("fr-FR")} ${aggregate.project.currencyCode}.`
        : "Aucun impact cout de glissement n'est detecte sur le chemin critique.",
    costProjectUrl: getCostProjectUrl(aggregate.project.id),
  };
}

function buildFgfSynthese(
  flatTasks: CheetahBridgeWBSNode[],
  currencyCode: string,
): CheetahFgfSynthese {
  // On agrège uniquement les tâches exécutables (les SUMMARY agrègent déjà leurs enfants).
  const leaves = flatTasks.filter((node) => node.type !== "SUMMARY");

  const budgetInitial = roundCurrency(
    leaves.reduce((total, node) => total + node.fgf.budgetInitial, 0),
  );
  const budgetADate = roundCurrency(
    leaves.reduce((total, node) => total + node.fgf.budgetADate, 0),
  );
  const depenses = roundCurrency(
    leaves.reduce((total, node) => total + node.fgf.depenses, 0),
  );
  const valeurAcquise = roundCurrency(
    leaves.reduce((total, node) => total + node.fgf.valeurAcquise, 0),
  );
  const resteAFaire = roundCurrency(
    leaves.reduce((total, node) => total + node.fgf.resteAFaire, 0),
  );
  const coutPrevisionnelTerminaison = roundCurrency(depenses + resteAFaire);
  const varianceCout = roundCurrency(depenses - valeurAcquise);
  const ecartFinal = roundCurrency(coutPrevisionnelTerminaison - budgetADate);
  const ecartSurBad = budgetADate > 0 ? ecartFinal / budgetADate : 0;

  return {
    budgetInitial,
    budgetADate,
    depenses,
    valeurAcquise,
    resteAFaire,
    coutPrevisionnelTerminaison,
    varianceCout,
    ecartFinal,
    ecartSurBad,
    currencyCode,
  };
}

export function buildCheetahProjectBridgeFromView(view: ProjectView): CheetahProjectBridge {
  const aggregate = view.aggregate;
  const flatTasks = buildFlatBridgeNodes(view);
  const maxBaselineFinishVarianceDays = Math.max(
    0,
    ...Object.values(view.baselineVarianceByTaskId).map(
      (variance) => variance.finishVarianceDays ?? 0,
    ),
  );

  return {
    bridgeVersion: COST_BRIDGE_VERSION,
    product: "Cheetah Time",
    generatedAt: nowIso(),
    projectId: aggregate.project.id,
    workspaceId: aggregate.project.workspaceId,
    project: {
      id: aggregate.project.id,
      slug: aggregate.project.slug,
      code: aggregate.project.code,
      name: aggregate.project.name,
      clientName: aggregate.project.clientName,
      portfolio: aggregate.project.portfolio,
      status: aggregate.project.status,
      health: aggregate.project.health,
      targetStartDate: aggregate.project.targetStartDate,
      targetFinishDate: aggregate.project.targetFinishDate ?? null,
      currencyCode: aggregate.project.currencyCode,
      budgetAmount: aggregate.project.budgetAmount,
    },
    wbs: buildWbsTree(flatTasks),
    flatTasks,
    baseline: buildBaselineRef(view.activeBaseline, view),
    milestones: buildMilestones(flatTasks),
    variances: {
      scheduleSlipDays: view.metrics.scheduleSlipDays ?? 0,
      maxBaselineFinishVarianceDays,
      baselineCostVariance: view.metrics.baselineCostVariance ?? null,
      earnedValueScheduleVariance: view.metrics.earnedValueScheduleVariance ?? null,
      earnedValueCostVariance: view.metrics.earnedValueCostVariance ?? null,
      schedulePerformanceIndex: view.metrics.schedulePerformanceIndex ?? null,
      costPerformanceIndex: view.metrics.costPerformanceIndex ?? null,
    },
    costImpact: calculateBridgeCostImpact(view),
    fgfSynthese:
      buildLotAwareFgfSynthese(view) ?? buildFgfSynthese(flatTasks, aggregate.project.currencyCode),
  };
}

/**
 * Synthèse FGF pilotée par les Lots de Tâches (LT) : quand des lots portent un
 * montant budgété, le BàD = somme des budgets de LT (modèle CheetahCost où le
 * lot EST la ligne FGF). Dépenses et avancement sont remontés des tâches du lot.
 * Renvoie null si aucun lot budgété (l'appelant retombe sur le calcul ressources).
 */
function buildLotAwareFgfSynthese(view: ProjectView): CheetahFgfSynthese | null {
  const aggregate = view.aggregate;
  const tasks = aggregate.tasks;
  // Porteurs de budget : lot-SUMMARY (ancien modèle), LT-tâche ou PTO-jalon
  // (création structurée). Le lot EST la ligne FGF, quel que soit son type.
  const lots = tasks.filter((t) => (t.budgetAmount ?? 0) > 0);
  if (lots.length === 0) return null;

  const childrenByParent = new Map<string | null, typeof tasks>();
  for (const t of tasks) {
    const key = t.parentId ?? null;
    const arr = childrenByParent.get(key) ?? [];
    arr.push(t);
    childrenByParent.set(key, arr);
  }
  const leavesUnder = (lotId: string) => {
    const out: typeof tasks = [];
    const stack = [...(childrenByParent.get(lotId) ?? [])];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.type === "SUMMARY") stack.push(...(childrenByParent.get(node.id) ?? []));
      else out.push(node);
    }
    return out;
  };

  let budgetInitial = 0;
  let budgetADate = 0;
  let depenses = 0;
  let valeurAcquise = 0;
  let resteAFaire = 0;

  for (const lot of lots) {
    const bad = Number(lot.budgetAmount) || 0;
    // SUMMARY : agrège ses descendants ; LT-tâche / PTO-jalon : la tâche elle-même.
    const leaves = lot.type === "SUMMARY" ? leavesUnder(lot.id) : [lot];
    const lotDepenses = leaves.reduce((sum, leaf) => sum + getTaskActualCost(leaf, aggregate), 0);
    const totalDuration = leaves.reduce((sum, leaf) => sum + Math.max(0, leaf.durationDays), 0);
    const avancement =
      totalDuration > 0
        ? leaves.reduce((sum, leaf) => sum + leaf.progressPercent * Math.max(0, leaf.durationDays), 0) /
          totalDuration
        : (leaves[0]?.progressPercent ?? 0);

    const line = buildFgfLine({
      budgetInitial: bad,
      budgetADate: bad,
      depenses: lotDepenses,
      avancementPhysique: avancement,
    });
    budgetInitial += line.budgetInitial;
    budgetADate += line.budgetADate;
    depenses += line.depenses;
    valeurAcquise += line.valeurAcquise;
    resteAFaire += line.resteAFaire;
  }

  const coutPrevisionnelTerminaison = roundCurrency(depenses + resteAFaire);
  const varianceCout = roundCurrency(depenses - valeurAcquise);
  const ecartFinal = roundCurrency(coutPrevisionnelTerminaison - budgetADate);
  const ecartSurBad = budgetADate > 0 ? ecartFinal / budgetADate : 0;

  return {
    budgetInitial: roundCurrency(budgetInitial),
    budgetADate: roundCurrency(budgetADate),
    depenses: roundCurrency(depenses),
    valeurAcquise: roundCurrency(valeurAcquise),
    resteAFaire: roundCurrency(resteAFaire),
    coutPrevisionnelTerminaison,
    varianceCout,
    ecartFinal,
    ecartSurBad,
    currencyCode: aggregate.project.currencyCode,
  };
}

/** Synthèse FGF de Coûtenance calculée directement depuis une vue projet. */
export function computeFgfSyntheseFromView(view: ProjectView): CheetahFgfSynthese {
  const lotAware = buildLotAwareFgfSynthese(view);
  if (lotAware) return lotAware;
  const flatTasks = buildFlatBridgeNodes(view);
  return buildFgfSynthese(flatTasks, view.aggregate.project.currencyCode);
}

export async function getCheetahProjectBridge(projectId: string) {
  const view = await getProjectView(projectId);
  return buildCheetahProjectBridgeFromView(view);
}

function severityFromSlipDays(days: number): CostBridgeSeverity {
  if (days >= 10) {
    return "critical";
  }

  if (days >= 3) {
    return "warning";
  }

  return "info";
}

function getSlipDaysFromPrevious(
  previous: CheetahBridgeWBSNode | undefined,
  current: CheetahBridgeWBSNode,
) {
  const currentVariance = Math.max(current.variance.finishVarianceDays ?? 0, 0);
  const previousVariance = Math.max(previous?.variance.finishVarianceDays ?? 0, 0);

  if (!previous) {
    return currentVariance;
  }

  if (currentVariance > previousVariance) {
    return currentVariance - previousVariance;
  }

  if (
    previous.schedule.scheduledFinishDate &&
    current.schedule.scheduledFinishDate &&
    compareIsoDates(
      current.schedule.scheduledFinishDate,
      previous.schedule.scheduledFinishDate,
    ) > 0
  ) {
    return calendarDayDistance(
      previous.schedule.scheduledFinishDate,
      current.schedule.scheduledFinishDate,
    );
  }

  return 0;
}

function getProgressGap(task: CheetahBridgeWBSNode) {
  if (task.progress.plannedPercentAtStatusDate == null) {
    return 0;
  }

  return Math.max(
    0,
    task.progress.plannedPercentAtStatusDate - task.progress.actualPercent,
  );
}

function resourceSignature(task: CheetahBridgeWBSNode) {
  return task.resources
    .map(
      (resource) =>
        `${resource.resourceId}:${resource.allocationPct}:${resource.hourlyRate ?? "null"}`,
    )
    .sort()
    .join("|");
}

function buildSignal(input: {
  type: CostBridgeSignalType;
  severity: CostBridgeSeverity;
  bridge: CheetahProjectBridge;
  message: string;
  taskId?: string | null;
  resourceIds?: string[];
  baselineId?: string | null;
  scheduleSlipDays?: number | null;
  progressLagPercent?: number | null;
  costImpactAmount?: number | null;
  payload?: Record<string, unknown>;
}): CheetahCostBridgeSignal {
  const timestamp = nowIso();
  const idParts = [
    input.bridge.projectId,
    input.type,
    input.taskId ?? input.baselineId ?? "project",
    timestamp,
  ];

  return {
    id: idParts.join(":"),
    type: input.type,
    severity: input.severity,
    projectId: input.bridge.projectId,
    workspaceId: input.bridge.workspaceId,
    taskId: input.taskId ?? null,
    resourceIds: input.resourceIds,
    baselineId: input.baselineId ?? null,
    message: input.message,
    scheduleSlipDays: input.scheduleSlipDays ?? null,
    progressLagPercent: input.progressLagPercent ?? null,
    costImpactAmount: input.costImpactAmount ?? null,
    currencyCode: input.bridge.project.currencyCode,
    detectedAt: timestamp,
    payload: input.payload ?? {},
  };
}

export function detectCostBridgeSignals(input: {
  previous?: CheetahProjectBridge | null;
  next: CheetahProjectBridge;
  eventHint?: CostBridgeMutationHint | null;
}) {
  const previousTasks = new Map(
    (input.previous?.flatTasks ?? []).map((task) => [task.taskId, task]),
  );
  const previousMilestones = new Map(
    (input.previous?.milestones ?? []).map((milestone) => [milestone.taskId, milestone]),
  );
  const impactByTaskId = new Map(
    input.next.costImpact.impactedTasks.map((impact) => [impact.taskId, impact]),
  );
  const signals: CheetahCostBridgeSignal[] = [];

  for (const task of input.next.flatTasks) {
    if (task.type === "SUMMARY") {
      continue;
    }

    const previousTask = previousTasks.get(task.taskId);
    const slipDays = getSlipDaysFromPrevious(previousTask, task);
    if (task.isCritical && slipDays > 0) {
      const taskImpact = impactByTaskId.get(task.taskId);
      signals.push(
        buildSignal({
          type: "schedule.slip",
          severity: severityFromSlipDays(slipDays),
          bridge: input.next,
          taskId: task.taskId,
          resourceIds: task.resources.map((resource) => resource.resourceId),
          scheduleSlipDays: slipDays,
          costImpactAmount: taskImpact?.totalCostImpact ?? 0,
          message: `${task.wbsCode} ${task.name} glisse de ${slipDays} jour(s) sur le chemin critique.`,
          payload: {
            wbsCode: task.wbsCode,
            scheduledFinishDate: task.schedule.scheduledFinishDate,
            baselineFinishDate: task.schedule.baselineFinishDate,
            resources: task.resources,
            costImpact: taskImpact ?? null,
          },
        }),
      );
    }

    const progressGap = getProgressGap(task);
    const previousProgressGap = previousTask ? getProgressGap(previousTask) : 0;
    if (progressGap >= 5 && (!previousTask || progressGap > previousProgressGap + 1)) {
      signals.push(
        buildSignal({
          type: "progress.lag",
          severity: progressGap >= 15 ? "warning" : "info",
          bridge: input.next,
          taskId: task.taskId,
          progressLagPercent: roundPercent(progressGap),
          message: `${task.wbsCode} ${task.name} accuse ${roundPercent(progressGap)} point(s) d'ecart entre avancement physique et avancement budgete.`,
          payload: {
            wbsCode: task.wbsCode,
            plannedPercentAtStatusDate: task.progress.plannedPercentAtStatusDate,
            actualPercent: task.progress.actualPercent,
            plannedValue: task.cost.plannedValue,
            earnedValue: task.cost.earnedValue,
          },
        }),
      );
    }
  }

  for (const milestone of input.next.milestones) {
    const previousMilestone = previousMilestones.get(milestone.taskId);
    const becameAtRisk = milestone.atRisk && !previousMilestone?.atRisk;
    const datePushed =
      previousMilestone?.scheduledDate &&
      milestone.scheduledDate &&
      compareIsoDates(milestone.scheduledDate, previousMilestone.scheduledDate) > 0;

    if (milestone.atRisk && (becameAtRisk || datePushed || !input.previous)) {
      signals.push(
        buildSignal({
          type: "milestone.at_risk",
          severity: "critical",
          bridge: input.next,
          taskId: milestone.taskId,
          scheduleSlipDays: milestone.finishVarianceDays ?? null,
          message: `Jalon contractuel menace: ${milestone.wbsCode} ${milestone.name}.`,
          payload: {
            wbsCode: milestone.wbsCode,
            scheduledDate: milestone.scheduledDate,
            baselineDate: milestone.baselineDate,
            deadlineDate: milestone.deadlineDate,
            riskReason: milestone.riskReason,
          },
        }),
      );
    }
  }

  const previousBaselineId = input.previous?.baseline?.id ?? null;
  const nextBaselineId = input.next.baseline?.id ?? null;
  if (
    nextBaselineId &&
    (input.eventHint?.kind === "baseline.capture" ||
      (previousBaselineId && previousBaselineId !== nextBaselineId))
  ) {
    signals.push(
      buildSignal({
        type: "baseline.new",
        severity: "info",
        bridge: input.next,
        baselineId: nextBaselineId,
        message: `Nouveau referentiel planning actif: ${input.next.baseline?.name}.`,
        payload: {
          baseline: input.next.baseline,
          capturedAt: input.next.baseline?.capturedAt,
        },
      }),
    );
  }

  if (
    input.eventHint?.kind === "assignment.save" ||
    input.eventHint?.kind === "assignment.delete" ||
    input.eventHint?.kind === "resource.create" ||
    input.eventHint?.kind === "resource.update" ||
    input.eventHint?.kind === "resource.delete"
  ) {
    const changedTasks = input.next.flatTasks.filter((task) => {
      const previousTask = previousTasks.get(task.taskId);
      if (!previousTask && input.eventHint?.taskId) {
        return task.taskId === input.eventHint.taskId;
      }
      return previousTask && resourceSignature(previousTask) !== resourceSignature(task);
    });
    const hintedTask = input.eventHint.taskId
      ? input.next.flatTasks.find((task) => task.taskId === input.eventHint?.taskId)
      : null;
    const signalTasks = (changedTasks.length ? changedTasks : hintedTask ? [hintedTask] : [])
      .filter((task) => task.type !== "SUMMARY")
      .slice(0, 5);

    for (const task of signalTasks) {
      const taskImpact = impactByTaskId.get(task.taskId);
      signals.push(
        buildSignal({
          type: "resource.change",
          severity: "info",
          bridge: input.next,
          taskId: task.taskId,
          resourceIds: task.resources.map((resource) => resource.resourceId),
          costImpactAmount: taskImpact?.totalCostImpact ?? null,
          message: `Ressources modifiees sur ${task.wbsCode} ${task.name}: forecast main-d'oeuvre a recalculer.`,
          payload: {
            wbsCode: task.wbsCode,
            resources: task.resources,
            costImpact: taskImpact ?? null,
          },
        }),
      );
    }
  }

  return signals.slice(0, 25);
}

export async function getCheetahProjectBridgeExport(
  projectId: string,
): Promise<CheetahProjectBridgeExport> {
  const bridge = await getCheetahProjectBridge(projectId);
  const signals = detectCostBridgeSignals({ next: bridge });
  const endpoint = safeCostWebhookEndpoint();

  return {
    ...bridge,
    signals,
    webhook: {
      configured: Boolean(endpoint),
      endpoint: safeEndpointLabel(endpoint),
    },
  };
}

export function isCostBridgeWebhookConfigured() {
  return Boolean(safeCostWebhookEndpoint());
}

export async function dispatchCostBridgeWebhook(input: {
  projectId: string;
  previous?: CheetahProjectBridge | null;
  eventHint?: CostBridgeMutationHint | null;
}): Promise<CostBridgeDispatchResult> {
  const endpoint = safeCostWebhookEndpoint();
  if (!endpoint) {
    return {
      status: "skipped",
      reason: "cost_webhook_not_configured",
      signalCount: 0,
      endpoint: null,
    };
  }

  const next = await getCheetahProjectBridge(input.projectId);
  const signals = detectCostBridgeSignals({
    previous: input.previous ?? null,
    next,
    eventHint: input.eventHint ?? null,
  });

  if (!signals.length) {
    return {
      status: "skipped",
      reason: "no_cost_bridge_signals",
      signalCount: 0,
      endpoint: safeEndpointLabel(endpoint),
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cheetah-bridge-version": COST_BRIDGE_VERSION,
      },
      body: JSON.stringify({
        product: "Cheetah Time",
        bridgeVersion: COST_BRIDGE_VERSION,
        dispatchedAt: nowIso(),
        eventHint: input.eventHint ?? null,
        projectId: next.projectId,
        workspaceId: next.workspaceId,
        signals,
        bridge: next,
      }),
    });

    return {
      status: response.ok ? "sent" : "failed",
      reason: response.ok ? undefined : `provider_http_${response.status}`,
      signalCount: signals.length,
      endpoint: safeEndpointLabel(endpoint),
      providerStatus: response.status,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "unknown_provider_error",
      signalCount: signals.length,
      endpoint: safeEndpointLabel(endpoint),
    };
  }
}

export async function runWithCostBridgeWebhook<T>(
  projectId: string,
  eventHint: CostBridgeMutationHint,
  operation: () => Promise<T>,
): Promise<T> {
  if (!isCostBridgeWebhookConfigured()) {
    return operation();
  }

  const previous = await getCheetahProjectBridge(projectId).catch(() => null);
  const result = await operation();
  const dispatch = await dispatchCostBridgeWebhook({
    projectId,
    previous,
    eventHint,
  });

  if (dispatch.status === "failed") {
    console.warn(
      `Cheetah Cost bridge webhook failed for ${projectId}: ${dispatch.reason ?? "unknown"}`,
    );
  }

  return result;
}
