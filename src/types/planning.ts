export type ISODate = string;

export const projectStatuses = [
  "PLANNING",
  "ACTIVE",
  "AT_RISK",
  "ON_HOLD",
  "COMPLETED",
] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const projectHealthValues = [
  "ON_TRACK",
  "WATCH",
  "AT_RISK",
  "OFF_TRACK",
] as const;
export type ProjectHealth = (typeof projectHealthValues)[number];

// Phase FGF (NT.26.011) : les B2P sont définis pour 1 projet ET 1 phase.
export const projetPhases = [
  "Faisabilité",
  "Confirmation de faisabilité",
  "Réalisation",
] as const;
export type ProjetPhase = (typeof projetPhases)[number];

/** Unité de temps du projet (choisie à la création) — affichage/saisie des durées. */
export const timeUnits = ["heures", "jours", "semaines", "mois"] as const;
export type TimeUnit = (typeof timeUnits)[number];

export const projectOrigins = ["SEEDED", "CREATED", "DUPLICATED", "TEMPLATE"] as const;
export type ProjectOrigin = (typeof projectOrigins)[number];

export const taskTypes = ["SUMMARY", "TASK", "MILESTONE"] as const;
export type TaskType = (typeof taskTypes)[number];

export const taskStatuses = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export const dependencyTypes = ["FS", "SS", "FF", "SF"] as const;
export type DependencyType = (typeof dependencyTypes)[number];

export const taskConstraintTypes = [
  "ASAP",
  "START_NO_EARLIER_THAN",
  "START_NO_LATER_THAN",
  "FINISH_NO_EARLIER_THAN",
  "FINISH_NO_LATER_THAN",
  "MUST_START_ON",
  "MUST_FINISH_ON",
] as const;
export type TaskConstraintType = (typeof taskConstraintTypes)[number];

export const taskMoveDirections = ["UP", "DOWN", "INDENT", "OUTDENT"] as const;
export type TaskMoveDirection = (typeof taskMoveDirections)[number];

export const taskSchedulingModes = ["AUTO", "MANUAL"] as const;
export type TaskSchedulingMode = (typeof taskSchedulingModes)[number];

export const taskWorkFormulas = [
  "FIXED_DURATION",
  "FIXED_UNITS",
  "FIXED_WORK",
] as const;
export type TaskWorkFormula = (typeof taskWorkFormulas)[number];

export const taskCalendarModes = ["PROJECT", "CUSTOM"] as const;
export type TaskCalendarMode = (typeof taskCalendarModes)[number];

export const levelingStrategies = [
  "PRIORITY_THEN_SLACK",
  "SLACK_THEN_PRIORITY",
  "MIN_DELAY",
] as const;
export type LevelingStrategy = (typeof levelingStrategies)[number];

export const resourceTypes = ["PERSON", "TEAM", "EQUIPMENT"] as const;
export type ResourceType = (typeof resourceTypes)[number];

export const actualCostCategories = [
  "LABOR",
  "MATERIAL",
  "EQUIPMENT",
  "SUBCONTRACT",
  "TRAVEL",
  "OVERHEAD",
  "OTHER",
] as const;
export type ActualCostCategory = (typeof actualCostCategories)[number];

export const actualCostSources = ["TIMESHEET", "MANUAL", "IMPORT"] as const;
export type ActualCostSource = (typeof actualCostSources)[number];

export interface CalendarException {
  id: string;
  date: ISODate;
  label: string;
  isWorkingDay: boolean;
}

export interface ProjectCalendar {
  id: string;
  name: string;
  timezone: string;
  workingDays: number[];
  hoursPerDay: number;
  exceptions: CalendarException[];
}

export interface Project {
  id: string;
  workspaceId: string;
  slug: string;
  code: string;
  name: string;
  origin: ProjectOrigin;
  sourceProjectId?: string | null;
  clientName: string;
  description: string;
  portfolio: string;
  ownerUserId?: string | null;
  ownerName: string;
  sponsorUserId?: string | null;
  sponsorName: string;
  status: ProjectStatus;
  health: ProjectHealth;
  targetStartDate: ISODate;
  targetFinishDate?: ISODate | null;
  budgetAmount: number;
  currencyCode: string;
  // ── FGF : phase + cadence des B2P (points d'étape coût & durée) ──
  phase?: ProjetPhase | null;
  b2pDates?: ISODate[];
  /** Notes de bilan planning par date de B2P (revue durée côté Cheetah Time). */
  b2pNotes?: Record<string, string>;
  /** Scénarios correctifs (envisagés / retenu) consignés par date de B2P (spec FGF B2). */
  b2pScenarios?: Record<string, string>;
  /** Unité de temps choisie à la création (saisie/affichage des durées). */
  timeUnit?: TimeUnit | null;
  levelingStrategy: LevelingStrategy;
  levelingMaxDelayDays: number;
  archivedAt?: string | null;
  archivedBy?: string | null;
  /** « Déclassé » : sorti de la liste « Projets en cours » sans archivage définitif (spec François). */
  declassedAt?: string | null;
  declassedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  parentId?: string | null;
  sortOrder: number;
  name: string;
  description: string;
  notes: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  progressPercent: number;
  durationDays: number;
  schedulingMode: TaskSchedulingMode;
  workFormula: TaskWorkFormula;
  effortHours?: number | null;
  calendarMode: TaskCalendarMode;
  calendarWorkingDays: number[];
  calendarHoursPerDay?: number | null;
  calendarExceptions: CalendarException[];
  constraintType: TaskConstraintType;
  constraintDate?: ISODate | null;
  deadlineDate?: ISODate | null;
  levelingDelayDays: number;
  levelingPriority: number;
  manualStartDate?: ISODate | null;
  manualFinishDate?: ISODate | null;
  actualStartDate?: ISODate | null;
  actualFinishDate?: ISODate | null;
  actualWorkHours: number;
  remainingWorkHours: number;
  /** Montant budgété du lot (FGF : Budget initial du LT). Optionnel. */
  budgetAmount?: number | null;
  /** Code structuré (LT01, PTO01, TH01…) — vocabulaire FGF de la suite. */
  code?: string | null;
}

export interface Dependency {
  id: string;
  projectId: string;
  predecessorProjectId: string;
  predecessorTaskId: string;
  successorProjectId: string;
  successorTaskId: string;
  type: DependencyType;
  lagDays: number;
  label?: string;
  createdAt: string;
}

export interface DependencyTaskOption {
  taskId: string;
  wbsCode: string;
  name: string;
  type: TaskType;
  isSummary: boolean;
}

export interface DependencyProjectOption {
  projectId: string;
  code: string;
  name: string;
  archivedAt?: string | null;
  tasks: DependencyTaskOption[];
}

export interface DependencyEndpointLabel {
  projectId: string;
  projectCode: string;
  projectName: string;
  taskId: string;
  taskName: string;
  wbsCode?: string | null;
}

export interface DependencyNetworkEntry {
  dependency: Dependency;
  predecessor: DependencyEndpointLabel;
  successor: DependencyEndpointLabel;
  externalToProject: boolean;
}

export interface Resource {
  id: string;
  projectId: string;
  /** Code structuré (R01…) — référencé par les LT à la saisie. */
  code?: string | null;
  name: string;
  role: string;
  type: ResourceType;
  location: string;
  availabilityPct: number;
  /**
   * Disponibilité (intensité) par période, ex : { "2026-08": 1, "2026-09": 0.5, "2026-10": 0 }.
   * Clé = mois "YYYY-MM". Absente = 1 (pleine disponibilité). Demande François 23/08 :
   * la disponibilité d'une ressource s'indique sur un calendrier, selon l'unité de temps.
   */
  availabilityByMonth?: Record<string, number>;
  capacityHoursPerDay: number;
  calendarWorkingDays: number[];
  calendarHoursPerDay?: number | null;
  calendarExceptions: CalendarException[];
  costRate?: number | null;
  color: string;
}

export interface Assignment {
  id: string;
  projectId: string;
  taskId: string;
  resourceId: string;
  allocationPct: number;
  notes?: string;
}

export interface BaselineTaskSnapshot {
  id: string;
  baselineId: string;
  taskId: string;
  name: string;
  startDate?: ISODate | null;
  finishDate?: ISODate | null;
  durationDays: number;
  workHours: number;
  plannedCost: number;
  progressPercent: number;
  isCritical: boolean;
}

export interface Baseline {
  id: string;
  projectId: string;
  name: string;
  description: string;
  capturedAt: string;
  capturedBy: string;
  isActive: boolean;
  snapshots: BaselineTaskSnapshot[];
}

export interface TimesheetEntry {
  id: string;
  projectId: string;
  taskId: string;
  resourceId?: string | null;
  entryDate: ISODate;
  workHours: number;
  costAmount?: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActualCostEntry {
  id: string;
  projectId: string;
  taskId?: string | null;
  resourceId?: string | null;
  timesheetEntryId?: string | null;
  entryDate: ISODate;
  source: ActualCostSource;
  category: ActualCostCategory;
  vendorName?: string | null;
  referenceCode?: string | null;
  description: string;
  quantity?: number | null;
  unitCost?: number | null;
  amount: number;
  currencyCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAggregate {
  project: Project;
  calendar: ProjectCalendar;
  tasks: Task[];
  dependencies: Dependency[];
  resources: Resource[];
  assignments: Assignment[];
  baselines: Baseline[];
  timesheetEntries: TimesheetEntry[];
  actualCostEntries: ActualCostEntry[];
}

export const issueSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type IssueSeverity = (typeof issueSeverities)[number];

export const issueStatuses = ["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"] as const;
export type IssueStatus = (typeof issueStatuses)[number];

export interface IssueItem {
  id: string;
  projectId: string;
  taskId?: string | null;
  assigneeUserId?: string | null;
  code: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  ownerName: string;
  dueDate?: ISODate | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const changeRequestStatuses = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "IMPLEMENTED",
] as const;
export type ChangeRequestStatus = (typeof changeRequestStatuses)[number];

export const changeRequestImpacts = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type ChangeRequestImpact = (typeof changeRequestImpacts)[number];

export interface ChangeRequest {
  id: string;
  projectId: string;
  taskId?: string | null;
  requesterUserId?: string | null;
  approverUserId?: string | null;
  code: string;
  title: string;
  description: string;
  status: ChangeRequestStatus;
  scheduleImpactDays: number;
  costImpactAmount: number;
  impactLevel: ChangeRequestImpact;
  decisionNotes: string;
  requestedAt: string;
  decidedAt?: string | null;
  implementedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const attachmentKinds = ["LINK", "FILE_REFERENCE", "BINARY"] as const;
export type AttachmentKind = (typeof attachmentKinds)[number];

export interface TaskAttachment {
  id: string;
  projectId: string;
  taskId: string;
  uploadedByUserId?: string | null;
  kind: AttachmentKind;
  fileName: string;
  url?: string | null;
  storageProvider: string;
  storagePath?: string | null;
  checksumSha256?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  description: string;
  createdAt: string;
}

export interface StoreMetadata {
  seededFrom: string;
  initializedAt: string;
  lastUpdatedAt: string;
}

export interface AppDataStore {
  version: number;
  metadata: StoreMetadata;
  projects: ProjectAggregate[];
}

export interface ScheduleIssue {
  code:
    | "MISSING_TASK"
    | "SELF_DEPENDENCY"
    | "SUMMARY_DEPENDENCY"
    | "CYCLE"
    | "ORPHAN_PARENT"
    | "INVALID_PROGRESS"
    | "CONSTRAINT_VIOLATION"
    | "DEADLINE_MISSED"
    | "MANUAL_CONFLICT";
  message: string;
  taskId?: string;
  dependencyId?: string;
}

export interface ScheduledTask extends Task {
  wbsCode: string;
  depth: number;
  childIds: string[];
  parentId: string | null;
  isSummary: boolean;
  scheduledStartDate?: ISODate | null;
  scheduledFinishDate?: ISODate | null;
  earliestStartDate?: ISODate | null;
  earliestFinishDate?: ISODate | null;
  latestStartDate?: ISODate | null;
  latestFinishDate?: ISODate | null;
  totalSlackDays?: number | null;
  freeSlackDays?: number | null;
  isCritical: boolean;
}

export interface ScheduleResult {
  projectStartDate?: ISODate | null;
  projectFinishDate?: ISODate | null;
  orderedTaskIds: string[];
  tasksById: Record<string, ScheduledTask>;
  criticalPathTaskIds: string[];
  issues: ScheduleIssue[];
}

export interface BaselineVariance {
  snapshot?: BaselineTaskSnapshot;
  startVarianceDays?: number | null;
  finishVarianceDays?: number | null;
  durationVarianceDays?: number | null;
  workVarianceHours?: number | null;
  costVariance?: number | null;
  plannedValue?: number | null;
  earnedValue?: number | null;
  actualCost?: number | null;
  scheduleVariance?: number | null;
  earnedValueCostVariance?: number | null;
  schedulePerformanceIndex?: number | null;
  costPerformanceIndex?: number | null;
}

export interface ResourceLoadSlice {
  weekLabel: string;
  allocationPct: number;
  allocatedHours: number;
  capacityHours: number;
}

export interface ResourceSummary {
  resource: Resource;
  loadByWeek: ResourceLoadSlice[];
  maxAllocationPct: number;
  maxAllocatedHours: number;
  totalAllocatedHours: number;
  totalPlannedCost: number;
  totalActualHours: number;
  totalActualCost: number;
  overloadedWeeks: number;
  assignedTaskCount: number;
}

export interface DashboardMetric {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "watch" | "danger";
  hint?: string;
}

export interface ProjectMetrics {
  overallProgress: number;
  executableTaskCount: number;
  criticalTaskCount: number;
  delayedTaskCount: number;
  deadlineMissCount: number;
  overdueCriticalCount: number;
  milestoneCount: number;
  overloadedResourceCount: number;
  scheduleIssueCount: number;
  externalDependencyCount: number;
  externalPredecessorCount: number;
  externalSuccessorCount: number;
  scheduleSlipDays?: number | null;
  totalPlannedWorkHours: number;
  totalPlannedCost: number;
  totalActualWorkHours: number;
  totalRemainingWorkHours: number;
  totalActualCost: number;
  totalLaborActualCost: number;
  totalNonLaborActualCost: number;
  actualCostEntryCount: number;
  baselineBudgetAtCompletion?: number | null;
  plannedValue?: number | null;
  earnedValue?: number | null;
  earnedValueScheduleVariance?: number | null;
  earnedValueCostVariance?: number | null;
  schedulePerformanceIndex?: number | null;
  costPerformanceIndex?: number | null;
  estimateAtCompletion?: number | null;
  varianceAtCompletion?: number | null;
  baselineWorkVarianceHours?: number | null;
  baselineCostVariance?: number | null;
  leveledTaskCount: number;
  totalLevelingDelayDays: number;
  derivedHealth: ProjectHealth;
  healthReasons: string[];
  nearMilestones: ScheduledTask[];
  delayedTasks: ScheduledTask[];
  criticalTasks: ScheduledTask[];
  dashboardMetrics: DashboardMetric[];
}

export interface ProjectView {
  aggregate: ProjectAggregate;
  schedule: ScheduleResult;
  tasks: ScheduledTask[];
  activeBaseline?: Baseline;
  baselineVarianceByTaskId: Record<string, BaselineVariance>;
  dependencyNetwork: DependencyNetworkEntry[];
  dependencyOptions: DependencyProjectOption[];
  resourceSummaries: ResourceSummary[];
  metrics: ProjectMetrics;
}
