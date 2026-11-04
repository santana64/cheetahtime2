import { randomUUID } from "node:crypto";

import {
  buildSchedule,
  type ExternalScheduledTaskReference,
} from "@/lib/planning/schedule-engine";
import { buildRecommendedB2PDates } from "@/lib/fgf/b2p";
import {
  DEFAULT_HOURS_PER_DAY,
  fromWorkingDays,
  toSignedWorkingDays,
  toWorkingDays,
} from "@/lib/planning/time-unit";
import {
  buildSuiteProjectFile,
  parseSuiteProject,
} from "@/lib/interop/suite-bridge";
import {
  addWorkingDays,
  normalizeWorkingDate,
  compareIsoDates,
  countWorkingDaysInclusive,
  formatIsoDate,
  getWeekLabel,
  getWeekStart,
  isWorkingDay,
  maxIsoDate,
  minIsoDate,
  workingDayDistance,
} from "@/lib/planning/date-utils";
import {
  conflictError,
  notFoundError,
  validationError,
} from "@/lib/planning/errors";
import {
  ensureCurrencyCode,
  ensureDependencyType,
  ensureHexColor,
  ensureInteger,
  ensureIsoDate,
  ensureLevelingStrategy,
  ensureNumber,
  ensureOptionalText,
  ensureProjectHealth,
  ensureProjectStatus,
  ensureResourceType,
  ensureTaskCalendarMode,
  ensureTaskConstraintType,
  ensureTaskPriority,
  ensureTaskSchedulingMode,
  ensureTaskStatus,
  ensureTaskType,
  ensureTaskWorkFormula,
  ensureText,
  ensureEnum,
  ensureTimezone,
} from "@/lib/planning/validation";
import {
  getAssignmentDailyWorkHours,
  getProjectActualCost,
  getProjectActualCostBreakdown,
  getResourceActualCostEntries,
  getResourceDailyCapacityHours,
  getTaskActualCost,
  getTaskDailyCapacityHours,
  getTaskPlannedCost,
  getTaskTimesheetEntries,
  getTaskTrackedActualWorkHours,
  getTaskWorkingCalendar,
} from "@/lib/planning/work-model";
import type { ImportedProjectDocument } from "@/lib/interop/mspdi";
import {
  getPersistenceInfo,
  mutateStore,
  readStore,
} from "@/services/project-store";
import { taskMoveDirections } from "@/types/planning";
import type {
  Assignment,
  ActualCostEntry,
  ActualCostCategory,
  AppDataStore,
  Baseline,
  BaselineVariance,
  DashboardMetric,
  Dependency,
  DependencyNetworkEntry,
  DependencyProjectOption,
  DependencyType,
  ISODate,
  LevelingStrategy,
  Project,
  ProjectAggregate,
  ProjectMetrics,
  ProjectView,
  ResourceSummary,
  Resource,
  ScheduledTask,
  Task,
  TimesheetEntry,
  TaskMoveDirection,
  TaskCalendarMode,
  TaskSchedulingMode,
  TaskWorkFormula,
} from "@/types/planning";
import {
  actualCostCategories,
  actualCostSources,
} from "@/types/planning";

export interface CreateProjectLotInput {
  name: string;
  budgetAmount: number;
}

// ── Création structurée (spec FGF complète) ─────────────────────────────────

export interface StructuredPredecessorInput {
  /** Code du LT prédécesseur (LT01…). */
  code: string;
  /** Type de lien (FS par défaut). */
  type?: DependencyType;
  /** Délai sur lien, en unité projet — positif ou négatif (0 si non saisi). */
  lag?: number;
}

export interface StructuredAssignmentInput {
  /** Code de la ressource (R01…). */
  resourceCode: string;
  /** Intensité (0,25 chef de projet, 2 développeurs…) — 2 décimales. */
  intensity: number;
}

/** Type de saisie d'un LT (spec FGF, cas A1) : durée directe, charge, ou intensité. */
export type StructuredLotType = "DUREE" | "CHARGE" | "INTENSITE";

/** Date imposée sur un LT (contrainte calendaire). */
export interface StructuredImposedDate {
  /** SNET = ne pas commencer avant · SNLT = ne pas commencer après ·
   *  FNET = ne pas finir avant · FNLT = ne pas finir après. */
  kind: "SNET" | "SNLT" | "FNET" | "FNLT";
  date: string; // ISO
}

export interface StructuredLotInput {
  /** Code du LT (LT01…) ou de la PTO (PTO01…). */
  code: string;
  name: string;
  /** Durée dans l'unité de temps du projet. */
  duration: number;
  budgetAmount?: number;
  /** PTO : Provision pour Tâches Oubliées (jalon budgété positionnable). */
  isPto?: boolean;
  predecessors?: StructuredPredecessorInput[];
  assignments?: StructuredAssignmentInput[];
  /** Type de saisie (défaut DUREE). CHARGE : durée = charge / intensité affectée. */
  lotType?: StructuredLotType;
  /** Charge saisie (en ressource × unité de temps) si lotType = CHARGE. */
  charge?: number;
  /** Date imposée (contrainte SNET/SNLT/FNET/FNLT). */
  imposed?: StructuredImposedDate | null;
}

export interface StructuredHammockInput {
  /** Code de la Tâche Hamac (TH01…). */
  code: string;
  name: string;
  /** Codes des LT entrant dans la Tâche Hamac. */
  lotCodes: string[];
}

export interface StructuredJalonInput {
  /** Code du Jalon (J1…J9 — 9 au maximum). */
  code: string;
  /** Nom en saisie libre (« Définition terminée », « Dalle coulée »…). */
  name: string;
  /** Prédécesseurs : 0, 1 ou plusieurs, avec type de lien et délai sur lien. */
  predecessors?: StructuredPredecessorInput[];
}

export interface StructuredResourceInput {
  /** Code de la Ressource (R01…). */
  code: string;
  name: string;
  /** Calendrier : 7 h/jour, lundi→vendredi par défaut (modifiable). */
  hoursPerDay?: number;
  workingDays?: number[];
}

export interface CreateProjectStructureInput {
  timeUnit: import("@/types/planning").TimeUnit;
  resources: StructuredResourceInput[];
  lots: StructuredLotInput[];
  hammocks: StructuredHammockInput[];
  /** Jalons (durée nulle, 9 au maximum). */
  jalons?: StructuredJalonInput[];
}

export interface CreateProjectInput {
  workspaceId?: string;
  ownerUserId?: string | null;
  name: string;
  clientName: string;
  ownerName: string;
  sponsorUserId?: string | null;
  sponsorName: string;
  portfolio: string;
  targetStartDate: string;
  targetFinishDate?: string | null;
  budgetAmount: number;
  currencyCode: string;
  // ── FGF : phase, lots de tâches (LT) et cadence B2P ──
  phase?: import("@/types/planning").ProjetPhase | null;
  b2pDates?: string[];
  lots?: CreateProjectLotInput[];
  /** Création structurée complète : unité de temps, LT, PTO, Tâches Hamac, Ressources. */
  structure?: CreateProjectStructureInput;
}

export interface UpdateProjectInput {
  projectId: string;
  name: string;
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
}

export interface SaveTaskInput {
  projectId: string;
  taskId: string;
  name: string;
  description: string;
  notes: string;
  parentId?: string | null;
  sortOrder: number;
  type: Task["type"];
  status: Task["status"];
  priority: Task["priority"];
  progressPercent: number;
  durationDays: number;
  schedulingMode: TaskSchedulingMode;
  workFormula: TaskWorkFormula;
  effortHours?: number | null;
  calendarMode?: TaskCalendarMode;
  calendarWorkingDays?: number[];
  calendarHoursPerDay?: number | null;
  calendarExceptions?: Array<{
    id?: string;
    date: string;
    label: string;
    isWorkingDay: boolean;
  }>;
  levelingPriority?: number;
  constraintType: Task["constraintType"];
  constraintDate?: string | null;
  deadlineDate?: string | null;
  manualStartDate?: string | null;
  manualFinishDate?: string | null;
  actualStartDate?: string | null;
  actualFinishDate?: string | null;
  actualWorkHours?: number | null;
  remainingWorkHours?: number | null;
}

export interface RescheduleTaskFromGanttInput {
  projectId: string;
  taskId: string;
  startDate: string;
  finishDate: string;
}

export interface UpdateProjectCalendarInput {
  projectId: string;
  name: string;
  timezone: string;
  workingDays: number[];
  hoursPerDay: number;
  levelingStrategy?: LevelingStrategy;
  levelingMaxDelayDays?: number;
  exceptions: Array<{
    id?: string;
    date: string;
    label: string;
    isWorkingDay: boolean;
  }>;
}

export interface CreateTaskInput {
  projectId: string;
  parentId?: string | null;
  sortOrder?: number;
  name?: string;
  type?: Task["type"];
}

export interface MoveTaskInput {
  projectId: string;
  taskId: string;
  direction: TaskMoveDirection;
}

export interface SaveDependencyInput {
  projectId: string;
  predecessorProjectId?: string;
  successorTaskId: string;
  successorProjectId?: string;
  predecessorTaskId: string;
  type: Dependency["type"];
  lagDays: number;
}

export interface CreateResourceInput {
  projectId: string;
  name: string;
  role: string;
  type: Resource["type"];
  location: string;
  availabilityPct: number;
  capacityHoursPerDay: number;
  calendarWorkingDays?: number[];
  calendarHoursPerDay?: number | null;
  calendarExceptions?: Array<{
    id?: string;
    date: string;
    label: string;
    isWorkingDay: boolean;
  }>;
  costRate?: number | null;
  color?: string | null;
}

export interface UpdateResourceInput {
  projectId: string;
  resourceId: string;
  name: string;
  role: string;
  type: Resource["type"];
  location: string;
  availabilityPct: number;
  capacityHoursPerDay: number;
  calendarWorkingDays?: number[];
  calendarHoursPerDay?: number | null;
  calendarExceptions?: Array<{
    id?: string;
    date: string;
    label: string;
    isWorkingDay: boolean;
  }>;
  costRate?: number | null;
  color?: string | null;
}

export interface SaveAssignmentInput {
  projectId: string;
  taskId: string;
  resourceId: string;
  allocationPct: number;
  notes?: string;
}

export interface SaveTimesheetEntryInput {
  projectId: string;
  entryId?: string;
  taskId: string;
  resourceId?: string | null;
  entryDate: string;
  workHours: number;
  costAmount?: number | null;
  notes?: string | null;
}

export interface SaveActualCostEntryInput {
  projectId: string;
  entryId?: string;
  taskId?: string | null;
  resourceId?: string | null;
  entryDate: string;
  category: ActualCostCategory;
  vendorName?: string | null;
  referenceCode?: string | null;
  description?: string | null;
  quantity?: number | null;
  unitCost?: number | null;
  amount?: number | null;
  currencyCode?: string | null;
}

export interface ListProjectViewsOptions {
  includeArchived?: boolean;
  workspaceId?: string;
}

export interface DuplicateProjectInput {
  projectId: string;
  name?: string;
  duplicatedBy: string;
}

function validateProjectInputs(
  input: Omit<CreateProjectInput, "budgetAmount"> & { budgetAmount: number },
) {
  const name = ensureText(input.name, "Nom du projet", { maxLength: 120 });
  const clientName = ensureText(input.clientName, "Maître d'ouvrage", {
    maxLength: 120,
  });
  const ownerName = ensureText(input.ownerName, "Responsable", {
    maxLength: 120,
  });
  const sponsorName = ensureText(input.sponsorName, "Commanditaire", {
    maxLength: 120,
  });
  const portfolio = ensureText(input.portfolio, "Portefeuille", {
    maxLength: 120,
  });
  const targetStartDate = ensureIsoDate(
    input.targetStartDate,
    "Target start date",
  )!;
  const targetFinishDate = ensureIsoDate(
    input.targetFinishDate ?? null,
    "Target finish date",
    { required: false },
  );
  if (
    targetFinishDate &&
    compareIsoDates(targetFinishDate, targetStartDate) < 0
  ) {
    throw validationError(
      "Target finish date cannot be earlier than the target start date.",
    );
  }

  return {
    workspaceId: ensureOptionalText(input.workspaceId ?? null, "Espace de travail", 120) ?? "workspace-cheetah-time",
    name,
    clientName,
    ownerUserId: ensureOptionalText(input.ownerUserId ?? null, "Responsable (identifiant)", 120),
    ownerName,
    sponsorUserId: ensureOptionalText(input.sponsorUserId ?? null, "Commanditaire (identifiant)", 120),
    sponsorName,
    portfolio,
    targetStartDate,
    targetFinishDate,
    budgetAmount: ensureNumber(input.budgetAmount, "Budget", {
      min: 0,
      max: 1_000_000_000,
    }),
    currencyCode: ensureCurrencyCode(input.currencyCode),
  };
}

function validateProjectMetadataInput(input: UpdateProjectInput) {
  const validated = validateProjectInputs(input);

  return {
    ...validated,
    description:
      ensureOptionalText(input.description, "Description du projet", 4000) ?? "",
    status: ensureProjectStatus(input.status),
    health: ensureProjectHealth(input.health),
  };
}

function validateTaskInput(input: SaveTaskInput) {
  const name = ensureText(input.name, "Nom du LT", { maxLength: 160 });
  const description =
    ensureOptionalText(input.description, "Description du LT", 4000) ?? "";
  const notes = ensureOptionalText(input.notes, "Notes du LT", 4000) ?? "";
  const type = ensureTaskType(input.type);
  const status = ensureTaskStatus(input.status);
  const priority = ensureTaskPriority(input.priority);
  const schedulingMode = ensureTaskSchedulingMode(input.schedulingMode);
  const workFormula = ensureTaskWorkFormula(input.workFormula);
  const calendarMode = ensureTaskCalendarMode(input.calendarMode ?? "PROJECT");
  const constraintType = ensureTaskConstraintType(input.constraintType);
  const sortOrder = ensureInteger(input.sortOrder, "Ordre du LT", {
    min: 0,
    max: 100_000,
  });
  const progressPercent = ensureInteger(
    Math.round(input.progressPercent),
    "Task progress",
    { min: 0, max: 100 },
  );
  const durationDays = ensureInteger(
    type === "MILESTONE" ? 0 : Math.round(input.durationDays),
    "Task duration",
    { min: type === "MILESTONE" ? 0 : 1, max: 10_000 },
  );
  const effortHours =
    input.effortHours == null
      ? null
      : ensureNumber(input.effortHours, "Charge du LT", {
          min: 0,
          max: 100_000,
        });
  const calendarWorkingDays =
    calendarMode === "CUSTOM"
      ? validateWorkingDays(input.calendarWorkingDays ?? [], "Task working day", {
          allowEmpty: true,
        })
      : [];
  const calendarHoursPerDay =
    calendarMode !== "CUSTOM" || input.calendarHoursPerDay == null
      ? null
      : ensureInteger(
          Math.round(input.calendarHoursPerDay),
          "Task calendar hours per day",
          { min: 1, max: 24 },
        );
  const calendarExceptions = validateCalendarExceptions(
    input.calendarExceptions ?? [],
    "Task calendar",
  );
  const constraintDate = ensureIsoDate(
    input.constraintDate ?? null,
    "Constraint date",
    { required: false },
  );
  const deadlineDate = ensureIsoDate(input.deadlineDate ?? null, "Échéance", {
    required: false,
  });
  const manualStartDate = ensureIsoDate(
    input.manualStartDate ?? null,
    "Manual start date",
    { required: false },
  );
  const manualFinishDate = ensureIsoDate(
    input.manualFinishDate ?? null,
    "Manual finish date",
    { required: false },
  );
  const actualStartDate = ensureIsoDate(
    input.actualStartDate ?? null,
    "Actual start date",
    { required: false },
  );
  const actualFinishDate = ensureIsoDate(
    input.actualFinishDate ?? null,
    "Actual finish date",
    { required: false },
  );
  const actualWorkHours =
    input.actualWorkHours == null
      ? null
      : ensureNumber(input.actualWorkHours, "Travail réel", {
          min: 0,
          max: 100_000,
        });
  const remainingWorkHours =
    input.remainingWorkHours == null
      ? null
      : ensureNumber(input.remainingWorkHours, "Reste à faire", {
          min: 0,
          max: 100_000,
        });
  const levelingPriority = ensureInteger(
    Math.round(input.levelingPriority ?? 500),
    "Leveling priority",
    { min: 0, max: 1000 },
  );
  if (constraintType !== "ASAP" && !constraintDate) {
    throw validationError("Cette contrainte nécessite une date.");
  }

  if (schedulingMode === "MANUAL") {
    if (!manualStartDate || !manualFinishDate) {
      throw validationError(
        "Manual scheduling requires both a manual start date and a manual finish date.",
      );
    }

    if (compareIsoDates(manualFinishDate, manualStartDate) < 0) {
      throw validationError("La fin manuelle ne peut pas précéder le début manuel.");
    }
  }

  if (actualFinishDate && !actualStartDate) {
    throw validationError("Une fin réelle nécessite un début réel.");
  }

  if (
    actualStartDate &&
    actualFinishDate &&
    compareIsoDates(actualFinishDate, actualStartDate) < 0
  ) {
    throw validationError("La fin réelle ne peut pas précéder le début réel.");
  }

  if (status === "NOT_STARTED") {
    if (
      progressPercent > 0 ||
      (actualWorkHours ?? 0) > 0 ||
      actualStartDate ||
      actualFinishDate
    ) {
      throw validationError(
        "Not started tasks cannot carry progress or actual execution data.",
      );
    }
  }

  if (actualFinishDate && status !== "DONE") {
    throw validationError("Seul un LT terminé peut avoir une date de fin réelle.");
  }

  return {
    name,
    description,
    notes,
    type,
    status,
    priority,
    schedulingMode,
    workFormula,
    calendarMode,
    calendarWorkingDays,
    calendarHoursPerDay,
    calendarExceptions,
    constraintType,
    sortOrder,
    progressPercent,
    durationDays,
    effortHours,
    levelingPriority,
    constraintDate,
    deadlineDate,
    manualStartDate,
    manualFinishDate,
    actualStartDate,
    actualFinishDate,
    actualWorkHours,
    remainingWorkHours,
    parentId: input.parentId ?? null,
  };
}

function validateCreateTaskInput(input: CreateTaskInput) {
  return {
    parentId: input.parentId ?? null,
    sortOrder:
      input.sortOrder === undefined
        ? undefined
        : ensureInteger(input.sortOrder, "Ordre du LT", {
            min: 0,
            max: 100_000,
          }),
    name: ensureOptionalText(input.name, "Nom du LT", 160) ?? "New task",
    type: input.type ? ensureTaskType(input.type) : "TASK",
  };
}

function validateMoveTaskInput(input: MoveTaskInput) {
  return {
    taskId: ensureText(input.taskId, "Identifiant du LT", { maxLength: 120 }),
    direction: ensureEnum(
      input.direction,
      taskMoveDirections,
      "Task move direction",
    ),
  };
}

function validateWorkingDays(
  values: number[],
  label: string,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
) {
  const normalized = [...new Set(values)]
    .map((value) => ensureInteger(Math.round(value), label, { min: 1, max: 7 }))
    .sort((left, right) => left - right);

  if (!allowEmpty && normalized.length === 0) {
    throw validationError(`At least one ${label.toLowerCase()} must be configured.`);
  }

  return normalized;
}

function validateCalendarExceptions(
  exceptions: Array<{
    id?: string | null;
    date: string;
    label: string;
    isWorkingDay: boolean;
  }>,
  labelPrefix: string,
) {
  const normalized = exceptions.map((exception, index) => ({
    id:
      ensureOptionalText(
        exception.id ?? null,
        `${labelPrefix} exception ${index + 1} id`,
        120,
      ) ?? randomUUID().slice(0, 8),
    date: ensureIsoDate(
      exception.date,
      `${labelPrefix} exception ${index + 1} date`,
    )!,
    label: ensureText(
      exception.label,
      `${labelPrefix} exception ${index + 1} label`,
      { maxLength: 120 },
    ),
    isWorkingDay: Boolean(exception.isWorkingDay),
  }));

  const seenDates = new Set<string>();
  for (const exception of normalized) {
    if (seenDates.has(exception.date)) {
      throw conflictError(`${labelPrefix} exceptions cannot repeat the same date.`);
    }
    seenDates.add(exception.date);
  }

  return normalized;
}

function validateDependencyInput(input: SaveDependencyInput) {
  return {
    predecessorProjectId: ensureText(
      input.predecessorProjectId ?? input.projectId,
      "Predecessor project",
      { maxLength: 120 },
    ),
    predecessorTaskId: ensureText(input.predecessorTaskId, "Prédécesseur", {
      maxLength: 120,
    }),
    successorProjectId: ensureText(
      input.successorProjectId ?? input.projectId,
      "Successor project",
      { maxLength: 120 },
    ),
    successorTaskId: ensureText(input.successorTaskId, "Successeur", {
      maxLength: 120,
    }),
    type: ensureDependencyType(input.type),
    lagDays: ensureInteger(Math.round(input.lagDays), "Délai sur lien", {
      min: -3650,
      max: 3650,
    }),
  };
}

function validateResourceInput(
  input: CreateResourceInput | UpdateResourceInput,
  fallbackColor = "#0f766e",
) {
  return {
    name: ensureText(input.name, "Nom de la ressource", { maxLength: 120 }),
    role: ensureText(input.role, "Rôle", { maxLength: 120 }),
    type: ensureResourceType(input.type),
    location:
      ensureOptionalText(input.location, "Lieu", 120) ??
      "Unassigned",
    availabilityPct: ensureInteger(
      Math.round(input.availabilityPct),
      "Resource availability",
      {
        min: 0,
        max: 100,
      },
    ),
    capacityHoursPerDay: ensureInteger(
      Math.round(input.capacityHoursPerDay),
      "Daily capacity",
      { min: 1, max: 24 },
    ),
    calendarWorkingDays: validateWorkingDays(
      input.calendarWorkingDays ?? [],
      "Resource working day",
      { allowEmpty: true },
    ),
    calendarHoursPerDay:
      input.calendarHoursPerDay == null
        ? null
        : ensureInteger(
            Math.round(input.calendarHoursPerDay),
            "Resource calendar hours per day",
            { min: 1, max: 24 },
          ),
    calendarExceptions: validateCalendarExceptions(
      input.calendarExceptions ?? [],
      "Resource calendar",
    ),
    costRate:
      input.costRate == null
        ? null
        : ensureNumber(input.costRate, "Taux horaire", {
            min: 0,
            max: 1_000_000,
          }),
    color: ensureHexColor(input.color ?? null, "Couleur de la ressource", fallbackColor),
  };
}

function validateAssignmentInput(input: SaveAssignmentInput) {
  return {
    taskId: ensureText(input.taskId, "LT affecté", { maxLength: 120 }),
    resourceId: ensureText(input.resourceId, "Ressource affectée", {
      maxLength: 120,
    }),
    allocationPct: ensureInteger(
      Math.round(input.allocationPct),
      "Assignment allocation",
      { min: 0, max: 400 },
    ),
    notes: ensureOptionalText(input.notes, "Notes d'affectation", 2000) ?? undefined,
  };
}

function validateProjectCalendarInput(input: UpdateProjectCalendarInput) {
  const name = ensureText(input.name, "Nom du calendrier", { maxLength: 120 });
  const timezone = ensureTimezone(input.timezone);
  const hoursPerDay = ensureInteger(
    Math.round(input.hoursPerDay),
    "Heures par jour",
    { min: 1, max: 24 },
  );
  const normalizedWorkingDays = validateWorkingDays(
    input.workingDays,
    "Working day",
  );
  const exceptions = validateCalendarExceptions(input.exceptions, "Project calendar");

  return {
    name,
    timezone,
    workingDays: normalizedWorkingDays,
    hoursPerDay,
    exceptions,
    levelingStrategy: ensureLevelingStrategy(
      input.levelingStrategy ?? "PRIORITY_THEN_SLACK",
    ),
    levelingMaxDelayDays: ensureInteger(
      Math.round(input.levelingMaxDelayDays ?? 30),
      "Maximum leveling delay",
      { min: 0, max: 3650 },
    ),
  };
}

function validateTimesheetEntryInput(input: SaveTimesheetEntryInput) {
  return {
    entryId:
      ensureOptionalText(input.entryId ?? null, "Identifiant de saisie", 120) ?? null,
    taskId: ensureText(input.taskId, "LT", { maxLength: 120 }),
    resourceId:
      ensureOptionalText(input.resourceId ?? null, "Ressource", 120) ?? null,
    entryDate: ensureIsoDate(input.entryDate, "Date de saisie")!,
    workHours: ensureNumber(input.workHours, "Heures saisies", {
      min: 0.25,
      max: 1000,
    }),
    costAmount:
      input.costAmount == null
        ? null
        : ensureNumber(input.costAmount, "Coût réel", {
            min: 0,
            max: 10_000_000,
          }),
    notes: ensureOptionalText(input.notes ?? null, "Notes de saisie", 2000) ?? "",
  };
}

function validateActualCostEntryInput(input: SaveActualCostEntryInput) {
  const quantity =
    input.quantity == null
      ? null
      : ensureNumber(input.quantity, "Quantité", {
          min: 0,
          max: 10_000_000,
        });
  const unitCost =
    input.unitCost == null
      ? null
      : ensureNumber(input.unitCost, "Coût unitaire", {
          min: 0,
          max: 10_000_000,
        });
  const explicitAmount =
    input.amount == null
      ? null
      : ensureNumber(input.amount, "Montant du coût réel", {
          min: 0,
          max: 10_000_000,
        });

  return {
    entryId:
      ensureOptionalText(input.entryId ?? null, "Identifiant du coût réel", 120) ?? null,
    taskId: ensureOptionalText(input.taskId ?? null, "LT du coût réel", 120) ?? null,
    resourceId:
      ensureOptionalText(input.resourceId ?? null, "Ressource du coût réel", 120) ?? null,
    entryDate: ensureIsoDate(input.entryDate, "Date du coût réel")!,
    source: ensureEnum("MANUAL", actualCostSources, "Actual cost source"),
    category: ensureEnum(input.category, actualCostCategories, "Actual cost category"),
    vendorName:
      ensureOptionalText(input.vendorName ?? null, "Fournisseur", 160) ?? null,
    referenceCode:
      ensureOptionalText(input.referenceCode ?? null, "Référence du coût réel", 120) ??
      null,
    description:
      ensureOptionalText(input.description ?? null, "Description du coût réel", 2000) ??
      "",
    quantity,
    unitCost,
    amount:
      explicitAmount ??
      (quantity != null && unitCost != null
        ? roundCurrency(quantity * unitCost)
        : null),
    currencyCode: ensureCurrencyCode(input.currencyCode ?? "EUR"),
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function nowIso() {
  return new Date().toISOString();
}

function roundWorkHours(value: number) {
  return Math.round(value * 100) / 100;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getResourceCapacityHoursOnDate(
  aggregate: ProjectAggregate,
  resource: Resource,
  date: ISODate,
) {
  const calendar = {
    workingDays: resource.calendarWorkingDays.length
      ? [...resource.calendarWorkingDays]
      : [...aggregate.calendar.workingDays],
    hoursPerDay:
      resource.calendarHoursPerDay ?? resource.capacityHoursPerDay,
    exceptions: [...aggregate.calendar.exceptions],
  };

  for (const exception of resource.calendarExceptions) {
    const existingIndex = calendar.exceptions.findIndex(
      (entry) => entry.date === exception.date,
    );
    if (existingIndex >= 0) {
      calendar.exceptions[existingIndex] = exception;
    } else {
      calendar.exceptions.push(exception);
    }
  }

  if (!isWorkingDay(date, calendar)) {
    return 0;
  }

  return getResourceDailyCapacityHours(resource, aggregate);
}

function getEffectiveTaskActualWorkHours(task: Task, aggregate: ProjectAggregate) {
  return getTaskTrackedActualWorkHours(task, aggregate);
}

function getLevelingPriority(task: Pick<Task, "levelingPriority" | "priority">) {
  return typeof task.levelingPriority === "number"
    ? task.levelingPriority
    : getPriorityRank(task.priority) * 250;
}

function overlayTimesheetActuals(aggregate: ProjectAggregate) {
  if (!aggregate.timesheetEntries.length) {
    return aggregate;
  }

  return {
    ...aggregate,
    tasks: aggregate.tasks.map((task) => {
      if (task.type === "SUMMARY") {
        return task;
      }

      const taskEntries = getTaskTimesheetEntries(aggregate, task.id);
      if (!taskEntries.length) {
        return task;
      }

      const actualWorkHours = roundWorkHours(
        taskEntries.reduce((total, entry) => total + entry.workHours, 0),
      );
      const actualStartDate =
        minIsoDate(taskEntries.map((entry) => entry.entryDate)) ?? task.actualStartDate;
      const latestEntryDate =
        maxIsoDate(taskEntries.map((entry) => entry.entryDate)) ?? task.actualFinishDate;
      const plannedWorkHours = roundWorkHours(task.effortHours ?? 0);
      const remainingWorkHours =
        task.status === "DONE"
          ? 0
          : roundWorkHours(
              Math.max(
                task.remainingWorkHours ??
                  Math.max(plannedWorkHours - actualWorkHours, 0),
                0,
              ),
            );
      const progressPercent =
        task.status === "DONE"
          ? 100
          : plannedWorkHours > 0
            ? Math.min(
                99,
                Math.max(
                  task.progressPercent,
                  Math.round((actualWorkHours / plannedWorkHours) * 100),
                ),
              )
            : task.progressPercent;
      const status =
        task.status === "DONE"
          ? "DONE"
          : actualWorkHours > 0 && task.status === "NOT_STARTED"
            ? "IN_PROGRESS"
            : task.status;

      return {
        ...task,
        actualStartDate,
        actualFinishDate: status === "DONE" ? latestEntryDate ?? todayIso() : null,
        actualWorkHours,
        remainingWorkHours,
        progressPercent,
        status,
      };
    }),
  } satisfies ProjectAggregate;
}

function getPriorityRank(priority: Task["priority"]) {
  switch (priority) {
    case "LOW":
      return 0;
    case "MEDIUM":
      return 1;
    case "HIGH":
      return 2;
    case "URGENT":
      return 3;
    default:
      return 1;
  }
}

function isLevelableTask(task: ScheduledTask) {
  return (
    !task.isSummary &&
    task.type === "TASK" &&
    task.schedulingMode === "AUTO" &&
    task.status !== "DONE"
  );
}

function getTaskCurrentPlannedCost(
  task: Pick<
    Task,
    | "id"
    | "calendarMode"
    | "calendarWorkingDays"
    | "calendarHoursPerDay"
    | "calendarExceptions"
    | "effortHours"
    | "durationDays"
    | "type"
    | "manualStartDate"
    | "manualFinishDate"
    | "schedulingMode"
  >,
  aggregate: ProjectAggregate,
) {
  return roundCurrency(getTaskPlannedCost(task, aggregate));
}

function getTaskCurrentActualCost(
  task: Pick<Task, "id" | "type" | "actualWorkHours">,
  aggregate: ProjectAggregate,
) {
  return roundCurrency(getTaskActualCost(task, aggregate));
}

function upsertActualCostEntry(
  aggregate: ProjectAggregate,
  entry: ActualCostEntry,
) {
  const existingIndex = aggregate.actualCostEntries.findIndex(
    (candidate) => candidate.id === entry.id,
  );

  if (existingIndex >= 0) {
    aggregate.actualCostEntries[existingIndex] = {
      ...aggregate.actualCostEntries[existingIndex],
      ...entry,
      createdAt: aggregate.actualCostEntries[existingIndex].createdAt,
      updatedAt: nowIso(),
    };
  } else {
    aggregate.actualCostEntries.push(entry);
    aggregate.actualCostEntries.sort(
      (left, right) =>
        left.entryDate.localeCompare(right.entryDate) ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
  }
}

function syncTimesheetCostLedgerEntry(
  aggregate: ProjectAggregate,
  timesheetEntry: TimesheetEntry,
  task: Task,
  resource: Resource | null,
) {
  const amount =
    typeof timesheetEntry.costAmount === "number"
      ? roundCurrency(timesheetEntry.costAmount)
      : resource?.costRate != null
        ? roundCurrency(timesheetEntry.workHours * resource.costRate)
        : 0;
  const unitCost =
    typeof timesheetEntry.costAmount === "number"
      ? timesheetEntry.workHours > 0
        ? roundCurrency(timesheetEntry.costAmount / timesheetEntry.workHours)
        : null
      : resource?.costRate != null
        ? roundCurrency(resource.costRate)
        : null;
  const existingEntry = aggregate.actualCostEntries.find(
    (entry) => entry.timesheetEntryId === timesheetEntry.id,
  );

  upsertActualCostEntry(aggregate, {
    id: existingEntry?.id ?? randomUUID().slice(0, 8),
    projectId: aggregate.project.id,
    taskId: task.id,
    resourceId: resource?.id ?? null,
    timesheetEntryId: timesheetEntry.id,
    entryDate: timesheetEntry.entryDate,
    source: "TIMESHEET",
    category: "LABOR",
    vendorName: null,
    referenceCode: timesheetEntry.id,
    description:
      timesheetEntry.notes ||
      `Timesheet labor actual for ${task.name}`,
    quantity: roundWorkHours(timesheetEntry.workHours),
    unitCost,
    amount,
    currencyCode: aggregate.project.currencyCode,
    createdAt: existingEntry?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  });
}

function roundRatio(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function getBaselinePlannedPercentAtDate(
  baselineSnapshot: Baseline["snapshots"][number],
  statusDate: ISODate,
  calendar: ProjectAggregate["calendar"],
) {
  if (!baselineSnapshot.startDate || !baselineSnapshot.finishDate) {
    return baselineSnapshot.progressPercent > 0
      ? baselineSnapshot.progressPercent / 100
      : 0;
  }

  if (compareIsoDates(statusDate, baselineSnapshot.startDate) < 0) {
    return 0;
  }

  if (compareIsoDates(statusDate, baselineSnapshot.finishDate) >= 0) {
    return 1;
  }

  const totalDurationDays = Math.max(
    countWorkingDaysInclusive(
      baselineSnapshot.startDate,
      baselineSnapshot.finishDate,
      calendar,
    ),
    1,
  );
  const elapsedDurationDays = Math.max(
    countWorkingDaysInclusive(
      baselineSnapshot.startDate,
      statusDate,
      calendar,
    ),
    0,
  );

  return Math.max(0, Math.min(elapsedDurationDays / totalDurationDays, 1));
}

function todayIso() {
  return formatIsoDate(new Date());
}

function getProjectCodePrefix(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (normalized.slice(0, 3) || "CHT").padEnd(3, "X");
}

function getUniqueProjectSlug(
  store: { projects: ProjectAggregate[] },
  value: string,
  excludedProjectId?: string,
) {
  const baseSlug = slugify(value) || randomUUID().slice(0, 8);
  let slug = baseSlug;
  let suffix = 2;

  while (
    store.projects.some(
      (entry) =>
        entry.project.id !== excludedProjectId &&
        (entry.project.id === slug || entry.project.slug === slug),
    )
  ) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function getUniqueProjectCode(
  store: { projects: ProjectAggregate[] },
  value: string,
  excludedProjectId?: string,
) {
  const prefix = getProjectCodePrefix(value);
  let sequence = store.projects.length + 1;
  let code = `${prefix}-${String(sequence).padStart(4, "0")}`;

  while (
    store.projects.some(
      (entry) =>
        entry.project.id !== excludedProjectId && entry.project.code === code,
    )
  ) {
    sequence += 1;
    code = `${prefix}-${String(sequence).padStart(4, "0")}`;
  }

  return code;
}

function buildChildrenMap(tasks: Task[]) {
  const childrenMap = new Map<string, Task[]>();

  for (const task of tasks) {
    if (!task.parentId) {
      continue;
    }

    const children = childrenMap.get(task.parentId) ?? [];
    children.push(task);
    childrenMap.set(task.parentId, children);
  }

  for (const children of childrenMap.values()) {
    children.sort((left, right) => left.sortOrder - right.sortOrder);
  }

  return childrenMap;
}

function collectDescendantTaskIds(tasks: Task[], taskId: string) {
  const childrenMap = buildChildrenMap(tasks);
  const descendants = new Set<string>();
  const queue = [...(childrenMap.get(taskId) ?? [])];

  while (queue.length > 0) {
    const task = queue.shift()!;
    descendants.add(task.id);
    queue.push(...(childrenMap.get(task.id) ?? []));
  }

  return descendants;
}

function taskHasChildren(tasks: Task[], taskId: string) {
  return tasks.some((task) => task.parentId === taskId);
}

function taskHasDependencies(dependencies: Dependency[], taskId: string) {
  return dependencies.some(
    (dependency) =>
      dependency.predecessorTaskId === taskId || dependency.successorTaskId === taskId,
  );
}

function assertValidParent(tasks: Task[], taskId: string, parentId?: string | null) {
  if (!parentId) {
    return;
  }

  if (taskId === parentId) {
    throw conflictError("A task cannot be its own parent.");
  }

  const parent = tasks.find((task) => task.id === parentId);
  if (!parent) {
    throw notFoundError("LT parent introuvable.");
  }

  const descendants = collectDescendantTaskIds(tasks, taskId);
  if (descendants.has(parentId)) {
    throw conflictError("A task cannot be moved under one of its descendants.");
  }
}

function resetTaskToSummaryControls(task: Task) {
  task.status = "NOT_STARTED";
  task.progressPercent = 0;
  task.durationDays = 0;
  task.schedulingMode = "AUTO";
  task.workFormula = "FIXED_DURATION";
  task.effortHours = 0;
  task.constraintType = "ASAP";
  task.constraintDate = null;
  task.deadlineDate = null;
  task.levelingDelayDays = 0;
  task.manualStartDate = null;
  task.manualFinishDate = null;
  task.actualStartDate = null;
  task.actualFinishDate = null;
  task.actualWorkHours = 0;
  task.remainingWorkHours = 0;
}

function getSiblingTasks(tasks: Task[], parentId?: string | null) {
  return tasks
    .filter((task) => (task.parentId ?? null) === (parentId ?? null))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

function renumberSiblingTasks(
  tasks: Task[],
  parentId?: string | null,
  orderedTaskIds?: string[],
) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const siblings = orderedTaskIds
    ? orderedTaskIds
        .map((taskId) => taskMap.get(taskId))
        .filter(Boolean) as Task[]
    : getSiblingTasks(tasks, parentId);

  siblings.forEach((task, index) => {
    task.sortOrder = (index + 1) * 10;
  });
}

function assertParentCanAcceptChildren(
  tasks: Task[],
  dependencies: Dependency[],
  parentId?: string | null,
) {
  if (!parentId) {
    return;
  }

  const parent = tasks.find((task) => task.id === parentId);
  if (!parent) {
    throw notFoundError("LT parent introuvable.");
  }

  if (
    parent.type !== "SUMMARY" &&
    !taskHasChildren(tasks, parent.id) &&
    taskHasDependencies(dependencies, parent.id)
  ) {
    throw conflictError(
      "Clear dependency logic before adding child tasks beneath a driven task.",
    );
  }
}

function normalizeParentSummaryState(
  tasks: Task[],
  dependencies: Dependency[],
  parentId?: string | null,
) {
  if (!parentId) {
    return;
  }

  const parent = tasks.find((task) => task.id === parentId);
  if (!parent) {
    return;
  }

  if (taskHasChildren(tasks, parent.id)) {
    if (taskHasDependencies(dependencies, parent.id)) {
      throw conflictError(
        "Summary tasks cannot carry dependency logic. Clear links before restructuring this branch.",
      );
    }

    resetTaskToSummaryControls(parent);
  }
}

function getNormalizedTaskPlanningState(
  task: Task,
  aggregate: ProjectAggregate,
  overrides: Partial<Task> = {},
) {
  const provisionalTask = {
    ...task,
    ...overrides,
  } satisfies Task;

  if (provisionalTask.type === "SUMMARY" || taskHasChildren(aggregate.tasks, provisionalTask.id)) {
    return {
      schedulingMode: "AUTO" as const,
      workFormula: "FIXED_DURATION" as const,
      durationDays: 0,
      effortHours: 0,
      levelingDelayDays: 0,
      manualStartDate: null,
      manualFinishDate: null,
    };
  }

  if (provisionalTask.type === "MILESTONE") {
    return {
      schedulingMode: provisionalTask.schedulingMode,
      workFormula: provisionalTask.workFormula,
      durationDays: 0,
      effortHours: 0,
      levelingDelayDays:
        provisionalTask.schedulingMode === "MANUAL"
          ? 0
          : provisionalTask.levelingDelayDays ?? 0,
      manualStartDate:
        provisionalTask.schedulingMode === "MANUAL"
          ? provisionalTask.manualStartDate ?? null
          : null,
      manualFinishDate:
        provisionalTask.schedulingMode === "MANUAL"
          ? provisionalTask.manualStartDate ?? provisionalTask.manualFinishDate ?? null
          : null,
    };
  }

  const taskCalendar = getTaskWorkingCalendar(aggregate, provisionalTask);
  const assignmentCount = aggregate.assignments.filter(
    (assignment) => assignment.taskId === provisionalTask.id,
  ).length;
  const dailyCapacity = Math.max(
    assignmentCount
      ? getTaskDailyCapacityHours(aggregate, provisionalTask.id)
      : taskCalendar.hoursPerDay,
    0.25,
  );
  const fallbackEffortHours = roundWorkHours(provisionalTask.durationDays * dailyCapacity);
  let durationDays = provisionalTask.durationDays;
  let effortHours =
    typeof provisionalTask.effortHours === "number" &&
    Number.isFinite(provisionalTask.effortHours)
      ? provisionalTask.effortHours
      : null;
  let manualStartDate =
    provisionalTask.schedulingMode === "MANUAL"
      ? provisionalTask.manualStartDate ?? null
      : null;
  let manualFinishDate =
    provisionalTask.schedulingMode === "MANUAL"
      ? provisionalTask.manualFinishDate ?? null
      : null;

  if (
    provisionalTask.schedulingMode === "MANUAL" &&
    manualStartDate &&
    manualFinishDate
  ) {
    durationDays = Math.max(
      countWorkingDaysInclusive(manualStartDate, manualFinishDate, taskCalendar),
      1,
    );
    if (provisionalTask.workFormula === "FIXED_DURATION") {
      effortHours = roundWorkHours(durationDays * dailyCapacity);
    } else if (effortHours == null) {
      effortHours = fallbackEffortHours;
    }
  } else {
    manualStartDate = null;
    manualFinishDate = null;

    switch (provisionalTask.workFormula) {
      case "FIXED_DURATION":
        effortHours = roundWorkHours(durationDays * dailyCapacity);
        break;
      case "FIXED_WORK":
        effortHours = effortHours == null ? fallbackEffortHours : effortHours;
        durationDays = Math.max(Math.ceil(effortHours / dailyCapacity), 1);
        break;
      case "FIXED_UNITS":
        effortHours = effortHours == null ? fallbackEffortHours : effortHours;
        durationDays = Math.max(Math.ceil(effortHours / dailyCapacity), 1);
        break;
    }
  }

  return {
    schedulingMode: provisionalTask.schedulingMode,
    workFormula: provisionalTask.workFormula,
    durationDays,
    effortHours: roundWorkHours(effortHours ?? 0),
    levelingDelayDays:
      provisionalTask.schedulingMode === "MANUAL"
        ? 0
        : provisionalTask.levelingDelayDays ?? 0,
    manualStartDate,
    manualFinishDate,
  };
}

function getNormalizedTaskExecutionState(
  task: Task,
  aggregate: ProjectAggregate,
  overrides: Partial<Task> = {},
): Pick<
  Task,
  | "actualStartDate"
  | "actualFinishDate"
  | "actualWorkHours"
  | "remainingWorkHours"
  | "progressPercent"
  | "status"
> {
  const provisionalTask = {
    ...task,
    ...overrides,
  } satisfies Task;
  const normalizedPlanningState = getNormalizedTaskPlanningState(
    task,
    aggregate,
    overrides,
  );
  const plannedWorkHours = roundWorkHours(normalizedPlanningState.effortHours ?? 0);
  const isSummary =
    provisionalTask.type === "SUMMARY" ||
    taskHasChildren(aggregate.tasks, provisionalTask.id);
  const normalizedStatus =
    provisionalTask.status === "DONE"
      ? "DONE"
      : provisionalTask.status === "NOT_STARTED"
        ? "NOT_STARTED"
        : provisionalTask.status;
  const normalizedProgressPercent =
    normalizedStatus === "DONE"
      ? 100
      : normalizedStatus === "NOT_STARTED"
        ? 0
        : Math.min(Math.max(provisionalTask.progressPercent, 0), 100);

  if (isSummary) {
    return {
      actualStartDate: null,
      actualFinishDate: null,
      actualWorkHours: 0,
      remainingWorkHours: 0,
      progressPercent: 0,
      status: "NOT_STARTED" as const,
    };
  }

  if (normalizedStatus === "NOT_STARTED") {
    return {
      actualStartDate: null,
      actualFinishDate: null,
      actualWorkHours: 0,
      remainingWorkHours: plannedWorkHours,
      progressPercent: 0,
      status: normalizedStatus,
    };
  }

  const actualWorkHours =
    typeof provisionalTask.actualWorkHours === "number" &&
    Number.isFinite(provisionalTask.actualWorkHours)
      ? Math.max(provisionalTask.actualWorkHours, 0)
      : null;
  const remainingWorkHours =
    typeof provisionalTask.remainingWorkHours === "number" &&
    Number.isFinite(provisionalTask.remainingWorkHours)
      ? Math.max(provisionalTask.remainingWorkHours, 0)
      : null;
  const persistedStartDate =
    provisionalTask.actualStartDate ??
    task.actualStartDate ??
    provisionalTask.manualStartDate ??
    null;

  if (normalizedStatus === "DONE") {
    const normalizedActualWorkHours = roundWorkHours(
      Math.max(
        actualWorkHours ??
          (remainingWorkHours != null
            ? plannedWorkHours - remainingWorkHours
            : plannedWorkHours),
        0,
      ),
    );
    const actualFinishDate =
      provisionalTask.actualFinishDate ??
      task.actualFinishDate ??
      provisionalTask.manualFinishDate ??
      todayIso();
    const actualStartDate = persistedStartDate ?? actualFinishDate;

    return {
      actualStartDate,
      actualFinishDate,
      actualWorkHours: normalizedActualWorkHours,
      remainingWorkHours: 0,
      progressPercent: 100,
      status: normalizedStatus,
    };
  }

  const normalizedActualWorkHours = roundWorkHours(
    Math.max(
      actualWorkHours ??
        (remainingWorkHours != null
          ? plannedWorkHours - remainingWorkHours
          : plannedWorkHours * (normalizedProgressPercent / 100)),
      0,
    ),
  );
  const normalizedRemainingWorkHours = roundWorkHours(
    Math.max(
      remainingWorkHours ?? plannedWorkHours - normalizedActualWorkHours,
      0,
    ),
  );

  return {
    actualStartDate: persistedStartDate,
    actualFinishDate: null,
    actualWorkHours: normalizedActualWorkHours,
    remainingWorkHours: normalizedRemainingWorkHours,
    progressPercent: normalizedProgressPercent,
    status: normalizedStatus as Task["status"],
  };
}

function getCapacityDrivenTaskOverrides(
  task: Task,
  aggregate: ProjectAggregate,
): Partial<Task> {
  return {
    effortHours:
      task.workFormula === "FIXED_DURATION"
        ? roundWorkHours(
            task.durationDays * getTaskDailyCapacityHours(aggregate, task.id),
          )
        : task.effortHours ?? null,
  };
}

function applyTaskPlanningState(
  task: Task,
  aggregate: ProjectAggregate,
  overrides: Partial<Task> = {},
) {
  const normalizedPlanningState = getNormalizedTaskPlanningState(
    task,
    aggregate,
    overrides,
  );
  const normalizedExecutionState = getNormalizedTaskExecutionState(
    task,
    aggregate,
    overrides,
  );

  task.durationDays = normalizedPlanningState.durationDays;
  task.schedulingMode = normalizedPlanningState.schedulingMode;
  task.workFormula = normalizedPlanningState.workFormula;
  task.effortHours = normalizedPlanningState.effortHours;
  task.levelingDelayDays = normalizedPlanningState.levelingDelayDays;
  task.manualStartDate = normalizedPlanningState.manualStartDate;
  task.manualFinishDate = normalizedPlanningState.manualFinishDate;
  task.actualStartDate = normalizedExecutionState.actualStartDate;
  task.actualFinishDate = normalizedExecutionState.actualFinishDate;
  task.actualWorkHours = normalizedExecutionState.actualWorkHours;
  task.remainingWorkHours = normalizedExecutionState.remainingWorkHours;
  task.progressPercent = normalizedExecutionState.progressPercent;
  task.status = normalizedExecutionState.status;
}

function recalculateTaskPlanningState(task: Task, aggregate: ProjectAggregate) {
  applyTaskPlanningState(task, aggregate, getCapacityDrivenTaskOverrides(task, aggregate));
}

function recalculateTaskPlanningStates(
  aggregate: ProjectAggregate,
  taskIds: Iterable<string>,
) {
  const uniqueTaskIds = new Set(taskIds);

  for (const taskId of uniqueTaskIds) {
    const task = aggregate.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      continue;
    }

    recalculateTaskPlanningState(task, aggregate);
  }
}

function createsDependencyCycle(
  dependencies: Dependency[],
  predecessorProjectId: string,
  predecessorTaskId: string,
  successorProjectId: string,
  successorTaskId: string,
) {
  const adjacency = new Map<string, string[]>();

  for (const dependency of dependencies) {
    const predecessorKey = getProjectTaskKey(
      dependency.predecessorProjectId,
      dependency.predecessorTaskId,
    );
    const successorKey = getProjectTaskKey(
      dependency.successorProjectId,
      dependency.successorTaskId,
    );
    const successors = adjacency.get(predecessorKey) ?? [];
    successors.push(successorKey);
    adjacency.set(predecessorKey, successors);
  }

  const visited = new Set<string>();
  const predecessorKey = getProjectTaskKey(predecessorProjectId, predecessorTaskId);
  const queue = [getProjectTaskKey(successorProjectId, successorTaskId)];

  while (queue.length > 0) {
    const taskKey = queue.shift()!;
    if (taskKey === predecessorKey) {
      return true;
    }

    if (visited.has(taskKey)) {
      continue;
    }

    visited.add(taskKey);
    queue.push(...(adjacency.get(taskKey) ?? []));
  }

  return false;
}

interface DailyResourceLoadBucket {
  resourceId: string;
  date: ISODate;
  allocatedHours: number;
  capacityHours: number;
  taskIds: Set<string>;
}

function buildDailyResourceLoadBuckets(
  aggregate: ProjectAggregate,
  tasksById: Record<string, ScheduledTask>,
) {
  const resourceMap = new Map(
    aggregate.resources.map((resource) => [resource.id, resource]),
  );
  const buckets = new Map<string, DailyResourceLoadBucket>();

  for (const assignment of aggregate.assignments) {
    const task = tasksById[assignment.taskId];
    const resource = resourceMap.get(assignment.resourceId);
    if (!task?.scheduledStartDate || !task.scheduledFinishDate || !resource) {
      continue;
    }

    // Mode mois (FGF) : la charge journalière = intensité × capacité du jour
    // (une durée en mois calendaires n'a pas un nombre fixe de jours ouvrés).
    const intensityMode = aggregate.project.timeUnit === "mois";
    const dailyWorkHours = intensityMode ? 0 : getAssignmentDailyWorkHours(assignment, task, aggregate);
    const taskCalendar = getTaskWorkingCalendar(aggregate, task);
    let cursor = normalizeWorkingDate(task.scheduledStartDate, taskCalendar);

    while (compareIsoDates(cursor, task.scheduledFinishDate) <= 0) {
      const key = `${assignment.resourceId}:${cursor}`;
      const capacityHours = getResourceCapacityHoursOnDate(aggregate, resource, cursor);
      const existing = buckets.get(key) ?? {
        resourceId: assignment.resourceId,
        date: cursor,
        allocatedHours: 0,
        capacityHours,
        taskIds: new Set<string>(),
      };

      existing.allocatedHours += intensityMode
        ? (assignment.allocationPct / 100) * resource.capacityHoursPerDay
        : dailyWorkHours;
      existing.taskIds.add(task.id);
      buckets.set(key, existing);

      if (cursor === task.scheduledFinishDate) {
        break;
      }

      cursor = addWorkingDays(cursor, 1, taskCalendar);
    }
  }

  return [...buckets.values()].sort((left, right) => {
    const dateComparison = left.date.localeCompare(right.date);
    if (dateComparison !== 0) {
      return dateComparison;
    }

    return left.resourceId.localeCompare(right.resourceId);
  });
}

function pickLevelingCandidate(
  taskIds: Iterable<string>,
  tasksById: Record<string, ScheduledTask>,
  aggregate: ProjectAggregate,
  delayByTaskId: Map<string, number>,
) {
  const candidates = [...new Set(taskIds)]
    .map((taskId) => tasksById[taskId])
    .filter((task): task is ScheduledTask => Boolean(task))
    .filter(isLevelableTask)
    .filter(
      (task) =>
        (delayByTaskId.get(task.id) ?? 0) < aggregate.project.levelingMaxDelayDays,
    )
    .sort((left, right) => {
      const levelingPriorityDiff =
        getLevelingPriority(left) - getLevelingPriority(right);
      const slackDiff = (right.totalSlackDays ?? 0) - (left.totalSlackDays ?? 0);

      if (aggregate.project.levelingStrategy === "PRIORITY_THEN_SLACK") {
        if (levelingPriorityDiff !== 0) {
          return levelingPriorityDiff;
        }
        if (slackDiff !== 0) {
          return slackDiff;
        }
      }

      if (aggregate.project.levelingStrategy === "SLACK_THEN_PRIORITY") {
        if (slackDiff !== 0) {
          return slackDiff;
        }
        if (levelingPriorityDiff !== 0) {
          return levelingPriorityDiff;
        }
      }

      if (aggregate.project.levelingStrategy === "MIN_DELAY") {
        const durationDiff = left.durationDays - right.durationDays;
        if (durationDiff !== 0) {
          return durationDiff;
        }
        const latestStartDiff = compareIsoDates(
          right.scheduledStartDate ?? null,
          left.scheduledStartDate ?? null,
        );
        if (latestStartDiff !== 0) {
          return latestStartDiff;
        }
        if (slackDiff !== 0) {
          return slackDiff;
        }
        if (levelingPriorityDiff !== 0) {
          return levelingPriorityDiff;
        }
      }

      const deadlineBias =
        (left.deadlineDate ? 1 : 0) - (right.deadlineDate ? 1 : 0);
      if (deadlineBias !== 0) {
        return deadlineBias;
      }

      const startDiff = compareIsoDates(
        right.scheduledStartDate ?? null,
        left.scheduledStartDate ?? null,
      );
      if (startDiff !== 0) {
        return startDiff;
      }

      return left.sortOrder - right.sortOrder;
    });

  return candidates[0] ?? null;
}

/**
 * Nivellement par les charges (FGF, corrigé Q6/Q7).
 *
 * Ancien algorithme : décalage d'un jour à la fois, plafonné à
 * `levelingMaxDelayDays` → il abandonnait et laissait des surcharges (B2/B3 du
 * cas sportif restaient en parallèle à intensité 1 chacune).
 *
 * Nouvel algorithme : à chaque surcharge, le LT à décaler est placé APRÈS le LT
 * concurrent par un LIEN RESSOURCE (FD, délai 0). Le moteur recalcule alors
 * naturellement dates ET marges : après nivellement, la chaîne ressource
 * devient critique (« toutes les tâches sont critiques » dans le corrigé).
 */
const LEVELING_LINK_LABEL = "Lien ressource (nivellement)";
const LEVELING_TIME_BUDGET_MS = 15_000;

function isLevelingLink(dependency: Dependency) {
  return dependency.kind === "RESOURCE";
}

function reachable(dependencies: Dependency[], fromTaskId: string, toTaskId: string) {
  const adjacency = new Map<string, string[]>();
  for (const d of dependencies) {
    const list = adjacency.get(d.predecessorTaskId) ?? [];
    list.push(d.successorTaskId);
    adjacency.set(d.predecessorTaskId, list);
  }
  const seen = new Set<string>();
  const stack = [fromTaskId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === toTaskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(adjacency.get(id) ?? []));
  }
  return false;
}

function calculateLevelingPlan(aggregate: ProjectAggregate) {
  const logicLinks = aggregate.dependencies.filter((d) => !isLevelingLink(d));
  const resourceLinks: Dependency[] = [];
  const started = Date.now();
  const maxIterations = Math.max(200, aggregate.tasks.length * 4);
  let stabilized = false;
  let remainingOverloads = 0;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const dependencies = [...logicLinks, ...resourceLinks];
    const leveledAggregate = {
      ...aggregate,
      tasks: aggregate.tasks.map((task) => ({ ...task, levelingDelayDays: 0 })),
      dependencies,
    } satisfies ProjectAggregate;
    const schedule = buildSchedule(leveledAggregate);
    const overloads = buildDailyResourceLoadBuckets(leveledAggregate, schedule.tasksById).filter(
      (bucket) => bucket.allocatedHours - bucket.capacityHours > 0.05,
    );
    remainingOverloads = overloads.length;
    if (!overloads.length) {
      stabilized = true;
      break;
    }
    if (Date.now() - started > LEVELING_TIME_BUDGET_MS) break;

    let linked = false;
    for (const overload of overloads) {
      const tasksInBucket = [...overload.taskIds]
        .map((id) => schedule.tasksById[id])
        .filter((task): task is ScheduledTask => Boolean(task) && isLevelableTask(task));
      if (tasksInBucket.length < 2) continue;

      // Le LT décalé : choisi par la stratégie du projet (priorité, marge…).
      const ordered = [...tasksInBucket];
      const first = pickLevelingCandidate(
        ordered.map((t) => t.id),
        schedule.tasksById,
        { ...aggregate, project: { ...aggregate.project, levelingMaxDelayDays: Number.MAX_SAFE_INTEGER } },
        new Map(),
      );
      const candidates = first ? [first, ...ordered.filter((t) => t.id !== first.id)] : ordered;

      for (const candidate of candidates) {
        // Bloqueur : le concurrent qui libère la ressource le plus tôt, sans créer de cycle.
        const blockers = tasksInBucket
          .filter((t) => t.id !== candidate.id)
          .filter((t) => !reachable(dependencies, candidate.id, t.id))
          .sort((a, b) => compareIsoDates(a.scheduledFinishDate ?? null, b.scheduledFinishDate ?? null));
        const blocker = blockers[0];
        if (!blocker) continue;
        resourceLinks.push({
          id: `lvl-${aggregate.project.id}-${resourceLinks.length + 1}-${blocker.id}-${candidate.id}`,
          projectId: aggregate.project.id,
          predecessorProjectId: aggregate.project.id,
          predecessorTaskId: blocker.id,
          successorProjectId: aggregate.project.id,
          successorTaskId: candidate.id,
          type: "FS",
          lagDays: 0,
          lagUnits: 0,
          kind: "RESOURCE",
          label: LEVELING_LINK_LABEL,
          createdAt: nowIso(),
        });
        linked = true;
        break;
      }
      if (linked) break;
    }
    if (!linked) break;
  }

  return { resourceLinks, stabilized, remainingOverloads };
}

/** Surcharges ressources restantes (jour par jour) d'une vue — recette Q6 et alertes. */
export function findResourceOverloads(view: ProjectView) {
  const names = new Map(view.aggregate.resources.map((r) => [r.id, r.name]));
  return buildDailyResourceLoadBuckets(view.aggregate, view.schedule.tasksById)
    .filter((bucket) => bucket.allocatedHours - bucket.capacityHours > 0.05)
    .map((bucket) => ({
      resourceId: bucket.resourceId,
      resourceName: names.get(bucket.resourceId) ?? bucket.resourceId,
      date: bucket.date,
      load: Math.round((bucket.allocatedHours / Math.max(bucket.capacityHours, 0.01)) * 100) / 100,
      taskIds: [...bucket.taskIds],
    }));
}

function buildBaselineFromStore(
  store: AppDataStore,
  aggregate: ProjectAggregate,
  {
    baselineId,
    name,
    description,
    capturedAt,
    capturedBy,
    isActive,
  }: {
    baselineId: string;
    name: string;
    description: string;
    capturedAt: string;
    capturedBy: string;
    isActive: boolean;
  },
) {
  const view = buildProjectViewFromStore(store, aggregate.project.id);

  return {
    id: baselineId,
    projectId: aggregate.project.id,
    name,
    description,
    capturedAt,
    capturedBy,
    isActive,
    snapshots: view.tasks
      .filter((task) => !task.isSummary)
      .map((task) => ({
        id: `${baselineId}-${task.id}`,
        baselineId,
        taskId: task.id,
        name: task.name,
        startDate: task.scheduledStartDate ?? null,
        finishDate: task.scheduledFinishDate ?? null,
        durationDays: task.durationDays,
        workHours: roundWorkHours(task.effortHours ?? 0),
        plannedCost: getTaskCurrentPlannedCost(task, aggregate),
        progressPercent: task.progressPercent,
        isCritical: task.isCritical,
      })),
  } satisfies Baseline;
}

function sortProjectAggregates(aggregates: ProjectAggregate[]) {
  return [...aggregates].sort((left, right) => {
    const leftArchived = Boolean(left.project.archivedAt);
    const rightArchived = Boolean(right.project.archivedAt);

    if (leftArchived !== rightArchived) {
      return leftArchived ? 1 : -1;
    }

    return right.project.updatedAt.localeCompare(left.project.updatedAt);
  });
}

function getAggregateOrThrow(store: { projects: ProjectAggregate[] }, projectId: string) {
  const aggregate = store.projects.find(
    (entry) => entry.project.id === projectId || entry.project.slug === projectId,
  );

  if (!aggregate) {
    throw notFoundError(`Project ${projectId} not found.`);
  }

  return aggregate;
}

function getProjectTaskKey(projectId: string, taskId: string) {
  return `${projectId}:${taskId}`;
}

function findAggregateByProjectId(
  store: { projects: ProjectAggregate[] },
  projectId: string,
) {
  return store.projects.find((entry) => entry.project.id === projectId) ?? null;
}

function findTaskInStore(
  store: { projects: ProjectAggregate[] },
  projectId: string,
  taskId: string,
) {
  const aggregate = findAggregateByProjectId(store, projectId);
  if (!aggregate) {
    return null;
  }

  const task = aggregate.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    return null;
  }

  return {
    aggregate,
    task,
  };
}

function dependencyTouchesProject(dependency: Dependency, projectId: string) {
  return (
    dependency.predecessorProjectId === projectId ||
    dependency.successorProjectId === projectId
  );
}

function getRelevantDependenciesForProject(
  store: { projects: ProjectAggregate[] },
  projectId: string,
) {
  const dependenciesById = new Map<string, Dependency>();

  for (const aggregate of store.projects) {
    for (const dependency of aggregate.dependencies) {
      if (dependencyTouchesProject(dependency, projectId)) {
        dependenciesById.set(dependency.id, dependency);
      }
    }
  }

  return [...dependenciesById.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

interface PortfolioScheduleContext {
  effectiveAggregatesByProjectId: Map<string, ProjectAggregate>;
  schedulesByProjectId: Map<string, ReturnType<typeof buildSchedule>>;
  dependencyNetworkByProjectId: Map<string, DependencyNetworkEntry[]>;
  dependencyOptionsByProjectId: Map<string, DependencyProjectOption[]>;
}

const resourceColors = [
  "#0f766e",
  "#1d4ed8",
  "#9333ea",
  "#b45309",
  "#dc2626",
  "#0ea5a4",
  "#475569",
  "#16a34a",
];

function getNextResourceColor(aggregate: ProjectAggregate) {
  return resourceColors[aggregate.resources.length % resourceColors.length];
}

function createProjectSkeleton(projectId: string) {
  const baseTasks: Array<
    Omit<
      Task,
      "actualStartDate" | "actualFinishDate" | "actualWorkHours" | "remainingWorkHours"
    >
  > = [
    {
      id: `${projectId}-phase-1`,
      projectId,
      parentId: null,
      sortOrder: 10,
      name: "Mobilize",
      description: "Launch governance and align the team.",
      notes: "",
      type: "SUMMARY",
      status: "NOT_STARTED",
      priority: "HIGH",
      progressPercent: 0,
      durationDays: 0,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 0,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 500,
      manualStartDate: null,
      manualFinishDate: null,
    },
    {
      id: `${projectId}-phase-1-1`,
      projectId,
      parentId: `${projectId}-phase-1`,
      sortOrder: 11,
      name: "Kickoff complète",
      description: "Confirm objectives, scope, and decision rights.",
      notes: "",
      type: "MILESTONE",
      status: "NOT_STARTED",
      priority: "HIGH",
      progressPercent: 0,
      durationDays: 0,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 0,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      constraintType: "START_NO_EARLIER_THAN",
      constraintDate: null,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 500,
      manualStartDate: null,
      manualFinishDate: null,
    },
    {
      id: `${projectId}-phase-1-2`,
      projectId,
      parentId: `${projectId}-phase-1`,
      sortOrder: 12,
      name: "Planning pass",
      description: "Build the first sequenced plan, owners, and dependencies.",
      notes: "",
      type: "TASK",
      status: "NOT_STARTED",
      priority: "HIGH",
      progressPercent: 0,
      durationDays: 4,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 32,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 500,
      manualStartDate: null,
      manualFinishDate: null,
    },
    {
      id: `${projectId}-phase-2`,
      projectId,
      parentId: null,
      sortOrder: 20,
      name: "Deliver",
      description: "Core delivery work package.",
      notes: "",
      type: "SUMMARY",
      status: "NOT_STARTED",
      priority: "HIGH",
      progressPercent: 0,
      durationDays: 0,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 0,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 500,
      manualStartDate: null,
      manualFinishDate: null,
    },
    {
      id: `${projectId}-phase-2-1`,
      projectId,
      parentId: `${projectId}-phase-2`,
      sortOrder: 21,
      name: "Execution window",
      description: "Primary delivery sequence.",
      notes: "",
      type: "TASK",
      status: "NOT_STARTED",
      priority: "HIGH",
      progressPercent: 0,
      durationDays: 10,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 80,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 500,
      manualStartDate: null,
      manualFinishDate: null,
    },
  ];

  const dependencies: Dependency[] = [
    {
      id: `${projectId}-dep-1`,
      projectId,
      predecessorProjectId: projectId,
      predecessorTaskId: `${projectId}-phase-1-1`,
      successorProjectId: projectId,
      successorTaskId: `${projectId}-phase-1-2`,
      type: "FS",
      lagDays: 0,
      createdAt: nowIso(),
    },
    {
      id: `${projectId}-dep-2`,
      projectId,
      predecessorProjectId: projectId,
      predecessorTaskId: `${projectId}-phase-1-2`,
      successorProjectId: projectId,
      successorTaskId: `${projectId}-phase-2-1`,
      type: "FS",
      lagDays: 0,
      createdAt: nowIso(),
    },
  ];

  return {
    tasks: baseTasks.map((task) => ({
      ...task,
      actualStartDate: null,
      actualFinishDate: null,
      actualWorkHours: 0,
      remainingWorkHours:
        task.type === "TASK" ? roundWorkHours(task.effortHours ?? 0) : 0,
    })),
    dependencies,
  };
}

/**
 * Construit la structure à partir des Lots de Tâches (LT) saisis à la création :
 * chaque LT devient une phase (SUMMARY) portant son montant budgété, avec une
 * tâche de démarrage à planifier en dessous.
 */
function createLotSkeleton(
  projectId: string,
  lots: CreateProjectLotInput[],
  startDate: string,
): Task[] {
  const tasks: Task[] = [];
  lots.forEach((lot, index) => {
    const lotId = `${projectId}-lot-${index + 1}`;
    const childId = `${lotId}-1`;
    const budget = Math.max(0, Number(lot.budgetAmount) || 0);

    tasks.push({
      id: lotId,
      projectId,
      parentId: null,
      sortOrder: (index + 1) * 10,
      name: lot.name?.trim() || `Lot ${index + 1}`,
      description: "",
      notes: "",
      type: "SUMMARY",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      progressPercent: 0,
      durationDays: 0,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 0,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 500,
      manualStartDate: null,
      manualFinishDate: null,
      actualStartDate: null,
      actualFinishDate: null,
      actualWorkHours: 0,
      remainingWorkHours: 0,
      budgetAmount: budget,
    });

    tasks.push({
      id: childId,
      projectId,
      parentId: lotId,
      sortOrder: (index + 1) * 10 + 1,
      name: "À planifier",
      description: "",
      notes: "",
      type: "TASK",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      progressPercent: 0,
      durationDays: 5,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 40,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      constraintType: index === 0 ? "START_NO_EARLIER_THAN" : "ASAP",
      constraintDate: index === 0 ? startDate : null,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 500,
      manualStartDate: null,
      manualFinishDate: null,
      actualStartDate: null,
      actualFinishDate: null,
      actualWorkHours: 0,
      remainingWorkHours: roundWorkHours(40),
      budgetAmount: null,
    });
  });
  return tasks;
}

function buildBaselineVariance(
  aggregate: ProjectAggregate,
  tasks: ScheduledTask[],
  activeBaseline?: Baseline,
) {
  const baselineVarianceByTaskId: Record<string, BaselineVariance> = {};
  if (!activeBaseline) {
    return baselineVarianceByTaskId;
  }

  const statusDate = todayIso();
  const snapshotMap = new Map(
    activeBaseline.snapshots.map((snapshot) => [snapshot.taskId, snapshot]),
  );

  for (const task of tasks) {
    const snapshot = snapshotMap.get(task.id);
    if (!snapshot) {
      continue;
    }

    const plannedValue = roundCurrency(
      snapshot.plannedCost *
        getBaselinePlannedPercentAtDate(snapshot, statusDate, aggregate.calendar),
    );
    const earnedValue = roundCurrency(
      snapshot.plannedCost * (Math.min(Math.max(task.progressPercent, 0), 100) / 100),
    );
    const actualCost = getTaskCurrentActualCost(task, aggregate);
    const scheduleVariance = roundCurrency(earnedValue - plannedValue);
    const earnedValueCostVariance = roundCurrency(earnedValue - actualCost);

    baselineVarianceByTaskId[task.id] = {
      snapshot,
      startVarianceDays:
        snapshot.startDate && task.scheduledStartDate
          ? workingDayDistance(snapshot.startDate, task.scheduledStartDate, aggregate.calendar)
          : null,
      finishVarianceDays:
        snapshot.finishDate && task.scheduledFinishDate
          ? workingDayDistance(snapshot.finishDate, task.scheduledFinishDate, aggregate.calendar)
          : null,
      durationVarianceDays: task.durationDays - snapshot.durationDays,
      workVarianceHours: roundWorkHours((task.effortHours ?? 0) - snapshot.workHours),
      costVariance: roundCurrency(
        getTaskCurrentPlannedCost(task, aggregate) - snapshot.plannedCost,
      ),
      plannedValue,
      earnedValue,
      actualCost,
      scheduleVariance,
      earnedValueCostVariance,
      schedulePerformanceIndex:
        plannedValue > 0 ? roundRatio(earnedValue / plannedValue) : null,
      costPerformanceIndex:
        actualCost > 0 ? roundRatio(earnedValue / actualCost) : null,
    };
  }

  return baselineVarianceByTaskId;
}

function buildResourceSummaries(
  aggregate: ProjectAggregate,
  tasksById: Record<string, ScheduledTask>,
) {
  return aggregate.resources
    .map((resource): ResourceSummary => {
      const dailyLoad = new Map<
        ISODate,
        { allocatedHours: number; capacityHours: number }
      >();
      const assignedTaskIds = new Set<string>();
      let totalAllocatedHours = 0;
      let totalPlannedCost = 0;
      const resourceTimesheetEntries = aggregate.timesheetEntries.filter(
        (entry) => entry.resourceId === resource.id,
      );
      const resourceTimesheetTaskIds = new Set(
        resourceTimesheetEntries.map((entry) => entry.taskId),
      );
      const resourceLedgerEntries = getResourceActualCostEntries(
        aggregate,
        resource.id,
      );
      let totalActualHours = roundWorkHours(
        resourceTimesheetEntries.reduce((total, entry) => total + entry.workHours, 0),
      );
      let totalActualCost = roundCurrency(
        resourceLedgerEntries.length
          ? resourceLedgerEntries.reduce((total, entry) => total + entry.amount, 0)
          : resourceTimesheetEntries.reduce((total, entry) => {
              if (typeof entry.costAmount === "number") {
                return total + entry.costAmount;
              }

              return total + entry.workHours * (resource.costRate ?? 0);
            }, 0),
      );

      for (const assignment of aggregate.assignments.filter(
        (entry) => entry.resourceId === resource.id,
      )) {
        const task = tasksById[assignment.taskId];
        if (!task?.scheduledStartDate || !task.scheduledFinishDate) {
          continue;
        }

        assignedTaskIds.add(task.id);
        const dailyWorkHours = getAssignmentDailyWorkHours(
          assignment,
          task,
          aggregate,
        );
        let cursor = task.scheduledStartDate;
        const taskCalendar = getTaskWorkingCalendar(aggregate, task);

        while (compareIsoDates(cursor, task.scheduledFinishDate) <= 0) {
          const dayBucket = dailyLoad.get(cursor) ?? {
            allocatedHours: 0,
            capacityHours: getResourceCapacityHoursOnDate(aggregate, resource, cursor),
          };
          dayBucket.allocatedHours += dailyWorkHours;
          dailyLoad.set(cursor, dayBucket);
          totalAllocatedHours += dailyWorkHours;
          if (resource.costRate) {
            totalPlannedCost += dailyWorkHours * resource.costRate;
          }

          if (cursor === task.scheduledFinishDate) {
            break;
          }

          cursor = addWorkingDays(cursor, 1, taskCalendar);
        }

        if (!resourceTimesheetTaskIds.has(task.id)) {
          const taskAllocationPct = Math.max(
            aggregate.assignments
              .filter((entry) => entry.taskId === task.id)
              .reduce((total, entry) => total + entry.allocationPct, 0),
            assignment.allocationPct,
            1,
          );
          const actualHoursShare =
            getEffectiveTaskActualWorkHours(task, aggregate) *
            (assignment.allocationPct / taskAllocationPct);
          totalActualHours += actualHoursShare;
          if (!resourceLedgerEntries.length && resource.costRate) {
            totalActualCost += actualHoursShare * resource.costRate;
          }
        }
      }

      // Période de charge selon l'UNITÉ du projet (spec François 29/08) : mois → buckets
      // MENSUELS, sinon buckets hebdomadaires. Le nom de champ reste loadByWeek/weekLabel ;
      // seule la granularité (et le libellé) change — l'UI adapte les intitulés.
      const monthlyLoad = aggregate.project.timeUnit === "mois";
      const periodLoad = new Map<
        string,
        { key: string; label: string; allocatedHours: number; capacityHours: number }
      >();
      for (const [date, dayBucket] of dailyLoad.entries()) {
        let key: string;
        let label: string;
        if (monthlyLoad) {
          key = String(date).slice(0, 7); // YYYY-MM
          label = new Date(`${String(date).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", {
            month: "short",
            year: "2-digit",
            timeZone: "UTC",
          });
        } else {
          key = getWeekLabel(getWeekStart(date));
          label = key;
        }
        const bucket = periodLoad.get(key) ?? { key, label, allocatedHours: 0, capacityHours: 0 };
        bucket.allocatedHours += dayBucket.allocatedHours;
        bucket.capacityHours += dayBucket.capacityHours;
        periodLoad.set(key, bucket);
      }

      const loadByWeek = [...periodLoad.values()]
        .sort((left, right) => left.key.localeCompare(right.key))
        .map((bucket) => ({
          weekLabel: bucket.label,
          allocatedHours: roundWorkHours(bucket.allocatedHours),
          capacityHours: roundWorkHours(bucket.capacityHours),
          allocationPct:
            bucket.capacityHours > 0
              ? Math.round((bucket.allocatedHours / bucket.capacityHours) * 100)
              : 0,
        }));
      const maxAllocationPct = Math.max(0, ...loadByWeek.map((item) => item.allocationPct));
      const maxAllocatedHours = Math.max(0, ...loadByWeek.map((item) => item.allocatedHours));

      return {
        resource,
        loadByWeek,
        maxAllocationPct,
        maxAllocatedHours,
        totalAllocatedHours: roundWorkHours(totalAllocatedHours),
        totalPlannedCost: roundWorkHours(totalPlannedCost),
        totalActualHours: roundWorkHours(totalActualHours),
        totalActualCost: roundCurrency(totalActualCost),
        overloadedWeeks: loadByWeek.filter(
          (item) => item.allocationPct > 100,
        ).length,
        assignedTaskCount: assignedTaskIds.size,
      };
    })
    .sort((left, right) => right.maxAllocationPct - left.maxAllocationPct);
}

function deriveProjectHealth(input: {
  delayedTaskCount: number;
  deadlineMissCount: number;
  overdueCriticalCount: number;
  overloadedResourceCount: number;
  scheduleIssueCount: number;
  externalDependencyCount: number;
  externalPredecessorCount: number;
  scheduleSlipDays: number;
  maxBaselineSlip: number;
  totalLevelingDelayDays: number;
  schedulePerformanceIndex?: number | null;
  costPerformanceIndex?: number | null;
}) {
  const reasons: string[] = [];
  let severity = 0;

  if (input.scheduleSlipDays > 0) {
    severity = Math.max(severity, input.scheduleSlipDays > 5 ? 3 : 2);
    reasons.push(
      `La fin prévisionnelle dépasse la cible de ${input.scheduleSlipDays} jour(s) ouvres.`,
    );
  }

  if (input.overdueCriticalCount > 0) {
    severity = Math.max(severity, 3);
    reasons.push(
      `${input.overdueCriticalCount} tâche(s) critique(s) ont déjà dépasse leur date de fin.`,
    );
  }

  if (input.deadlineMissCount > 0) {
    severity = Math.max(severity, input.deadlineMissCount > 1 ? 3 : 2);
    reasons.push(`${input.deadlineMissCount} échéance(s) de tâche sont déjà depassees.`);
  }

  if (input.delayedTaskCount > 0) {
    severity = Math.max(severity, input.delayedTaskCount > 3 ? 2 : 1);
    reasons.push(`${input.delayedTaskCount} tâche(s) sont actuellement en retard.`);
  }

  if (input.overloadedResourceCount > 0) {
    severity = Math.max(severity, input.overloadedResourceCount > 2 ? 2 : 1);
    reasons.push(
      `${input.overloadedResourceCount} ressource(s) montrent une surcharge hebdomadaire.`,
    );
  }

  if (input.scheduleIssueCount > 0) {
    severity = Math.max(severity, 1);
    reasons.push(`${input.scheduleIssueCount} alerte(s) d'ordonnancement demandent une revue.`);
  }

  if (input.externalDependencyCount > 0) {
    severity = Math.max(severity, input.externalPredecessorCount > 0 ? 2 : 1);
    reasons.push(
      `${input.externalDependencyCount} lien(s) de dépendance inter-projets influencent le plan.`,
    );
  }

  if (input.maxBaselineSlip > 0) {
    severity = Math.max(severity, input.maxBaselineSlip > 5 ? 2 : 1);
    reasons.push(`Le plus grand écart de fin par rapport à la baseline est de ${input.maxBaselineSlip} jour(s).`);
  }

  if (input.totalLevelingDelayDays > 0) {
    severity = Math.max(severity, input.totalLevelingDelayDays > 5 ? 2 : 1);
    reasons.push(
      `Le lissage des ressources ajouté actuellement ${input.totalLevelingDelayDays} jour(s) ouvres de retard.`,
    );
  }

  if ((input.schedulePerformanceIndex ?? 1) < 1) {
    severity = Math.max(
      severity,
      (input.schedulePerformanceIndex ?? 1) < 0.9 ? 2 : 1,
    );
    reasons.push(
      `L'indice de performance planning en valeur acquise est de ${(input.schedulePerformanceIndex ?? 0).toFixed(2)}.`,
    );
  }

  if ((input.costPerformanceIndex ?? 1) < 1) {
    severity = Math.max(
      severity,
      (input.costPerformanceIndex ?? 1) < 0.9 ? 2 : 1,
    );
    reasons.push(
      `L'indice de performance coût en valeur acquise est de ${(input.costPerformanceIndex ?? 0).toFixed(2)}.`,
    );
  }

  return {
    derivedHealth:
      severity >= 3
        ? "OFF_TRACK"
        : severity === 2
          ? "AT_RISK"
          : severity === 1
            ? "WATCH"
            : "ON_TRACK",
    healthReasons:
      reasons.length > 0
        ? reasons.slice(0, 4)
        : ["Aucun risque derive du planning n'est actuellement signale."],
  } satisfies Pick<ProjectMetrics, "derivedHealth" | "healthReasons">;
}

function buildDashboardMetrics(
  aggregate: ProjectAggregate,
  tasks: ScheduledTask[],
  resourceSummaries: ResourceSummary[],
  baselineVarianceByTaskId: Record<string, BaselineVariance>,
  scheduleIssueCount: number,
  dependencyNetwork: DependencyNetworkEntry[],
) {
  const executableTasks = tasks.filter((task) => !task.isSummary);
  // Décalage dû au nivellement = écart entre « au plus tôt pur » et le planifié
  // (couvre les délais historiques ET les liens ressources du nouveau nivellement).
  const levelingShiftByTaskId = new Map<string, number>();
  for (const task of executableTasks) {
    if (task.earliestStartDate && task.scheduledStartDate && task.scheduledStartDate > task.earliestStartDate) {
      levelingShiftByTaskId.set(
        task.id,
        workingDayDistance(task.earliestStartDate, task.scheduledStartDate, aggregate.calendar),
      );
    } else if ((task.levelingDelayDays ?? 0) > 0) {
      levelingShiftByTaskId.set(task.id, task.levelingDelayDays);
    }
  }
  const leveledTasks = executableTasks.filter((task) => (levelingShiftByTaskId.get(task.id) ?? 0) > 0);
  const totalPlannedWorkHours = roundWorkHours(
    executableTasks.reduce((total, task) => total + (task.effortHours ?? 0), 0),
  );
  const totalPlannedCost = roundCurrency(
    executableTasks.reduce(
      (total, task) => total + getTaskCurrentPlannedCost(task, aggregate),
      0,
    ),
  );
  const totalActualWorkHours = roundWorkHours(
    executableTasks.reduce((total, task) => total + (task.actualWorkHours ?? 0), 0),
  );
  const totalRemainingWorkHours = roundWorkHours(
    executableTasks.reduce(
      (total, task) => total + (task.remainingWorkHours ?? 0),
      0,
    ),
  );
  const totalActualCost = roundCurrency(getProjectActualCost(aggregate));
  const actualCostBreakdown = getProjectActualCostBreakdown(aggregate);
  const totalLevelingDelayDays = leveledTasks.reduce(
    (total, task) => total + (levelingShiftByTaskId.get(task.id) ?? 0),
    0,
  );
  const baselineBudgetAtCompletion = Object.keys(baselineVarianceByTaskId).length
    ? roundCurrency(
        Object.values(baselineVarianceByTaskId).reduce(
          (total, variance) => total + (variance.snapshot?.plannedCost ?? 0),
          0,
        ),
      )
    : null;
  const plannedValue = Object.keys(baselineVarianceByTaskId).length
    ? roundCurrency(
        Object.values(baselineVarianceByTaskId).reduce(
          (total, variance) => total + (variance.plannedValue ?? 0),
          0,
        ),
      )
    : null;
  const earnedValue = Object.keys(baselineVarianceByTaskId).length
    ? roundCurrency(
        Object.values(baselineVarianceByTaskId).reduce(
          (total, variance) => total + (variance.earnedValue ?? 0),
          0,
        ),
      )
    : null;
  const earnedValueScheduleVariance =
    plannedValue != null && earnedValue != null
      ? roundCurrency(earnedValue - plannedValue)
      : null;
  const earnedValueCostVariance =
    earnedValue != null ? roundCurrency(earnedValue - totalActualCost) : null;
  const schedulePerformanceIndex =
    plannedValue && plannedValue > 0 && earnedValue != null
      ? roundRatio(earnedValue / plannedValue)
      : null;
  const costPerformanceIndex =
    totalActualCost > 0 && earnedValue != null
      ? roundRatio(earnedValue / totalActualCost)
      : null;
  const estimateAtCompletion =
    baselineBudgetAtCompletion != null &&
    costPerformanceIndex != null &&
    costPerformanceIndex > 0
      ? roundCurrency(baselineBudgetAtCompletion / costPerformanceIndex)
      : null;
  const varianceAtCompletion =
    baselineBudgetAtCompletion != null && estimateAtCompletion != null
      ? roundCurrency(baselineBudgetAtCompletion - estimateAtCompletion)
      : null;
  const baselineWorkVarianceHours = Object.keys(baselineVarianceByTaskId).length
    ? roundWorkHours(
        Object.values(baselineVarianceByTaskId).reduce(
          (total, variance) => total + (variance.workVarianceHours ?? 0),
          0,
        ),
      )
    : null;
  const baselineCostVariance = Object.keys(baselineVarianceByTaskId).length
    ? roundCurrency(
        Object.values(baselineVarianceByTaskId).reduce(
          (total, variance) => total + (variance.costVariance ?? 0),
          0,
        ),
      )
    : null;
  const weightedDuration = executableTasks.reduce(
    (total, task) => total + Math.max(task.durationDays, task.type === "MILESTONE" ? 1 : 0),
    0,
  );
  const externalDependencies = dependencyNetwork.filter(
    (entry) => entry.externalToProject,
  );
  const externalPredecessorCount = externalDependencies.filter(
    (entry) => entry.successor.projectId === aggregate.project.id,
  ).length;
  const externalSuccessorCount = externalDependencies.filter(
    (entry) => entry.predecessor.projectId === aggregate.project.id,
  ).length;
  const overallProgress = weightedDuration
    ? Math.round(
        executableTasks.reduce(
          (total, task) =>
            total +
            Math.max(task.durationDays, task.type === "MILESTONE" ? 1 : 0) *
              task.progressPercent,
          0,
        ) / weightedDuration,
      )
    : 0;

  const today = todayIso();
  const delayedTasks = executableTasks.filter(
    (task) =>
      task.scheduledFinishDate &&
      compareIsoDates(task.scheduledFinishDate, today) < 0 &&
      task.status !== "DONE",
  );
  const deadlineMissCount = executableTasks.filter(
    (task) =>
      task.deadlineDate &&
      task.scheduledFinishDate &&
      compareIsoDates(task.scheduledFinishDate, task.deadlineDate) > 0,
  ).length;
  const criticalTasks = executableTasks.filter((task) => task.isCritical);
  const overdueCriticalCount = delayedTasks.filter((task) => task.isCritical).length;
  const milestones = executableTasks.filter((task) => task.type === "MILESTONE");
  const nearMilestones = milestones
    .filter((task) => {
      if (!task.scheduledFinishDate) {
        return false;
      }

      const delta = workingDayDistance(today, task.scheduledFinishDate, aggregate.calendar);
      return delta >= 0 && delta <= 10;
    })
    .sort((left, right) =>
      compareIsoDates(left.scheduledFinishDate ?? null, right.scheduledFinishDate ?? null),
    )
    .slice(0, 4);

  const maxBaselineSlip = Math.max(
    0,
    ...Object.values(baselineVarianceByTaskId).map(
      (variance) => variance.finishVarianceDays ?? 0,
    ),
  );
  const hotResource = resourceSummaries[0];
  const overloadedResourceCount = resourceSummaries.filter(
    (summary) => summary.overloadedWeeks > 0,
  ).length;
  const finishVarianceHint = aggregate.project.targetFinishDate
    ? `${aggregate.project.targetFinishDate} target`
    : undefined;
  const finishValue =
    maxIsoDate(executableTasks.map((task) => task.scheduledFinishDate ?? null)) ?? "Unscheduled";
  const scheduleSlipDays =
    aggregate.project.targetFinishDate && finishValue !== "Unscheduled"
      ? Math.max(
          0,
          workingDayDistance(
            aggregate.project.targetFinishDate,
            finishValue,
            aggregate.calendar,
          ),
        )
      : 0;
  const { derivedHealth, healthReasons } = deriveProjectHealth({
    delayedTaskCount: delayedTasks.length,
    deadlineMissCount,
    overdueCriticalCount,
    overloadedResourceCount,
    scheduleIssueCount,
    externalDependencyCount: externalDependencies.length,
    externalPredecessorCount,
    scheduleSlipDays,
    maxBaselineSlip,
    totalLevelingDelayDays,
    schedulePerformanceIndex,
    costPerformanceIndex,
  });

  // Indicateurs de délai (la FP et l'indice délai sont dans le bandeau et le cockpit :
  // on ne les répète pas ici). Unité = unité du projet.
  const metricUnit = aggregate.project.timeUnit ?? "jours";
  const metricUnitLabel = metricUnit === "mois" ? "mois" : metricUnit === "semaines" ? "sem." : metricUnit === "heures" ? "h" : "j";
  const inUnit = (days: number) => {
    const v = fromWorkingDays(days, metricUnit, aggregate.calendar.hoursPerDay);
    return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${metricUnitLabel}`;
  };
  const dashboardMetrics: DashboardMetric[] = [
    {
      label: "Avancement",
      value: `${overallProgress} %`,
      tone: overallProgress >= 70 ? "positive" : overallProgress >= 40 ? "watch" : "neutral",
      hint: `${executableTasks.length} LT exécutables`,
    },
    {
      label: "Chemin critique",
      value: `${criticalTasks.length} LT`,
      tone: criticalTasks.length > 5 ? "danger" : criticalTasks.length > 2 ? "watch" : "neutral",
      hint: "LT à marge totale nulle ou négative",
    },
    {
      label: "Écart au PI (plus grand)",
      value: inUnit(maxBaselineSlip),
      tone: maxBaselineSlip > 5 ? "danger" : maxBaselineSlip > 0 ? "watch" : "positive",
      hint: "Plus grand écart de fin d'un LT",
    },
    {
      label: "Charge ressources",
      value: hotResource ? `${hotResource.maxAllocationPct} %` : "0 %",
      tone:
        hotResource && hotResource.maxAllocationPct > 100
          ? "danger"
        : hotResource && hotResource.maxAllocationPct > 85
            ? "watch"
            : "positive",
      hint: hotResource ? `Pic : ${hotResource.resource.name}` : "Aucune affectation",
    },
    {
      label: "Liens inter-projets",
      value: `${externalDependencies.length}`,
      tone:
        externalPredecessorCount > 0
          ? "watch"
          : externalDependencies.length > 0
            ? "neutral"
            : "positive",
      hint:
        externalDependencies.length > 0
          ? `${externalPredecessorCount} entrant(s) / ${externalSuccessorCount} sortant(s)`
          : "Aucun lien logique externe",
    },
    {
      label: "Décalage de nivellement",
      value: inUnit(totalLevelingDelayDays),
      tone:
        totalLevelingDelayDays > 5
          ? "danger"
          : totalLevelingDelayDays > 0
            ? "watch"
            : "positive",
      hint: `${leveledTasks.length} LT décalé(s) pour les capacités`,
    },
  ];

  return {
    overallProgress,
    executableTaskCount: executableTasks.length,
    criticalTaskCount: criticalTasks.length,
    delayedTaskCount: delayedTasks.length,
    deadlineMissCount,
    overdueCriticalCount,
    milestoneCount: milestones.length,
    overloadedResourceCount,
    scheduleIssueCount,
    externalDependencyCount: externalDependencies.length,
    externalPredecessorCount,
    externalSuccessorCount,
    scheduleSlipDays,
    totalPlannedWorkHours,
    totalPlannedCost,
    totalActualWorkHours,
    totalRemainingWorkHours,
    totalActualCost,
    totalLaborActualCost: actualCostBreakdown.labor,
    totalNonLaborActualCost: actualCostBreakdown.nonLabor,
    actualCostEntryCount: actualCostBreakdown.count,
    baselineBudgetAtCompletion,
    plannedValue,
    earnedValue,
    earnedValueScheduleVariance,
    earnedValueCostVariance,
    schedulePerformanceIndex,
    costPerformanceIndex,
    estimateAtCompletion,
    varianceAtCompletion,
    baselineWorkVarianceHours,
    baselineCostVariance,
    leveledTaskCount: leveledTasks.length,
    totalLevelingDelayDays,
    derivedHealth,
    healthReasons,
    nearMilestones,
    delayedTasks,
    criticalTasks,
    dashboardMetrics,
  } satisfies ProjectMetrics;
}

function areSchedulesEquivalent(
  left: ReturnType<typeof buildSchedule> | undefined,
  right: ReturnType<typeof buildSchedule>,
) {
  if (!left) {
    return false;
  }

  if (
    left.projectStartDate !== right.projectStartDate ||
    left.projectFinishDate !== right.projectFinishDate ||
    left.orderedTaskIds.length !== right.orderedTaskIds.length ||
    left.issues.length !== right.issues.length
  ) {
    return false;
  }

  for (let index = 0; index < left.orderedTaskIds.length; index += 1) {
    const taskId = left.orderedTaskIds[index];
    if (right.orderedTaskIds[index] !== taskId) {
      return false;
    }

    const previousTask = left.tasksById[taskId];
    const nextTask = right.tasksById[taskId];
    if (
      !nextTask ||
      previousTask.scheduledStartDate !== nextTask.scheduledStartDate ||
      previousTask.scheduledFinishDate !== nextTask.scheduledFinishDate ||
      previousTask.earliestStartDate !== nextTask.earliestStartDate ||
      previousTask.earliestFinishDate !== nextTask.earliestFinishDate ||
      previousTask.latestStartDate !== nextTask.latestStartDate ||
      previousTask.latestFinishDate !== nextTask.latestFinishDate ||
      previousTask.totalSlackDays !== nextTask.totalSlackDays ||
      previousTask.freeSlackDays !== nextTask.freeSlackDays ||
      previousTask.isCritical !== nextTask.isCritical
    ) {
      return false;
    }
  }

  for (let index = 0; index < left.issues.length; index += 1) {
    const previousIssue = left.issues[index];
    const nextIssue = right.issues[index];
    if (
      !nextIssue ||
      previousIssue.code !== nextIssue.code ||
      previousIssue.message !== nextIssue.message ||
      previousIssue.taskId !== nextIssue.taskId ||
      previousIssue.dependencyId !== nextIssue.dependencyId
    ) {
      return false;
    }
  }

  return true;
}

function buildExternalTaskReferencesForProject(
  projectId: string,
  effectiveAggregatesByProjectId: Map<string, ProjectAggregate>,
  schedulesByProjectId: Map<string, ReturnType<typeof buildSchedule>>,
): ExternalScheduledTaskReference[] {
  const references: ExternalScheduledTaskReference[] = [];

  for (const [externalProjectId, aggregate] of effectiveAggregatesByProjectId.entries()) {
    if (externalProjectId === projectId) {
      continue;
    }

    const schedule = schedulesByProjectId.get(externalProjectId);
    if (!schedule) {
      continue;
    }

    const taskMap = new Map(aggregate.tasks.map((task) => [task.id, task]));
    for (const taskId of schedule.orderedTaskIds) {
      const scheduledTask = schedule.tasksById[taskId];
      const sourceTask = taskMap.get(taskId);
      if (!scheduledTask || !sourceTask) {
        continue;
      }

      references.push({
        ...scheduledTask,
        projectId: externalProjectId,
        calendar: getTaskWorkingCalendar(aggregate, sourceTask),
      });
    }
  }

  return references;
}

function buildDependencyNetworkEntries(
  store: AppDataStore,
  projectId: string,
  schedulesByProjectId: Map<string, ReturnType<typeof buildSchedule>>,
): DependencyNetworkEntry[] {
  return getRelevantDependenciesForProject(store, projectId)
    .map((dependency) => {
      const predecessorLookup = findTaskInStore(
        store,
        dependency.predecessorProjectId,
        dependency.predecessorTaskId,
      );
      const successorLookup = findTaskInStore(
        store,
        dependency.successorProjectId,
        dependency.successorTaskId,
      );
      const predecessorSchedule = schedulesByProjectId
        .get(dependency.predecessorProjectId)
        ?.tasksById[dependency.predecessorTaskId];
      const successorSchedule = schedulesByProjectId
        .get(dependency.successorProjectId)
        ?.tasksById[dependency.successorTaskId];

      return {
        dependency,
        predecessor: {
          projectId: dependency.predecessorProjectId,
          projectCode: predecessorLookup?.aggregate.project.code ?? "Unknown",
          projectName: predecessorLookup?.aggregate.project.name ?? "Unknown project",
          taskId: dependency.predecessorTaskId,
          taskName: predecessorLookup?.task.name ?? "Missing task",
          wbsCode: predecessorSchedule?.wbsCode ?? null,
        },
        successor: {
          projectId: dependency.successorProjectId,
          projectCode: successorLookup?.aggregate.project.code ?? "Unknown",
          projectName: successorLookup?.aggregate.project.name ?? "Unknown project",
          taskId: dependency.successorTaskId,
          taskName: successorLookup?.task.name ?? "Missing task",
          wbsCode: successorSchedule?.wbsCode ?? null,
        },
        externalToProject:
          dependency.predecessorProjectId !== projectId ||
          dependency.successorProjectId !== projectId,
      } satisfies DependencyNetworkEntry;
    })
    .sort((left, right) => {
      if (left.externalToProject !== right.externalToProject) {
        return left.externalToProject ? -1 : 1;
      }

      return left.dependency.createdAt.localeCompare(right.dependency.createdAt);
    });
}

function buildDependencyOptions(
  currentProjectId: string,
  effectiveAggregatesByProjectId: Map<string, ProjectAggregate>,
  schedulesByProjectId: Map<string, ReturnType<typeof buildSchedule>>,
): DependencyProjectOption[] {
  return [...effectiveAggregatesByProjectId.values()]
    .filter(
      (aggregate) =>
        aggregate.project.id === currentProjectId || !aggregate.project.archivedAt,
    )
    .sort((left, right) => {
      if (left.project.id === currentProjectId) {
        return -1;
      }

      if (right.project.id === currentProjectId) {
        return 1;
      }

      return left.project.name.localeCompare(right.project.name);
    })
    .map((aggregate) => {
      const schedule = schedulesByProjectId.get(aggregate.project.id);
      const tasks =
        schedule?.orderedTaskIds
          .map((taskId) => schedule.tasksById[taskId])
          .filter((task) => task && !task.isSummary)
          .map((task) => ({
            taskId: task.id,
            wbsCode: task.wbsCode,
            name: task.name,
            type: task.type,
            isSummary: task.isSummary,
          })) ?? [];

      return {
        projectId: aggregate.project.id,
        code: aggregate.project.code,
        name: aggregate.project.name,
        archivedAt: aggregate.project.archivedAt ?? null,
        tasks,
      } satisfies DependencyProjectOption;
    })
    .filter((projectOption) => projectOption.tasks.length > 0);
}

function buildPortfolioScheduleContext(store: AppDataStore): PortfolioScheduleContext {
  const sortedAggregates = sortProjectAggregates(store.projects);
  const effectiveAggregates = sortedAggregates.map((aggregate) =>
    overlayTimesheetActuals(aggregate),
  );
  const effectiveAggregatesByProjectId = new Map(
    effectiveAggregates.map((aggregate) => [aggregate.project.id, aggregate]),
  );
  const dependenciesByProjectId = new Map(
    effectiveAggregates.map((aggregate) => [
      aggregate.project.id,
      getRelevantDependenciesForProject(store, aggregate.project.id),
    ]),
  );
  let schedulesByProjectId = new Map(
    effectiveAggregates.map((aggregate) => [
      aggregate.project.id,
      buildSchedule(aggregate),
    ]),
  );
  const iterationLimit = Math.max(4, effectiveAggregates.length * 3);

  for (let iteration = 0; iteration < iterationLimit; iteration += 1) {
    let changed = false;
    const nextSchedules = new Map<string, ReturnType<typeof buildSchedule>>();

    for (const aggregate of effectiveAggregates) {
      const schedule = buildSchedule(aggregate, {
        dependencies:
          dependenciesByProjectId.get(aggregate.project.id) ?? aggregate.dependencies,
        externalTasks: buildExternalTaskReferencesForProject(
          aggregate.project.id,
          effectiveAggregatesByProjectId,
          schedulesByProjectId,
        ),
      });

      nextSchedules.set(aggregate.project.id, schedule);
      if (
        !areSchedulesEquivalent(
          schedulesByProjectId.get(aggregate.project.id),
          schedule,
        )
      ) {
        changed = true;
      }
    }

    schedulesByProjectId = nextSchedules;
    if (!changed) {
      break;
    }
  }

  const dependencyNetworkByProjectId = new Map(
    effectiveAggregates.map((aggregate) => [
      aggregate.project.id,
      buildDependencyNetworkEntries(
        store,
        aggregate.project.id,
        schedulesByProjectId,
      ),
    ]),
  );
  const dependencyOptionsByProjectId = new Map(
    effectiveAggregates.map((aggregate) => [
      aggregate.project.id,
      buildDependencyOptions(
        aggregate.project.id,
        effectiveAggregatesByProjectId,
        schedulesByProjectId,
      ),
    ]),
  );

  return {
    effectiveAggregatesByProjectId,
    schedulesByProjectId,
    dependencyNetworkByProjectId,
    dependencyOptionsByProjectId,
  };
}

function buildProjectViewFromAggregate(
  aggregate: ProjectAggregate,
  context?: PortfolioScheduleContext,
): ProjectView {
  const effectiveAggregate =
    context?.effectiveAggregatesByProjectId.get(aggregate.project.id) ??
    overlayTimesheetActuals(aggregate);
  const schedule =
    context?.schedulesByProjectId.get(aggregate.project.id) ??
    buildSchedule(effectiveAggregate);
  const tasks = schedule.orderedTaskIds.map((taskId) => schedule.tasksById[taskId]);
  const activeBaseline = effectiveAggregate.baselines.find((baseline) => baseline.isActive);
  const baselineVarianceByTaskId = buildBaselineVariance(
    effectiveAggregate,
    tasks,
    activeBaseline,
  );
  const resourceSummaries = buildResourceSummaries(
    effectiveAggregate,
    schedule.tasksById,
  );
  const dependencyNetwork =
    context?.dependencyNetworkByProjectId.get(aggregate.project.id) ??
    buildDependencyNetworkEntries(
      {
        version: 0,
        metadata: {
          seededFrom: "runtime",
          initializedAt: nowIso(),
          lastUpdatedAt: nowIso(),
        },
        projects: [effectiveAggregate],
      },
      aggregate.project.id,
      new Map([[aggregate.project.id, schedule]]),
    );
  const dependencyOptions =
    context?.dependencyOptionsByProjectId.get(aggregate.project.id) ??
    buildDependencyOptions(
      aggregate.project.id,
      new Map([[aggregate.project.id, effectiveAggregate]]),
      new Map([[aggregate.project.id, schedule]]),
    );
  const metrics = buildDashboardMetrics(
    effectiveAggregate,
    tasks,
    resourceSummaries,
    baselineVarianceByTaskId,
    schedule.issues.length,
    dependencyNetwork,
  );

  return {
    aggregate: effectiveAggregate,
    schedule,
    tasks,
    activeBaseline,
    baselineVarianceByTaskId,
    dependencyNetwork,
    dependencyOptions,
    resourceSummaries,
    metrics,
  };
}

/* ── Cache du contexte portefeuille ─────────────────────────────────────────
   Chaque onglet recalculait tout le portefeuille (~1 s). Le contexte est
   désormais mis en cache tant que le store n'a pas changé (même révision,
   même jour — la date d'état intervient dans le calcul). */
const portfolioContextCache = new Map<string, PortfolioScheduleContext>();
const PORTFOLIO_CACHE_LIMIT = 6;

function getPortfolioScheduleContext(store: AppDataStore, scope = "*"): PortfolioScheduleContext {
  const key = [
    scope,
    store.metadata?.lastUpdatedAt ?? "",
    store.projects.length,
    store.projects.reduce((n, p) => n + p.tasks.length, 0),
    todayIso(),
  ].join("|");
  const cached = portfolioContextCache.get(key);
  if (cached) return cached;
  const context = buildPortfolioScheduleContext(store);
  portfolioContextCache.set(key, context);
  while (portfolioContextCache.size > PORTFOLIO_CACHE_LIMIT) {
    const oldest = portfolioContextCache.keys().next().value;
    if (oldest === undefined) break;
    portfolioContextCache.delete(oldest);
  }
  return context;
}

const projectViewCache = new Map<string, ProjectView>();

function buildProjectViewFromStore(store: AppDataStore, projectId: string) {
  const key = `${store.metadata?.lastUpdatedAt ?? ""}|${store.projects.length}|${todayIso()}|${projectId}`;
  const cachedView = projectViewCache.get(key);
  if (cachedView) return cachedView;
  const context = getPortfolioScheduleContext(store);
  const aggregate = getAggregateOrThrow(store, projectId);
  const view = buildProjectViewFromAggregate(aggregate, context);
  projectViewCache.set(key, view);
  while (projectViewCache.size > 12) {
    const oldest = projectViewCache.keys().next().value;
    if (oldest === undefined) break;
    projectViewCache.delete(oldest);
  }
  return view;
}

export async function listProjectViews(options: ListProjectViewsOptions = {}) {
  const store = await readStore();
  const includeArchived = options.includeArchived ?? true;
  const workspaceId = options.workspaceId ?? null;
  const aggregates = sortProjectAggregates(store.projects).filter(
    (aggregate) =>
      (!workspaceId || aggregate.project.workspaceId === workspaceId) &&
      (includeArchived || !aggregate.project.archivedAt),
  );
  const context = getPortfolioScheduleContext(
    {
      ...store,
      projects: workspaceId
        ? store.projects.filter((aggregate) => aggregate.project.workspaceId === workspaceId)
        : store.projects,
    },
    workspaceId ?? "*",
  );
  return aggregates.map((aggregate) => buildProjectViewFromAggregate(aggregate, context));
}

/** Liste légère {id, name} — sans recalcul de planning (pour la palette ⌘K, etc.). */
export async function listProjectSummaries(options: { workspaceId?: string } = {}) {
  const store = await readStore();
  const workspaceId = options.workspaceId ?? null;
  return sortProjectAggregates(store.projects)
    .filter(
      (aggregate) =>
        (!workspaceId || aggregate.project.workspaceId === workspaceId) &&
        !aggregate.project.archivedAt,
    )
    .map((aggregate) => ({
      id: aggregate.project.id,
      name: aggregate.project.name,
    }));
}

/**
 * Vue allégée pour les composants client du planning : chaque LT n'est
 * sérialisé qu'une fois (au lieu d'environ 5 : agrégat, planning indexé,
 * liste ordonnée, métriques « en retard » / « critiques »). Les tâches de
 * l'agrégat sont remplacées par les tâches planifiées (même forme, sur-ensemble).
 */
export function toClientPlanningView(view: ProjectView): ProjectView {
  return {
    ...view,
    aggregate: { ...view.aggregate, tasks: view.tasks, timesheetEntries: [], actualCostEntries: [] },
    schedule: { ...view.schedule, tasksById: {} },
    metrics: { ...view.metrics, delayedTasks: [], criticalTasks: [] },
    resourceSummaries: [],
  };
}

export async function getProjectView(projectId: string, options: { workspaceId?: string } = {}) {
  const store = await readStore();
  const view = buildProjectViewFromStore(store, projectId);
  if (options.workspaceId && view.aggregate.project.workspaceId !== options.workspaceId) {
    throw notFoundError("Projet introuvable dans cet espace de travail.");
  }
  return view;
}

export async function getProjectAggregate(projectId: string, options: { workspaceId?: string } = {}) {
  const store = await readStore();
  const aggregate = getAggregateOrThrow(store, projectId);
  if (options.workspaceId && aggregate.project.workspaceId !== options.workspaceId) {
    throw notFoundError("Projet introuvable dans cet espace de travail.");
  }
  return aggregate;
}

/**
 * Construit l'agrégat complet depuis la saisie structurée (spec FGF) :
 *  - chaque Tâche Hamac (TH) devient une tâche de synthèse (SUMMARY) ;
 *  - chaque LT devient une tâche planifiable (durée, prédécesseurs, ressources) ;
 *  - chaque PTO devient un jalon budgété positionnable ;
 *  - les intensités (0,25 / 2,00) deviennent des allocations (% = intensité × 100) ;
 *  - les durées et délais sur lien sont convertis de l'unité projet en jours ouvrés.
 */
function buildStructuredAggregate(
  projectId: string,
  startDate: string,
  structure: CreateProjectStructureInput,
): {
  tasks: Task[];
  dependencies: Dependency[];
  resources: Resource[];
  assignments: Assignment[];
  hoursPerDay: number;
  totalBudget: number;
} {
  const unit = structure.timeUnit;
  const hoursPerDay = DEFAULT_HOURS_PER_DAY;

  // ── Ressources (R01…) ──
  const resources: Resource[] = structure.resources.map((res, i) => ({
    id: `${projectId}-res-${i + 1}`,
    projectId,
    code: res.code?.trim() || `R${String(i + 1).padStart(2, "0")}`,
    name: res.name?.trim() || `Ressource ${i + 1}`,
    role: res.name?.trim() || "Ressource",
    type: "PERSON",
    location: "France",
    availabilityPct: 100,
    capacityHoursPerDay: Math.max(1, Number(res.hoursPerDay) || hoursPerDay),
    calendarWorkingDays:
      Array.isArray(res.workingDays) && res.workingDays.length
        ? res.workingDays
        : [1, 2, 3, 4, 5],
    calendarHoursPerDay: Math.max(1, Number(res.hoursPerDay) || hoursPerDay),
    calendarExceptions: [],
    costRate: null,
    color: STRUCTURED_RESOURCE_COLORS[i % STRUCTURED_RESOURCE_COLORS.length],
  }));
  const resourceIdByCode = new Map(resources.map((r) => [String(r.code), r.id]));

  // ── Appartenance aux Tâches Hamac ──
  const hammockByLotCode = new Map<string, number>();
  structure.hammocks.forEach((th, thIndex) => {
    for (const lotCode of th.lotCodes) {
      if (!hammockByLotCode.has(lotCode)) hammockByLotCode.set(lotCode, thIndex);
    }
  });

  const tasks: Task[] = [];
  const taskIdByCode = new Map<string, string>();

  // ── Tâches Hamac (TH01…) → SUMMARY ──
  structure.hammocks.forEach((th, i) => {
    const id = `${projectId}-th-${i + 1}`;
    taskIdByCode.set(th.code, id);
    tasks.push({
      id,
      projectId,
      parentId: null,
      sortOrder: (i + 1) * 100,
      code: th.code,
      name: th.name?.trim() || `Tâche Hamac ${i + 1}`,
      description: "",
      notes: "",
      type: "SUMMARY",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      progressPercent: 0,
      durationDays: 0,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 0,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 500,
      manualStartDate: null,
      manualFinishDate: null,
      actualStartDate: null,
      actualFinishDate: null,
      actualWorkHours: 0,
      remainingWorkHours: 0,
      budgetAmount: null,
    });
  });

  // ── Lots de Tâches (LT01…) et PTO (PTO01…) ──
  structure.lots.forEach((lot, i) => {
    const id = `${projectId}-lt-${i + 1}`;
    taskIdByCode.set(lot.code, id);
    const thIndex = hammockByLotCode.get(lot.code);
    const parentId = thIndex != null ? `${projectId}-th-${thIndex + 1}` : null;
    const isPto = Boolean(lot.isPto);
    const lotType = lot.lotType ?? "DUREE";
    // Durée : directe, ou déduite de la charge (charge / intensité affectée au LT).
    let durationUnitValue = Number(lot.duration) || 0;
    if (!isPto && lotType === "CHARGE") {
      const totalIntensity = (lot.assignments ?? []).reduce(
        (s, a) => s + (Number(a.intensity) || 0),
        0,
      );
      const intensity = totalIntensity > 0 ? totalIntensity : 1;
      durationUnitValue = (Number(lot.charge) || 0) / intensity;
    }
    // La Provision de Temps peut avoir une durée (demande François) : on n'impose plus 0.
    const durationDays = toWorkingDays(durationUnitValue, unit, hoursPerDay);
    const effortHours = durationDays * hoursPerDay;
    const hasPredecessors = (lot.predecessors ?? []).length > 0;
    // Date imposée → contrainte calendaire ; sinon ancrage par défaut.
    const IMPOSED_CONSTRAINT: Record<string, Task["constraintType"]> = {
      SNET: "START_NO_EARLIER_THAN",
      SNLT: "START_NO_LATER_THAN",
      FNET: "FINISH_NO_EARLIER_THAN",
      FNLT: "FINISH_NO_LATER_THAN",
    };
    const imposed =
      lot.imposed && /^\d{4}-\d{2}-\d{2}$/.test(lot.imposed.date) ? lot.imposed : null;
    const lotConstraintType: Task["constraintType"] = imposed
      ? IMPOSED_CONSTRAINT[imposed.kind]
      : hasPredecessors
        ? "ASAP"
        : "START_NO_EARLIER_THAN";
    const lotConstraintDate = imposed
      ? imposed.date
      : hasPredecessors
        ? null
        : startDate;

    tasks.push({
      id,
      projectId,
      parentId,
      sortOrder:
        thIndex != null ? (thIndex + 1) * 100 + i + 1 : 10000 + (i + 1) * 10,
      code: lot.code,
      name: lot.name?.trim() || lot.code,
      description: "",
      notes: "",
      // Durée nulle → jalon ; durée > 0 → tâche (vaut aussi pour une PT avec durée).
      type: durationDays > 0 ? "TASK" : "MILESTONE",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      progressPercent: 0,
      durationDays,
      // Valeur saisie dans l'unité du projet (mois calendaires exacts en mode mois).
      durationUnits: durationDays > 0 ? durationUnitValue : null,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      // Date imposée si saisie, sinon ancrage par défaut au démarrage projet.
      constraintType: lotConstraintType,
      constraintDate: lotConstraintDate,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 500,
      manualStartDate: null,
      manualFinishDate: null,
      actualStartDate: null,
      actualFinishDate: null,
      actualWorkHours: 0,
      remainingWorkHours: roundWorkHours(effortHours),
      budgetAmount: Number(lot.budgetAmount) || 0,
    });
  });

  // ── Jalons (J1…J9, durée nulle systématique) ──
  const jalons = (structure.jalons ?? []).slice(0, 9);
  jalons.forEach((jalon, i) => {
    const id = `${projectId}-jalon-${i + 1}`;
    taskIdByCode.set(jalon.code, id);
    const hasPredecessors = (jalon.predecessors ?? []).length > 0;
    tasks.push({
      id,
      projectId,
      parentId: null,
      sortOrder: 20000 + (i + 1) * 10,
      code: jalon.code,
      name: jalon.name?.trim() || jalon.code,
      description: "",
      notes: "",
      type: "MILESTONE",
      status: "NOT_STARTED",
      priority: "HIGH",
      progressPercent: 0,
      durationDays: 0,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: 0,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      constraintType: hasPredecessors ? "ASAP" : "START_NO_EARLIER_THAN",
      constraintDate: hasPredecessors ? null : startDate,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 500,
      manualStartDate: null,
      manualFinishDate: null,
      actualStartDate: null,
      actualFinishDate: null,
      actualWorkHours: 0,
      remainingWorkHours: 0,
      budgetAmount: null,
    });
  });

  // ── Dépendances (type de lien + délai sur lien, signé) ──
  // L'espace de codes est commun : un LT peut dépendre d'un Jalon et inversement.
  const dependencies: Dependency[] = [];
  const withPredecessors: { code: string; predecessors?: StructuredPredecessorInput[] }[] = [
    ...structure.lots,
    ...jalons,
  ];
  withPredecessors.forEach((node) => {
    for (const pred of node.predecessors ?? []) {
      const predecessorTaskId = taskIdByCode.get(pred.code);
      const successorTaskId = taskIdByCode.get(node.code);
      if (!predecessorTaskId || !successorTaskId) continue;
      dependencies.push({
        id: `${projectId}-dep-${dependencies.length + 1}`,
        projectId,
        predecessorProjectId: projectId,
        predecessorTaskId,
        successorProjectId: projectId,
        successorTaskId,
        type: ensureDependencyType(pred.type ?? "FS"),
        lagDays: toSignedWorkingDays(pred.lag ?? 0, unit, hoursPerDay),
        lagUnits: Number(pred.lag) || 0,
        createdAt: nowIso(),
      });
    }
  });

  // ── Affectations (intensité → % d'allocation) ──
  const assignments: Assignment[] = [];
  structure.lots.forEach((lot) => {
    for (const asg of lot.assignments ?? []) {
      const resourceId = resourceIdByCode.get(asg.resourceCode);
      const taskId = taskIdByCode.get(lot.code);
      if (!resourceId || !taskId) continue;
      assignments.push({
        id: `${projectId}-asg-${assignments.length + 1}`,
        projectId,
        taskId,
        resourceId,
        allocationPct: Math.round((Number(asg.intensity) || 0) * 100),
      });
    }
  });

  const totalBudget = structure.lots.reduce(
    (sum, lot) => sum + (Number(lot.budgetAmount) || 0),
    0,
  );

  return { tasks, dependencies, resources, assignments, hoursPerDay, totalBudget };
}

const STRUCTURED_RESOURCE_COLORS = [
  "#0f766e", "#1d4ed8", "#9333ea", "#b45309", "#dc2626", "#0ea5a4", "#475569", "#16a34a",
];

export async function createProject(input: CreateProjectInput) {
  let projectId = "";
  const validated = validateProjectInputs(input);

  const lots = (input.lots ?? []).filter((lot) => lot && (lot.name?.trim() || lot.budgetAmount));
  const useLots = lots.length > 0;
  const totalLotBudget = lots.reduce((sum, lot) => sum + (Number(lot.budgetAmount) || 0), 0);
  const structure =
    input.structure && input.structure.lots.length ? input.structure : null;

  await mutateStore((draft) => {
    projectId = getUniqueProjectSlug(draft, validated.name);
    const skeleton = createProjectSkeleton(projectId);
    const structured = structure
      ? buildStructuredAggregate(projectId, validated.targetStartDate, structure)
      : null;
    const lotTasks = !structured && useLots
      ? createLotSkeleton(projectId, lots, validated.targetStartDate)
      : null;
    const createdAt = nowIso();

    draft.projects.unshift({
      project: {
        id: projectId,
        workspaceId: validated.workspaceId ?? "workspace-cheetah-time",
        slug: projectId,
        code: getUniqueProjectCode(draft, validated.name),
        name: validated.name,
        origin: "CREATED",
        sourceProjectId: null,
        clientName: validated.clientName,
        description:
          "Nouvel espace de planification. Affinez les lots de tâches, les dépendances et le référentiel selon le modèle de livraison.",
        portfolio: validated.portfolio,
        ownerUserId: validated.ownerUserId ?? null,
        ownerName: validated.ownerName,
        sponsorUserId: validated.sponsorUserId ?? null,
        sponsorName: validated.sponsorName,
        status: "PLANNING",
        health: "ON_TRACK",
        targetStartDate: validated.targetStartDate,
        targetFinishDate: validated.targetFinishDate ?? null,
        budgetAmount: structured
          ? structured.totalBudget
          : useLots
            ? totalLotBudget
            : validated.budgetAmount,
        currencyCode: validated.currencyCode,
        phase: input.phase ?? null,
        b2pDates: input.b2pDates ?? [],
        timeUnit: structure?.timeUnit ?? null,
        levelingStrategy: "PRIORITY_THEN_SLACK",
        levelingMaxDelayDays: 30,
        archivedAt: null,
        archivedBy: null,
        createdAt,
        updatedAt: createdAt,
      },
      calendar: {
        id: `${projectId}-calendar`,
        name: "Calendrier chantier",
        timezone: "Europe/Paris",
        workingDays: [1, 2, 3, 4, 5],
        // Spec FGF : 7 h/jour du lundi au vendredi (standard français).
        hoursPerDay: structured ? structured.hoursPerDay : 8,
        exceptions: [],
      },
      tasks: structured
        ? structured.tasks
        : lotTasks
          ? lotTasks
          : skeleton.tasks.map((task, index) =>
              task.id.endsWith("phase-1-1")
                ? {
                    ...task,
                    constraintDate: validated.targetStartDate,
                  }
                : {
                    ...task,
                    sortOrder: task.sortOrder + index,
                  },
            ),
      dependencies: structured
        ? structured.dependencies
        : lotTasks
          ? []
          : skeleton.dependencies,
      resources: structured ? structured.resources : [],
      assignments: structured ? structured.assignments : [],
      baselines: [],
      timesheetEntries: [],
      actualCostEntries: [],
    });
  });

  return projectId;
}

/**
 * Importe un projet de la suite (format `.cheetahcost.json`) dans Cheetah Time :
 * adopte la phase, les dates, les Lots (LT) et **les mêmes dates de B2P**.
 */
export async function importSuiteProject(text: string, importedBy = "Import suite") {
  const data = parseSuiteProject(text);
  const projectId = await createProject({
    name: data.name,
    clientName: "Client",
    ownerName: importedBy,
    sponsorName: "Maître d'ouvrage",
    portfolio: "Suite FGF",
    targetStartDate: data.dateDebut,
    targetFinishDate: data.dateFin,
    budgetAmount: 0,
    currencyCode: data.currency,
    phase: data.phase,
    b2pDates: data.b2pDates,
    lots: data.lots,
  });
  // Fichier 1.1.0 venant de Cheetah Time : on reprend l'unité de temps, la date
  // d'état et l'historique des prévisions avant pilotage (Tableaux B2P).
  const delai = data.lentilleDelai;
  if (delai) {
    const units = ["heures", "jours", "semaines", "mois"] as const;
    await mutateStore((draft) => {
      const aggregate = getAggregateOrThrow(draft, projectId);
      if ((units as readonly string[]).includes(delai.uniteTemps)) {
        aggregate.project.timeUnit = delai.uniteTemps as (typeof units)[number];
      }
      aggregate.project.statusDate = delai.dateEtat;
      aggregate.project.b2pSnapshots = Object.fromEntries(
        delai.parB2P.map((s) => [
          s.date,
          {
            date: s.date,
            capturedAt: nowIso(),
            finADate: s.finADate,
            finPrevisionnelle: s.finPrevisionnelle,
            ecart: s.ecart,
            unit: delai.uniteTemps,
            avancement: s.avancement,
            actionRequise: s.actionPilotageRequise,
          },
        ]),
      );
    });
  }
  return { projectId };
}

/** Exporte un projet Cheetah Time au format partagé de la suite (lisible par Cheetah Cost). */
export async function buildSuiteExport(projectId: string) {
  const view = await getProjectView(projectId);
  const p = view.aggregate.project;
  const lots = view.aggregate.tasks
    .filter((t) => t.type === "SUMMARY" && !t.parentId)
    .map((t) => ({ name: t.name, budgetAmount: t.budgetAmount ?? 0 }));
  const dateFin = p.targetFinishDate ?? view.schedule.projectFinishDate ?? p.targetStartDate;
  const b2pDates =
    p.b2pDates && p.b2pDates.length
      ? p.b2pDates
      : buildRecommendedB2PDates({ dateDebut: p.targetStartDate, dateFin });

  // ── Lentille délai : le retard mesuré à chaque B2P, pour Cheetah Cost ──
  const { computeDelayBanner } = await import("@/lib/fgf/delay-banner");
  const { buildB2PPlanningReview } = await import("@/lib/fgf/b2p-review");
  const banner = computeDelayBanner(view);
  const unit = p.timeUnit ?? "jours";
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const review = buildB2PPlanningReview(view);
  const reviewByName = new Map(review.lots.map((l) => [l.name, l]));
  const parB2P = Object.values(p.b2pSnapshots ?? {})
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((snap) => {
      const index = b2pDates.indexOf(snap.date);
      return {
        date: snap.date,
        indexB2P: index >= 0 ? index : null,
        finADate: snap.finADate,
        finPrevisionnelle: snap.finPrevisionnelle,
        ecart: snap.ecart,
        avancement: snap.avancement,
        actionPilotageRequise: snap.actionRequise,
      };
    });
  const lentilleDelai = {
    module: "CheetahTime" as const,
    uniteTemps: unit,
    dateEtat: view.schedule.statusDate ?? null,
    finInitiale: banner.finInitiale,
    finADate: banner.finADate,
    finPrevisionnelle: banner.finPrevisionnelle,
    ecart: banner.ecart,
    ecartJours: banner.ecartJours,
    avancement: banner.avancement,
    actionPilotageRequise: banner.hasPI && banner.actionRequise,
    piFige: banner.hasPI,
    parB2P,
    lots: lots.map((lot, i) => {
      const row = reviewByName.get(lot.name);
      const days = row?.glissementJours ?? 0;
      return {
        code: `LT${String(i + 1).padStart(2, "0")}`,
        libelle: lot.name,
        finPrevue: row?.finPrevue ?? null,
        glissement: round2(fromWorkingDays(days, unit, view.aggregate.calendar.hoursPerDay)),
        glissementJours: days,
        avancement: Math.round(row?.avancement ?? 0),
      };
    }),
  };
  return buildSuiteProjectFile({
    lentilleDelai,
    id: p.id,
    code: p.code,
    name: p.name,
    phase: p.phase ?? null,
    dateDebut: p.targetStartDate,
    dateFin: p.targetFinishDate ?? null,
    currency: p.currencyCode,
    lots,
    b2pDates,
  });
}

/** Enregistre (ou efface) la note de bilan planning d'un B2P donné. */
export async function setProjectB2PNote(input: {
  projectId: string;
  date: string;
  note: string;
}) {
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    const notes: Record<string, string> = { ...(aggregate.project.b2pNotes ?? {}) };
    if (input.note.trim()) {
      notes[input.date] = input.note.trim();
    } else {
      delete notes[input.date];
    }
    aggregate.project = {
      ...aggregate.project,
      b2pNotes: notes,
      updatedAt: nowIso(),
    };
  });
}

export async function setProjectB2PScenario(input: {
  projectId: string;
  date: string;
  scenario: string;
}) {
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    const scenarios: Record<string, string> = { ...(aggregate.project.b2pScenarios ?? {}) };
    if (input.scenario.trim()) {
      scenarios[input.date] = input.scenario.trim();
    } else {
      delete scenarios[input.date];
    }
    aggregate.project = {
      ...aggregate.project,
      b2pScenarios: scenarios,
      updatedAt: nowIso(),
    };
  });
}

/** Paramètres de pilotage du temps (date d'état, coefficient pseudo-critique). */
export async function updateProjectPilotageSettings(input: {
  projectId: string;
  statusDate: string | null;
  pseudoCriticalCoefficient: number | null;
}) {
  if (input.statusDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.statusDate)) {
    throw validationError("La date d'état doit être une date valide (AAAA-MM-JJ).");
  }
  if (
    input.pseudoCriticalCoefficient != null &&
    (!Number.isFinite(input.pseudoCriticalCoefficient) ||
      input.pseudoCriticalCoefficient < 1 ||
      input.pseudoCriticalCoefficient > 5)
  ) {
    throw validationError("Le coefficient pseudo-critique doit être compris entre 1 et 5.");
  }
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    aggregate.project.statusDate = input.statusDate;
    aggregate.project.pseudoCriticalCoefficient = input.pseudoCriticalCoefficient;
    aggregate.project.updatedAt = nowIso();
  });
}

export interface B2PAdvanceRowInput {
  taskId: string;
  /** NOT_STARTED | STARTED | DONE */
  etat: "NOT_STARTED" | "STARTED" | "DONE";
  actualStartDate?: string | null;
  forecastFinishDate?: string | null;
  actualFinishDate?: string | null;
  /** Nouvelle durée (unité projet) — pour les Provisions de Temps non franchies. */
  newDurationUnits?: number | null;
}

export interface B2PSnapshot {
  date: string;
  capturedAt: string;
  finADate: string | null;
  finPrevisionnelle: string | null;
  ecart: number | null;
  unit: string;
  avancement: number;
  actionRequise: boolean;
}

/**
 * Passage guidé au B2P suivant (CdC B1) : saisie, en une fois, des LT
 * commencés (début réel + prévision de fin), des LT finis (fin réelle), des
 * nouvelles durées des PT ; la date d'état passe à la date du B2P ; un
 * instantané « Prévision avant pilotage T2Pi-1 » est enregistré.
 */
export async function advanceToB2P(input: {
  projectId: string;
  b2pDate: string;
  rows: B2PAdvanceRowInput[];
}) {
  const isDate = (v?: string | null) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (!isDate(input.b2pDate)) throw validationError("Date de B2P invalide.");

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    const unit = aggregate.project.timeUnit ?? "jours";
    const hoursPerDay = aggregate.calendar.hoursPerDay;
    const byId = new Map(aggregate.tasks.map((t) => [t.id, t]));

    for (const row of input.rows) {
      const task = byId.get(row.taskId);
      if (!task || task.type === "SUMMARY") continue;

      if (row.newDurationUnits != null && Number.isFinite(row.newDurationUnits) && row.newDurationUnits >= 0) {
        task.durationUnits = row.newDurationUnits;
        task.durationDays = row.newDurationUnits === 0 ? 0 : toWorkingDays(row.newDurationUnits, unit, hoursPerDay);
        task.effortHours = task.durationDays * hoursPerDay;
      }

      if (row.etat === "DONE") {
        const start = isDate(row.actualStartDate) ? row.actualStartDate! : task.actualStartDate ?? null;
        const finish = isDate(row.actualFinishDate) ? row.actualFinishDate! : input.b2pDate;
        if (start && finish < start) {
          throw validationError(`« ${task.name} » : la fin réelle précède le début réel.`);
        }
        task.actualStartDate = start ?? finish;
        task.actualFinishDate = finish;
        task.status = "DONE";
        task.progressPercent = 100;
      } else if (row.etat === "STARTED") {
        const start = isDate(row.actualStartDate) ? row.actualStartDate! : task.actualStartDate ?? input.b2pDate;
        if (start > input.b2pDate) {
          throw validationError(`« ${task.name} » : un LT commencé ne peut pas débuter après la date du B2P.`);
        }
        task.actualStartDate = start;
        task.actualFinishDate = null;
        task.status = "IN_PROGRESS";
        if (isDate(row.forecastFinishDate)) {
          const forecast = row.forecastFinishDate!;
          if (forecast < start) throw validationError(`« ${task.name} » : la prévision de fin précède le début.`);
          // Durée totale = début réel → prévision de fin ; avancement = part écoulée à la date du B2P.
          const totalDays = Math.max(1, workingDayDistance(start, forecast, aggregate.calendar) + 1);
          const elapsedDays = Math.min(totalDays, Math.max(0, workingDayDistance(start, input.b2pDate, aggregate.calendar)));
          task.durationDays = totalDays;
          task.durationUnits = null;
          task.effortHours = totalDays * hoursPerDay;
          task.progressPercent = Math.min(99, Math.max(1, Math.round((elapsedDays / totalDays) * 100)));
        } else if (task.progressPercent <= 0) {
          task.progressPercent = 1;
        }
      } else {
        // Non commencé : on efface un éventuel réel saisi par erreur.
        if (task.status !== "DONE") {
          task.actualStartDate = null;
          task.actualFinishDate = null;
          task.progressPercent = 0;
          task.status = "NOT_STARTED";
        }
      }
    }

    aggregate.project.statusDate = input.b2pDate;
    aggregate.project.updatedAt = nowIso();
  });

  // Instantané « Prévision avant pilotage » (calculé après saisie, avant tout scénario).
  const view = await getProjectView(input.projectId);
  const { computeDelayBanner } = await import("@/lib/fgf/delay-banner");
  const banner = computeDelayBanner(view);
  const snapshot: B2PSnapshot = {
    date: input.b2pDate,
    capturedAt: nowIso(),
    finADate: banner.finADate,
    finPrevisionnelle: banner.finPrevisionnelle,
    ecart: banner.ecart,
    unit: banner.unit,
    avancement: banner.avancement,
    actionRequise: banner.actionRequise,
  };
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    aggregate.project.b2pSnapshots = { ...(aggregate.project.b2pSnapshots ?? {}), [input.b2pDate]: snapshot };
  });
  return snapshot;
}

export async function updateProjectMetadata(input: UpdateProjectInput) {
  const validated = validateProjectMetadataInput(input);

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    aggregate.project = {
      ...aggregate.project,
      name: validated.name,
      clientName: validated.clientName,
      ownerName: validated.ownerName,
      sponsorName: validated.sponsorName,
      portfolio: validated.portfolio,
      description: validated.description,
      status: validated.status,
      health: validated.health,
      targetStartDate: validated.targetStartDate,
      targetFinishDate: validated.targetFinishDate ?? null,
      budgetAmount: validated.budgetAmount,
      currencyCode: validated.currencyCode,
      updatedAt: nowIso(),
    };
  });
}

export async function setProjectArchived(
  projectId: string,
  archived: boolean,
  actor: string,
) {
  const archivedBy = ensureText(actor, "Auteur de l'archivage", { maxLength: 120 });

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);
    aggregate.project.archivedAt = archived ? nowIso() : null;
    aggregate.project.archivedBy = archived ? archivedBy : null;
    aggregate.project.updatedAt = nowIso();
  });
}

/** « Déclasser » un projet : le sortir de « Projets en cours » sans l'archiver (spec François). */
export async function setProjectDeclassed(
  projectId: string,
  declassed: boolean,
  actor: string,
) {
  const declassedBy = ensureText(actor, "Auteur du déclassement", { maxLength: 120 });

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);
    aggregate.project.declassedAt = declassed ? nowIso() : null;
    aggregate.project.declassedBy = declassed ? declassedBy : null;
    aggregate.project.updatedAt = nowIso();
  });
}

export async function duplicateProject(input: DuplicateProjectInput) {
  let duplicatedProjectId = "";
  const duplicateNameOverride = ensureOptionalText(
    input.name,
    "Duplicate project name",
    120,
  );
  const duplicatedBy = ensureText(input.duplicatedBy, "Dupliqué par", {
    maxLength: 120,
  });

  await mutateStore((draft) => {
    const sourceAggregate = getAggregateOrThrow(draft, input.projectId);
    const duplicateName =
      duplicateNameOverride || `${sourceAggregate.project.name} Copy`;
    const duplicatedAt = nowIso();
    duplicatedProjectId = getUniqueProjectSlug(draft, duplicateName);

    const taskIdMap = new Map(
      sourceAggregate.tasks.map((task) => [task.id, randomUUID().slice(0, 8)]),
    );
    const resourceIdMap = new Map(
      sourceAggregate.resources.map((resource) => [resource.id, randomUUID().slice(0, 8)]),
    );

    const duplicatedAggregate: ProjectAggregate = {
      project: {
        ...sourceAggregate.project,
        id: duplicatedProjectId,
        slug: duplicatedProjectId,
        code: getUniqueProjectCode(draft, duplicateName),
        name: duplicateName,
        origin: "DUPLICATED",
        sourceProjectId: sourceAggregate.project.id,
        status: "PLANNING",
        archivedAt: null,
        archivedBy: null,
        createdAt: duplicatedAt,
        updatedAt: duplicatedAt,
      },
      calendar: {
        ...sourceAggregate.calendar,
        id: `${duplicatedProjectId}-calendar`,
      },
      tasks: sourceAggregate.tasks.map((task) => ({
        ...task,
        id: taskIdMap.get(task.id)!,
        projectId: duplicatedProjectId,
        parentId: task.parentId ? taskIdMap.get(task.parentId)! : null,
      })),
      dependencies: sourceAggregate.dependencies.map((dependency) => ({
        ...dependency,
        id: randomUUID().slice(0, 8),
        projectId: duplicatedProjectId,
        predecessorProjectId:
          dependency.predecessorProjectId === sourceAggregate.project.id
            ? duplicatedProjectId
            : dependency.predecessorProjectId,
        predecessorTaskId: taskIdMap.get(dependency.predecessorTaskId)!,
        successorProjectId:
          dependency.successorProjectId === sourceAggregate.project.id
            ? duplicatedProjectId
            : dependency.successorProjectId,
        successorTaskId: taskIdMap.get(dependency.successorTaskId)!,
        createdAt: duplicatedAt,
      })),
      resources: sourceAggregate.resources.map((resource) => ({
        ...resource,
        id: resourceIdMap.get(resource.id)!,
        projectId: duplicatedProjectId,
      })),
      assignments: sourceAggregate.assignments.map((assignment) => ({
        ...assignment,
        id: randomUUID().slice(0, 8),
        projectId: duplicatedProjectId,
        taskId: taskIdMap.get(assignment.taskId)!,
        resourceId: resourceIdMap.get(assignment.resourceId)!,
      })),
      baselines: [],
      timesheetEntries: sourceAggregate.timesheetEntries.map((entry) => ({
        ...entry,
        id: randomUUID().slice(0, 8),
        projectId: duplicatedProjectId,
        taskId: taskIdMap.get(entry.taskId)!,
        resourceId: entry.resourceId ? resourceIdMap.get(entry.resourceId)! : null,
        createdAt: duplicatedAt,
        updatedAt: duplicatedAt,
      })),
      actualCostEntries: sourceAggregate.actualCostEntries.map((entry) => ({
        ...entry,
        id: randomUUID().slice(0, 8),
        projectId: duplicatedProjectId,
        taskId: entry.taskId ? taskIdMap.get(entry.taskId)! : null,
        resourceId: entry.resourceId ? resourceIdMap.get(entry.resourceId)! : null,
        timesheetEntryId: null,
        createdAt: duplicatedAt,
        updatedAt: duplicatedAt,
      })),
    };

    draft.projects.unshift(duplicatedAggregate);
    duplicatedAggregate.baselines = [
      buildBaselineFromStore(draft, duplicatedAggregate, {
        baselineId: randomUUID().slice(0, 8),
        name: "Scenario starting point",
        description: `Captured automatically when duplicating ${sourceAggregate.project.name}.`,
        capturedAt: duplicatedAt,
        capturedBy: duplicatedBy,
        isActive: true,
      }),
    ];
  });

  return duplicatedProjectId;
}

export async function markProjectAsTemplateDerived(projectId: string, sourceProjectId?: string | null) {
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);
    aggregate.project.origin = "TEMPLATE";
    aggregate.project.sourceProjectId = sourceProjectId ?? aggregate.project.sourceProjectId ?? null;
    aggregate.project.updatedAt = nowIso();
  });
}

export async function importProjectDocument(
  document: ImportedProjectDocument,
  importedBy: string,
) {
  let importedProjectId = "";
  const actor = ensureText(importedBy, "Importé par", { maxLength: 120 });

  await mutateStore((draft) => {
    const importedAt = nowIso();
    importedProjectId = getUniqueProjectSlug(draft, document.project.name);
    const projectCode = getUniqueProjectCode(
      draft,
      document.project.code || document.project.name,
    );
    const taskIdMap = new Map(
      document.tasks.map((task) => [task.uid, randomUUID().slice(0, 8)]),
    );
    const resourceIdMap = new Map(
      document.resources.map((resource) => [resource.uid, randomUUID().slice(0, 8)]),
    );
    const timesheetIdMap = new Map(
      document.timesheetEntries.map((entry) => [entry.id, randomUUID().slice(0, 8)]),
    );
    const aggregate: ProjectAggregate = {
      project: {
        id: importedProjectId,
        workspaceId: "workspace-cheetah-time",
        slug: importedProjectId,
        code: projectCode,
        name: document.project.name,
        origin: "CREATED",
        sourceProjectId: null,
        clientName: document.project.clientName,
        description: document.project.description,
        portfolio: document.project.portfolio,
        ownerUserId: null,
        ownerName: document.project.ownerName,
        sponsorUserId: null,
        sponsorName: document.project.sponsorName,
        status: document.project.status,
        health: document.project.health,
        targetStartDate: document.project.targetStartDate,
        targetFinishDate: document.project.targetFinishDate ?? null,
        budgetAmount: document.project.budgetAmount,
        currencyCode: document.project.currencyCode,
        levelingStrategy: document.project.levelingStrategy,
        levelingMaxDelayDays: document.project.levelingMaxDelayDays,
        archivedAt: null,
        archivedBy: null,
        createdAt: importedAt,
        updatedAt: importedAt,
      },
      calendar: {
        id: `${importedProjectId}-calendar`,
        name: document.calendar.name,
        timezone: document.calendar.timezone,
        workingDays: [...document.calendar.workingDays],
        hoursPerDay: document.calendar.hoursPerDay,
        exceptions: document.calendar.exceptions.map((exception) => ({
          ...exception,
          id: randomUUID().slice(0, 8),
        })),
      },
      tasks: document.tasks
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((task) => ({
          id: taskIdMap.get(task.uid)!,
          projectId: importedProjectId,
          parentId: task.parentUid ? taskIdMap.get(task.parentUid) ?? null : null,
          sortOrder: (task.sortOrder + 1) * 10,
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
          effortHours: task.effortHours,
          calendarMode: task.calendarMode,
          calendarWorkingDays: [...task.calendarWorkingDays],
          calendarHoursPerDay: task.calendarHoursPerDay ?? null,
          calendarExceptions: task.calendarExceptions.map((exception) => ({
            ...exception,
            id: randomUUID().slice(0, 8),
          })),
          constraintType: task.constraintType,
          constraintDate: task.constraintDate ?? null,
          deadlineDate: task.deadlineDate ?? null,
          levelingDelayDays: task.levelingDelayDays,
          levelingPriority: task.levelingPriority,
          manualStartDate: task.manualStartDate ?? null,
          manualFinishDate: task.manualFinishDate ?? null,
          actualStartDate: task.actualStartDate ?? null,
          actualFinishDate: task.actualFinishDate ?? null,
          actualWorkHours: task.actualWorkHours,
          remainingWorkHours: task.remainingWorkHours,
        })),
      dependencies: document.dependencies
        .filter(
          (dependency) =>
            taskIdMap.has(dependency.predecessorTaskUid) &&
            taskIdMap.has(dependency.successorTaskUid),
        )
        .map((dependency) => ({
          id: randomUUID().slice(0, 8),
          projectId: importedProjectId,
          predecessorProjectId: importedProjectId,
          predecessorTaskId: taskIdMap.get(dependency.predecessorTaskUid)!,
          successorProjectId: importedProjectId,
          successorTaskId: taskIdMap.get(dependency.successorTaskUid)!,
          type: dependency.type,
          lagDays: dependency.lagDays,
          label: dependency.label,
          createdAt: importedAt,
        })),
      resources: document.resources.map((resource) => ({
        id: resourceIdMap.get(resource.uid)!,
        projectId: importedProjectId,
        name: resource.name,
        role: resource.role,
        type: resource.type,
        location: resource.location,
        availabilityPct: resource.availabilityPct,
        capacityHoursPerDay: resource.capacityHoursPerDay,
        calendarWorkingDays: [...resource.calendarWorkingDays],
        calendarHoursPerDay: resource.calendarHoursPerDay ?? null,
        calendarExceptions: resource.calendarExceptions.map((exception) => ({
          ...exception,
          id: randomUUID().slice(0, 8),
        })),
        costRate: resource.costRate,
        color: resource.color,
      })),
      assignments: document.assignments
        .filter(
          (assignment) =>
            taskIdMap.has(assignment.taskUid) && resourceIdMap.has(assignment.resourceUid),
        )
        .map((assignment) => ({
          id: randomUUID().slice(0, 8),
          projectId: importedProjectId,
          taskId: taskIdMap.get(assignment.taskUid)!,
          resourceId: resourceIdMap.get(assignment.resourceUid)!,
          allocationPct: assignment.allocationPct,
          notes: assignment.notes,
        })),
      baselines: document.baselines.map((baseline) => ({
        id: randomUUID().slice(0, 8),
        projectId: importedProjectId,
        name: baseline.name,
        description: baseline.description,
        capturedAt: baseline.capturedAt,
        capturedBy: baseline.capturedBy || actor,
        isActive: baseline.isActive,
        snapshots: baseline.snapshots
          .filter((snapshot) => taskIdMap.has(snapshot.taskUid))
          .map((snapshot) => ({
            id: randomUUID().slice(0, 8),
            baselineId: "",
            taskId: taskIdMap.get(snapshot.taskUid)!,
            name: snapshot.name,
            startDate: snapshot.startDate ?? null,
            finishDate: snapshot.finishDate ?? null,
            durationDays: snapshot.durationDays,
            workHours: snapshot.workHours,
            plannedCost: snapshot.plannedCost,
            progressPercent: snapshot.progressPercent,
            isCritical: snapshot.isCritical,
          })),
      })),
      timesheetEntries: document.timesheetEntries
        .filter((entry) => taskIdMap.has(entry.taskId))
        .map((entry) => ({
          ...entry,
          id: timesheetIdMap.get(entry.id)!,
          projectId: importedProjectId,
          taskId: taskIdMap.get(entry.taskId)!,
          resourceId: entry.resourceId ? (resourceIdMap.get(entry.resourceId) ?? null) : null,
        })),
      actualCostEntries: document.actualCostEntries.map((entry) => ({
        ...entry,
        id: randomUUID().slice(0, 8),
        projectId: importedProjectId,
        taskId: entry.taskId ? (taskIdMap.get(entry.taskId) ?? null) : null,
        resourceId: entry.resourceId ? (resourceIdMap.get(entry.resourceId) ?? null) : null,
        timesheetEntryId:
          entry.timesheetEntryId ? (timesheetIdMap.get(entry.timesheetEntryId) ?? null) : null,
        currencyCode: entry.currencyCode || document.project.currencyCode,
      })),
    };

    for (const baseline of aggregate.baselines) {
      baseline.snapshots = baseline.snapshots.map((snapshot) => ({
        ...snapshot,
        baselineId: baseline.id,
      }));
    }

    for (const parentId of new Set(aggregate.tasks.map((task) => task.parentId ?? null))) {
      renumberSiblingTasks(aggregate.tasks, parentId);
    }

    for (const task of aggregate.tasks) {
      if (task.type === "SUMMARY" || taskHasChildren(aggregate.tasks, task.id)) {
        task.type = "SUMMARY";
        resetTaskToSummaryControls(task);
      }
    }

    recalculateTaskPlanningStates(
      aggregate,
      aggregate.tasks.filter((task) => task.type !== "SUMMARY").map((task) => task.id),
    );

    if (!aggregate.actualCostEntries.length) {
      for (const entry of aggregate.timesheetEntries) {
        const task = aggregate.tasks.find((item) => item.id === entry.taskId);
        if (!task) {
          continue;
        }

        const resource = entry.resourceId
          ? aggregate.resources.find((item) => item.id === entry.resourceId) ?? null
          : null;
        syncTimesheetCostLedgerEntry(aggregate, entry, task, resource);
      }
    }

    draft.projects.unshift(aggregate);
  });

  return {
    projectId: importedProjectId,
    warnings: document.warnings,
  };
}

export async function saveTask(input: SaveTaskInput) {
  const validated = validateTaskInput(input);

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    const task = aggregate.tasks.find((entry) => entry.id === input.taskId);
    if (!task) {
      throw notFoundError("LT introuvable.");
    }

    assertValidParent(aggregate.tasks, task.id, validated.parentId);

    const currentlySummary = task.type === "SUMMARY" || taskHasChildren(aggregate.tasks, task.id);
    const nextSummary =
      validated.type === "SUMMARY" || taskHasChildren(aggregate.tasks, task.id);
    if (
      !currentlySummary &&
      nextSummary &&
      taskHasDependencies(aggregate.dependencies, task.id)
    ) {
      throw conflictError(
        "Clear dependency logic before converting a driven task into a summary task.",
      );
    }

    const normalizedScheduleControls = nextSummary
      ? {
          status: "NOT_STARTED" as const,
          progressPercent: 0,
          constraintType: "ASAP" as const,
          constraintDate: null,
          deadlineDate: null,
        }
      : {
          status: validated.status,
          progressPercent: validated.progressPercent,
          constraintType: validated.constraintType,
          constraintDate: validated.constraintDate || null,
          deadlineDate: validated.deadlineDate || null,
        };
    const normalizedPlanningState = getNormalizedTaskPlanningState(task, aggregate, {
      type: validated.type,
      durationDays: validated.durationDays,
      schedulingMode: validated.schedulingMode,
      workFormula: validated.workFormula,
      effortHours: validated.effortHours ?? task.effortHours ?? null,
      calendarMode: validated.calendarMode,
      calendarWorkingDays: validated.calendarWorkingDays,
      calendarHoursPerDay: validated.calendarHoursPerDay ?? null,
      calendarExceptions: validated.calendarExceptions,
      manualStartDate: validated.manualStartDate ?? null,
      manualFinishDate: validated.manualFinishDate ?? null,
    });
    const normalizedExecutionState = getNormalizedTaskExecutionState(task, aggregate, {
      type: validated.type,
      status: normalizedScheduleControls.status,
      progressPercent: normalizedScheduleControls.progressPercent,
      durationDays: normalizedPlanningState.durationDays,
      schedulingMode: normalizedPlanningState.schedulingMode,
      workFormula: normalizedPlanningState.workFormula,
      effortHours: normalizedPlanningState.effortHours,
      manualStartDate: normalizedPlanningState.manualStartDate,
      manualFinishDate: normalizedPlanningState.manualFinishDate,
      actualStartDate: validated.actualStartDate ?? task.actualStartDate ?? null,
      actualFinishDate: validated.actualFinishDate ?? task.actualFinishDate ?? null,
      actualWorkHours: validated.actualWorkHours ?? task.actualWorkHours ?? null,
      remainingWorkHours:
        validated.remainingWorkHours ?? task.remainingWorkHours ?? null,
    });

    // La durée en unité projet n'est conservée que si la durée n'a pas changé.
    const keepDurationUnits = task.durationDays === normalizedPlanningState.durationDays;
    Object.assign(task, {
      name: validated.name,
      description: validated.description,
      notes: validated.notes,
      parentId: validated.parentId,
      sortOrder: validated.sortOrder,
      type: validated.type,
      status: normalizedExecutionState.status,
      priority: validated.priority,
      progressPercent: normalizedExecutionState.progressPercent,
      durationDays: normalizedPlanningState.durationDays,
      durationUnits: keepDurationUnits ? task.durationUnits ?? null : null,
      schedulingMode: normalizedPlanningState.schedulingMode,
      workFormula: normalizedPlanningState.workFormula,
      effortHours: normalizedPlanningState.effortHours,
      calendarMode: validated.calendarMode,
      calendarWorkingDays: validated.calendarWorkingDays,
      calendarHoursPerDay: validated.calendarHoursPerDay ?? null,
      calendarExceptions: validated.calendarExceptions,
      constraintType: normalizedScheduleControls.constraintType,
      constraintDate: normalizedScheduleControls.constraintDate,
      deadlineDate: normalizedScheduleControls.deadlineDate,
      levelingPriority: validated.levelingPriority,
      manualStartDate: normalizedPlanningState.manualStartDate,
      manualFinishDate: normalizedPlanningState.manualFinishDate,
      actualStartDate: normalizedExecutionState.actualStartDate,
      actualFinishDate: normalizedExecutionState.actualFinishDate,
      actualWorkHours: normalizedExecutionState.actualWorkHours,
      remainingWorkHours: normalizedExecutionState.remainingWorkHours,
    });
    aggregate.project.updatedAt = nowIso();
  });
}

export async function rescheduleTaskFromGantt(input: RescheduleTaskFromGanttInput) {
  const startDate = ensureIsoDate(input.startDate, "Début", {
    required: true,
  });
  const finishDate = ensureIsoDate(input.finishDate, "Fin", {
    required: true,
  });

  if (!startDate || !finishDate) {
    throw validationError("Les dates Gantt sont requises.");
  }

  const store = await readStore();
  const aggregate = getAggregateOrThrow(store, input.projectId);
  const task = aggregate.tasks.find((entry) => entry.id === input.taskId);
  if (!task) {
    throw notFoundError("LT introuvable.");
  }
  if (task.type === "SUMMARY") {
    throw validationError("Une tâche hamac se pilote par ses LT, pas par glisser-déposer direct.");
  }

  const normalizedFinishDate = task.type === "MILESTONE" ? startDate : finishDate;
  if (compareIsoDates(normalizedFinishDate, startDate) < 0) {
    throw validationError("La fin ne peut pas être antérieure au début.");
  }

  const taskCalendar = getTaskWorkingCalendar(aggregate, task);
  const durationDays =
    task.type === "MILESTONE"
      ? 0
      : Math.max(countWorkingDaysInclusive(startDate, normalizedFinishDate, taskCalendar), 1);

  await saveTask({
    projectId: input.projectId,
    taskId: input.taskId,
    name: task.name,
    description: task.description,
    notes: task.notes,
    parentId: task.parentId,
    sortOrder: task.sortOrder,
    type: task.type,
    status: task.status,
    priority: task.priority,
    progressPercent: task.progressPercent,
    durationDays,
    schedulingMode: "MANUAL",
    workFormula: task.workFormula,
    effortHours: task.effortHours ?? null,
    calendarMode: task.calendarMode,
    calendarWorkingDays: task.calendarWorkingDays,
    calendarHoursPerDay: task.calendarHoursPerDay ?? null,
    calendarExceptions: task.calendarExceptions,
    levelingPriority: task.levelingPriority,
    constraintType: task.constraintType,
    constraintDate: task.constraintDate ?? null,
    deadlineDate: task.deadlineDate ?? null,
    manualStartDate: startDate,
    manualFinishDate: normalizedFinishDate,
    actualStartDate: task.actualStartDate ?? null,
    actualFinishDate: task.actualFinishDate ?? null,
    actualWorkHours: task.actualWorkHours,
    remainingWorkHours: task.remainingWorkHours,
  });
}

export async function createTask(input: CreateTaskInput) {
  const taskId = randomUUID().slice(0, 8);
  const validated = validateCreateTaskInput(input);
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    assertParentCanAcceptChildren(
      aggregate.tasks,
      aggregate.dependencies,
      validated.parentId,
    );

    const siblings = aggregate.tasks.filter(
      (task) => (task.parentId ?? null) === validated.parentId,
    );
    const nextSortOrder =
      validated.sortOrder ??
      (siblings.length ? Math.max(...siblings.map((task) => task.sortOrder)) + 10 : 10);

    aggregate.tasks.push({
      id: taskId,
      projectId: input.projectId,
      parentId: validated.parentId,
      sortOrder: nextSortOrder,
      name: validated.name,
      description: "New planning line item.",
      notes: "",
      type: validated.type,
      status: "NOT_STARTED",
      priority: "MEDIUM",
      progressPercent: 0,
      durationDays: validated.type === "TASK" ? 3 : 0,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: validated.type === "TASK" ? aggregate.calendar.hoursPerDay * 3 : 0,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 500,
      manualStartDate: null,
      manualFinishDate: null,
      actualStartDate: null,
      actualFinishDate: null,
      actualWorkHours: 0,
      remainingWorkHours:
        validated.type === "TASK" ? aggregate.calendar.hoursPerDay * 3 : 0,
    });
    renumberSiblingTasks(aggregate.tasks, validated.parentId);
    normalizeParentSummaryState(
      aggregate.tasks,
      aggregate.dependencies,
      validated.parentId,
    );

    aggregate.project.updatedAt = nowIso();
  });

  return taskId;
}

export async function moveTask(input: MoveTaskInput) {
  const validated = validateMoveTaskInput(input);

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    const task = aggregate.tasks.find((entry) => entry.id === validated.taskId);
    if (!task) {
      throw notFoundError("LT introuvable.");
    }

    const currentParentId = task.parentId ?? null;
    const currentSiblings = getSiblingTasks(aggregate.tasks, currentParentId);
    const currentIndex = currentSiblings.findIndex((entry) => entry.id === task.id);

    if (currentIndex < 0) {
      throw conflictError("Task ordering is inconsistent for the selected branch.");
    }

    switch (validated.direction) {
      case "UP": {
        if (currentIndex === 0) {
          throw conflictError("This task is already first in its current branch.");
        }

        const reorderedIds = currentSiblings.map((entry) => entry.id);
        [reorderedIds[currentIndex - 1], reorderedIds[currentIndex]] = [
          reorderedIds[currentIndex],
          reorderedIds[currentIndex - 1],
        ];
        renumberSiblingTasks(aggregate.tasks, currentParentId, reorderedIds);
        break;
      }
      case "DOWN": {
        if (currentIndex === currentSiblings.length - 1) {
          throw conflictError("This task is already last in its current branch.");
        }

        const reorderedIds = currentSiblings.map((entry) => entry.id);
        [reorderedIds[currentIndex], reorderedIds[currentIndex + 1]] = [
          reorderedIds[currentIndex + 1],
          reorderedIds[currentIndex],
        ];
        renumberSiblingTasks(aggregate.tasks, currentParentId, reorderedIds);
        break;
      }
      case "INDENT": {
        if (currentIndex === 0) {
          throw conflictError("The first sibling cannot be indented because it has no parent candidate above it.");
        }

        const newParent = currentSiblings[currentIndex - 1];
        assertValidParent(aggregate.tasks, task.id, newParent.id);
        assertParentCanAcceptChildren(
          aggregate.tasks,
          aggregate.dependencies,
          newParent.id,
        );

        task.parentId = newParent.id;
        renumberSiblingTasks(aggregate.tasks, currentParentId);
        renumberSiblingTasks(aggregate.tasks, newParent.id);
        normalizeParentSummaryState(
          aggregate.tasks,
          aggregate.dependencies,
          newParent.id,
        );
        break;
      }
      case "OUTDENT": {
        if (!currentParentId) {
          throw conflictError("A top-level task cannot be outdented further.");
        }

        const parent = aggregate.tasks.find((entry) => entry.id === currentParentId);
        if (!parent) {
          throw notFoundError("LT parent introuvable.");
        }

        const newParentId = parent.parentId ?? null;
        assertValidParent(aggregate.tasks, task.id, newParentId);
        task.parentId = newParentId;

        const destinationSiblings = getSiblingTasks(aggregate.tasks, newParentId)
          .filter((entry) => entry.id !== task.id)
          .map((entry) => entry.id);
        const parentIndex = destinationSiblings.findIndex((entry) => entry === parent.id);
        destinationSiblings.splice(parentIndex + 1, 0, task.id);

        renumberSiblingTasks(aggregate.tasks, currentParentId);
        renumberSiblingTasks(aggregate.tasks, newParentId, destinationSiblings);
        break;
      }
    }

    aggregate.project.updatedAt = nowIso();
  });
}

export async function saveDependency(input: SaveDependencyInput) {
  const validated = validateDependencyInput(input);

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    const predecessorRecord = findTaskInStore(
      draft,
      validated.predecessorProjectId,
      validated.predecessorTaskId,
    );
    const successorRecord = findTaskInStore(
      draft,
      validated.successorProjectId,
      validated.successorTaskId,
    );

    if (!predecessorRecord || !successorRecord) {
      throw notFoundError("Les LT liés doivent exister dans leurs projets.");
    }

    if (
      validated.predecessorProjectId !== input.projectId &&
      validated.successorProjectId !== input.projectId
    ) {
      throw conflictError(
        "A dependency saved from this project must involve at least one task in this project.",
      );
    }

    const predecessor = predecessorRecord.task;
    const successor = successorRecord.task;
    if (
      getProjectTaskKey(validated.predecessorProjectId, predecessor.id) ===
      getProjectTaskKey(validated.successorProjectId, successor.id)
    ) {
      throw conflictError("A task cannot depend on itself.");
    }

    if (
      predecessor.type === "SUMMARY" ||
      successor.type === "SUMMARY" ||
      taskHasChildren(predecessorRecord.aggregate.tasks, predecessor.id) ||
      taskHasChildren(successorRecord.aggregate.tasks, successor.id)
    ) {
      throw conflictError("Summary tasks cannot participate in dependency logic.");
    }

    const allDependencies = draft.projects.flatMap((entry) => entry.dependencies);
    const existing = aggregate.dependencies.find(
      (dependency) =>
        dependency.predecessorProjectId === validated.predecessorProjectId &&
        dependency.predecessorTaskId === validated.predecessorTaskId &&
        dependency.successorProjectId === validated.successorProjectId &&
        dependency.successorTaskId === validated.successorTaskId,
    );

    const dependenciesWithoutCurrent = allDependencies.filter(
      (dependency) => dependency.id !== existing?.id,
    );
    if (
      createsDependencyCycle(
        dependenciesWithoutCurrent,
        validated.predecessorProjectId,
        validated.predecessorTaskId,
        validated.successorProjectId,
        validated.successorTaskId,
      )
    ) {
      throw conflictError(
        "This dependency would create a cycle in the portfolio task network.",
      );
    }

    if (existing) {
      existing.predecessorProjectId = validated.predecessorProjectId;
      existing.successorProjectId = validated.successorProjectId;
      existing.type = validated.type;
      if (existing.lagDays !== validated.lagDays) existing.lagUnits = null;
      existing.lagDays = validated.lagDays;
    } else {
      aggregate.dependencies.push({
        id: randomUUID().slice(0, 8),
        projectId: input.projectId,
        predecessorProjectId: validated.predecessorProjectId,
        predecessorTaskId: validated.predecessorTaskId,
        successorProjectId: validated.successorProjectId,
        successorTaskId: validated.successorTaskId,
        type: validated.type,
        lagDays: validated.lagDays,
        createdAt: nowIso(),
      });
    }

    aggregate.project.updatedAt = nowIso();
  });
}

export async function createResource(input: CreateResourceInput) {
  const resourceId = randomUUID().slice(0, 8);

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    const validated = validateResourceInput(input, getNextResourceColor(aggregate));
    aggregate.resources.push({
      id: resourceId,
      projectId: input.projectId,
      name: validated.name,
      role: validated.role,
      type: validated.type,
      location: validated.location,
      availabilityPct: validated.availabilityPct,
      capacityHoursPerDay: validated.capacityHoursPerDay,
      calendarWorkingDays: validated.calendarWorkingDays,
      calendarHoursPerDay: validated.calendarHoursPerDay,
      calendarExceptions: validated.calendarExceptions,
      costRate: validated.costRate,
      color: validated.color || getNextResourceColor(aggregate),
    });
    aggregate.project.updatedAt = nowIso();
  });

  return resourceId;
}

export async function updateResource(input: UpdateResourceInput) {
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    const resource = aggregate.resources.find((entry) => entry.id === input.resourceId);

    if (!resource) {
      throw notFoundError("Ressource introuvable.");
    }

    const validated = validateResourceInput(input, resource.color);

    Object.assign(resource, {
      name: validated.name,
      role: validated.role,
      type: validated.type,
      location: validated.location,
      availabilityPct: validated.availabilityPct,
      capacityHoursPerDay: validated.capacityHoursPerDay,
      calendarWorkingDays: validated.calendarWorkingDays,
      calendarHoursPerDay: validated.calendarHoursPerDay,
      calendarExceptions: validated.calendarExceptions,
      costRate: validated.costRate,
      color: validated.color,
    });

    recalculateTaskPlanningStates(
      aggregate,
      aggregate.assignments
        .filter((assignment) => assignment.resourceId === resource.id)
        .map((assignment) => assignment.taskId),
    );

    aggregate.project.updatedAt = nowIso();
  });
}

/** Disponibilité (intensité) par mois d'une ressource — calendrier de disponibilité FGF. */
export async function setResourceAvailability(input: {
  projectId: string;
  resourceId: string;
  availabilityByMonth: Record<string, number>;
}) {
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    const resource = aggregate.resources.find((entry) => entry.id === input.resourceId);
    if (!resource) throw notFoundError("Ressource introuvable.");
    // Nettoyage : ne garde que des clés "YYYY-MM" avec une intensité >= 0.
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(input.availabilityByMonth)) {
      if (/^\d{4}-\d{2}$/.test(k) && Number.isFinite(v) && v >= 0) {
        clean[k] = Math.round(v * 100) / 100;
      }
    }
    resource.availabilityByMonth = clean;
    aggregate.project.updatedAt = nowIso();
  });
}

export async function saveAssignment(input: SaveAssignmentInput) {
  const validated = validateAssignmentInput(input);

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    const task = aggregate.tasks.find((entry) => entry.id === validated.taskId);
    const resource = aggregate.resources.find(
      (entry) => entry.id === validated.resourceId,
    );

    if (!task) {
      throw notFoundError("LT introuvable pour cette affectation.");
    }

    if (!resource) {
      throw notFoundError("Ressource introuvable pour cette affectation.");
    }

    if (task.type === "SUMMARY" || taskHasChildren(aggregate.tasks, task.id)) {
      throw conflictError("Assignments can only be placed on exécutable tasks.");
    }

    const existing = aggregate.assignments.find(
      (assignment) =>
        assignment.taskId === validated.taskId &&
        assignment.resourceId === validated.resourceId,
    );

    if (existing) {
      existing.allocationPct = validated.allocationPct;
      existing.notes = validated.notes;
    } else {
      const assignment: Assignment = {
        id: randomUUID().slice(0, 8),
        projectId: input.projectId,
        taskId: validated.taskId,
        resourceId: validated.resourceId,
        allocationPct: validated.allocationPct,
        notes: validated.notes,
      };

      aggregate.assignments.push(assignment);
    }

    recalculateTaskPlanningState(task, aggregate);

    aggregate.project.updatedAt = nowIso();
  });
}

export async function saveTimesheetEntry(input: SaveTimesheetEntryInput) {
  const validated = validateTimesheetEntryInput(input);

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    const task = aggregate.tasks.find((entry) => entry.id === validated.taskId);
    const resource = validated.resourceId
      ? aggregate.resources.find((entry) => entry.id === validated.resourceId) ?? null
      : null;

    if (!task) {
      throw notFoundError("LT introuvable pour cette saisie de temps.");
    }

    if (task.type === "SUMMARY" || taskHasChildren(aggregate.tasks, task.id)) {
      throw conflictError("Timesheet actuals can only be logged against exécutable tasks.");
    }

    if (validated.resourceId && !resource) {
      throw notFoundError("Ressource introuvable pour cette saisie de temps.");
    }

    const persistedCostAmount =
      validated.costAmount ??
      (resource?.costRate != null
        ? roundCurrency(validated.workHours * resource.costRate)
        : null);
    const nextEntry: TimesheetEntry = {
      id: validated.entryId ?? randomUUID().slice(0, 8),
      projectId: input.projectId,
      taskId: validated.taskId,
      resourceId: validated.resourceId,
      entryDate: validated.entryDate,
      workHours: roundWorkHours(validated.workHours),
      costAmount: persistedCostAmount,
      notes: validated.notes,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const existingIndex = aggregate.timesheetEntries.findIndex(
      (entry) => entry.id === nextEntry.id,
    );

    if (existingIndex >= 0) {
      aggregate.timesheetEntries[existingIndex] = {
        ...aggregate.timesheetEntries[existingIndex],
        ...nextEntry,
        createdAt: aggregate.timesheetEntries[existingIndex].createdAt,
        updatedAt: nowIso(),
      };
    } else {
      aggregate.timesheetEntries.push(nextEntry);
      aggregate.timesheetEntries.sort(
        (left, right) => left.entryDate.localeCompare(right.entryDate) || left.id.localeCompare(right.id),
      );
    }

    syncTimesheetCostLedgerEntry(aggregate, nextEntry, task, resource);

    aggregate.project.updatedAt = nowIso();
  });
}

export async function deleteTimesheetEntry(projectId: string, entryId: string) {
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);
    const entry = aggregate.timesheetEntries.find((item) => item.id === entryId);

    if (!entry) {
      throw notFoundError("Saisie de temps introuvable.");
    }

    aggregate.timesheetEntries = aggregate.timesheetEntries.filter(
      (item) => item.id !== entryId,
    );
    aggregate.actualCostEntries = aggregate.actualCostEntries.filter(
      (item) => item.timesheetEntryId !== entryId,
    );
    aggregate.project.updatedAt = nowIso();
  });
}

export async function saveActualCostEntry(input: SaveActualCostEntryInput) {
  const validated = validateActualCostEntryInput(input);

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    const task = validated.taskId
      ? aggregate.tasks.find((entry) => entry.id === validated.taskId)
      : null;
    const resource = validated.resourceId
      ? aggregate.resources.find((entry) => entry.id === validated.resourceId)
      : null;

    if (validated.taskId && !task) {
      throw notFoundError("LT introuvable pour ce coût réel.");
    }

    if (validated.resourceId && !resource) {
      throw notFoundError("Ressource introuvable pour ce coût réel.");
    }

    if (task && (task.type === "SUMMARY" || taskHasChildren(aggregate.tasks, task.id))) {
      throw conflictError(
        "Manual actual costs can only be posted against exécutable tasks or the project ledger.",
      );
    }

    if (validated.amount == null) {
      throw validationError(
        "Actual cost amount is required unless quantity and unit cost are both supplied.",
      );
    }

    const existingEntry = validated.entryId
      ? aggregate.actualCostEntries.find((entry) => entry.id === validated.entryId)
      : null;

    upsertActualCostEntry(aggregate, {
      id: existingEntry?.id ?? validated.entryId ?? randomUUID().slice(0, 8),
      projectId: input.projectId,
      taskId: validated.taskId,
      resourceId: validated.resourceId,
      timesheetEntryId: existingEntry?.timesheetEntryId ?? null,
      entryDate: validated.entryDate,
      source: existingEntry?.timesheetEntryId ? existingEntry.source : validated.source,
      category: validated.category,
      vendorName: validated.vendorName,
      referenceCode: validated.referenceCode,
      description: validated.description,
      quantity: validated.quantity,
      unitCost: validated.unitCost,
      amount: roundCurrency(validated.amount),
      currencyCode: validated.currencyCode,
      createdAt: existingEntry?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    });

    aggregate.project.updatedAt = nowIso();
  });
}

export async function deleteActualCostEntry(projectId: string, entryId: string) {
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);
    const entry = aggregate.actualCostEntries.find((item) => item.id === entryId);

    if (!entry) {
      throw notFoundError("Coût réel introuvable.");
    }

    if (entry.source === "TIMESHEET" && entry.timesheetEntryId) {
      throw conflictError(
        "Delete the linked timesheet entry to remove a timesheet-sourced actual cost.",
      );
    }

    aggregate.actualCostEntries = aggregate.actualCostEntries.filter(
      (item) => item.id !== entryId,
    );
    aggregate.project.updatedAt = nowIso();
  });
}

export async function deleteTask(projectId: string, taskId: string) {
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);
    const task = aggregate.tasks.find((entry) => entry.id === taskId);

    if (!task) {
      throw notFoundError("LT introuvable.");
    }

    const taskIdsToDelete = new Set([taskId, ...collectDescendantTaskIds(aggregate.tasks, taskId)]);

    aggregate.tasks = aggregate.tasks.filter((entry) => !taskIdsToDelete.has(entry.id));
    for (const projectAggregate of draft.projects) {
      const nextDependencies = projectAggregate.dependencies.filter((dependency) => {
        const predecessorDeleted =
          dependency.predecessorProjectId === projectId &&
          taskIdsToDelete.has(dependency.predecessorTaskId);
        const successorDeleted =
          dependency.successorProjectId === projectId &&
          taskIdsToDelete.has(dependency.successorTaskId);
        return !predecessorDeleted && !successorDeleted;
      });

      if (nextDependencies.length !== projectAggregate.dependencies.length) {
        projectAggregate.dependencies = nextDependencies;
        if (projectAggregate.project.id !== projectId) {
          projectAggregate.project.updatedAt = nowIso();
        }
      }
    }
    aggregate.assignments = aggregate.assignments.filter(
      (assignment) => !taskIdsToDelete.has(assignment.taskId),
    );
    aggregate.baselines = aggregate.baselines.map((baseline) => ({
      ...baseline,
      snapshots: baseline.snapshots.filter((snapshot) => !taskIdsToDelete.has(snapshot.taskId)),
    }));
    aggregate.timesheetEntries = aggregate.timesheetEntries.filter(
      (entry) => !taskIdsToDelete.has(entry.taskId),
    );
    aggregate.actualCostEntries = aggregate.actualCostEntries.filter(
      (entry) => !entry.taskId || !taskIdsToDelete.has(entry.taskId),
    );
    aggregate.project.updatedAt = nowIso();
  });
}

export async function deleteDependency(projectId: string, dependencyId: string) {
  await mutateStore((draft) => {
    const ownerAggregate = draft.projects.find((entry) =>
      entry.dependencies.some(
        (dependency) =>
          dependency.id === dependencyId && dependencyTouchesProject(dependency, projectId),
      ),
    );

    if (!ownerAggregate) {
      throw notFoundError("Lien introuvable.");
    }

    ownerAggregate.dependencies = ownerAggregate.dependencies.filter(
      (dependency) => dependency.id !== dependencyId,
    );
    ownerAggregate.project.updatedAt = nowIso();
  });
}

export async function deleteResource(projectId: string, resourceId: string) {
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);
    const resourceCount = aggregate.resources.length;
    const affectedTaskIds = aggregate.assignments
      .filter((assignment) => assignment.resourceId === resourceId)
      .map((assignment) => assignment.taskId);

    aggregate.resources = aggregate.resources.filter((resource) => resource.id !== resourceId);
    if (aggregate.resources.length === resourceCount) {
      throw notFoundError("Ressource introuvable.");
    }

    aggregate.assignments = aggregate.assignments.filter(
      (assignment) => assignment.resourceId !== resourceId,
    );
    aggregate.timesheetEntries = aggregate.timesheetEntries.map((entry) =>
      entry.resourceId === resourceId
        ? {
            ...entry,
            resourceId: null,
            updatedAt: nowIso(),
          }
        : entry,
    );
    aggregate.actualCostEntries = aggregate.actualCostEntries.map((entry) =>
      entry.resourceId === resourceId
        ? {
            ...entry,
            resourceId: null,
            updatedAt: nowIso(),
          }
        : entry,
    );
    recalculateTaskPlanningStates(aggregate, affectedTaskIds);
    aggregate.project.updatedAt = nowIso();
  });
}

export async function deleteAssignment(projectId: string, assignmentId: string) {
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);
    const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);

    if (!assignment) {
      throw notFoundError("Affectation introuvable.");
    }

    aggregate.assignments = aggregate.assignments.filter(
      (entry) => entry.id !== assignmentId,
    );
    const task = aggregate.tasks.find((entry) => entry.id === assignment.taskId);
    if (task) {
      recalculateTaskPlanningState(task, aggregate);
    }

    aggregate.project.updatedAt = nowIso();
  });
}

export async function deleteProject(projectId: string, confirmationName: string) {
  const expectedName = ensureText(confirmationName, "Nom de confirmation", {
    maxLength: 160,
  });

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);

    if (aggregate.project.name !== expectedName) {
      throw conflictError("Type the project name exactly to confirm permanent deletion.");
    }

    draft.projects = draft.projects.filter((entry) => entry.project.id !== aggregate.project.id);
    for (const entry of draft.projects) {
      if (entry.project.sourceProjectId === aggregate.project.id) {
        entry.project.sourceProjectId = null;
      }

      const nextDependencies = entry.dependencies.filter(
        (dependency) =>
          dependency.predecessorProjectId !== aggregate.project.id &&
          dependency.successorProjectId !== aggregate.project.id,
      );
      if (nextDependencies.length !== entry.dependencies.length) {
        entry.dependencies = nextDependencies;
        entry.project.updatedAt = nowIso();
      }
    }
  });
}

export async function captureBaseline(projectId: string, name: string, capturedBy: string) {
  const baselineName = ensureText(name, "Référentiel name", { maxLength: 120 });
  const baselineOwner = ensureText(capturedBy, "Référentiel captured by", {
    maxLength: 120,
  });

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);
    const baselineId = randomUUID().slice(0, 8);

    for (const baseline of aggregate.baselines) {
      baseline.isActive = false;
    }

    aggregate.baselines.unshift(
      buildBaselineFromStore(draft, aggregate, {
        baselineId,
        name: baselineName,
        description: "Captured from the current working schedule.",
        capturedAt: nowIso(),
        capturedBy: baselineOwner,
        isActive: true,
      }),
    );

    aggregate.project.updatedAt = nowIso();
  });
}

export async function setActiveBaseline(projectId: string, baselineId: string) {
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);
    const baseline = aggregate.baselines.find((entry) => entry.id === baselineId);

    if (!baseline) {
      throw notFoundError("Référentiel introuvable.");
    }

    for (const entry of aggregate.baselines) {
      entry.isActive = entry.id === baselineId;
    }

    aggregate.project.updatedAt = nowIso();
  });
}

export async function levelProjectResources(projectId: string) {
  let result = { stabilized: true, remainingOverloads: 0, links: 0 };
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);
    const plan = calculateLevelingPlan(aggregate);

    aggregate.dependencies = [
      ...aggregate.dependencies.filter((d) => !isLevelingLink(d)),
      ...plan.resourceLinks,
    ];
    for (const task of aggregate.tasks) {
      task.levelingDelayDays = 0;
    }
    result = { stabilized: plan.stabilized, remainingOverloads: plan.remainingOverloads, links: plan.resourceLinks.length };
    aggregate.project.updatedAt = nowIso();
  });
  return result;
}

/**
 * Nivellement par ALLONGEMENT (spec FGF) : au lieu de retarder les tâches,
 * on les allonge pour diminuer l'intensité d'utilisation des ressources
 * surchargées — la charge (effort) reste constante :
 *   durée' = durée × F  et  intensité' = intensité / F,
 * où F = surcharge maximale de la ressource (allocation max / disponibilité).
 * Renvoie le nombre de tâches allongées.
 */
export async function stretchProjectResources(projectId: string) {
  let stretchedCount = 0;

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);
    const schedule = buildSchedule(aggregate);
    const summaries = buildResourceSummaries(aggregate, schedule.tasksById);

    // Facteur de surcharge par ressource (1 = pas de surcharge).
    const overloadByResourceId = new Map<string, number>();
    for (const summary of summaries) {
      const availability = Math.max(summary.resource.availabilityPct, 1);
      const factor = summary.maxAllocationPct / availability;
      if (factor > 1.001) {
        overloadByResourceId.set(summary.resource.id, factor);
      }
    }

    if (overloadByResourceId.size === 0) {
      return;
    }

    // Facteur d'allongement par tâche = max des surcharges de ses ressources.
    const factorByTaskId = new Map<string, number>();
    for (const assignment of aggregate.assignments) {
      const factor = overloadByResourceId.get(assignment.resourceId);
      if (!factor) continue;
      const current = factorByTaskId.get(assignment.taskId) ?? 1;
      factorByTaskId.set(assignment.taskId, Math.max(current, factor));
    }

    for (const task of aggregate.tasks) {
      const factor = factorByTaskId.get(task.id);
      if (
        !factor ||
        task.type !== "TASK" ||
        task.schedulingMode === "MANUAL" ||
        task.durationDays <= 0
      ) {
        continue;
      }

      task.durationDays = Math.ceil(task.durationDays * factor);
      stretchedCount += 1;

      // Réduction proportionnelle de l'intensité sur les ressources surchargées.
      for (const assignment of aggregate.assignments) {
        if (
          assignment.taskId === task.id &&
          overloadByResourceId.has(assignment.resourceId)
        ) {
          assignment.allocationPct = Math.max(
            1,
            Math.round(assignment.allocationPct / factor),
          );
        }
      }
    }

    aggregate.project.updatedAt = nowIso();
  });

  return stretchedCount;
}

export async function levelWorkspaceResources(workspaceId: string) {
  await mutateStore((draft) => {
    const aggregates = draft.projects.filter(
      (aggregate) =>
        aggregate.project.workspaceId === workspaceId &&
        !aggregate.project.archivedAt,
    );

    for (const aggregate of aggregates) {
      for (const task of aggregate.tasks) {
        if (task.schedulingMode !== "MANUAL") {
          task.levelingDelayDays = 0;
        }
      }
    }

    const delayByTaskId = new Map<string, number>();
    const maxIterations = Math.max(
      aggregates.reduce((sum, aggregate) => sum + aggregate.assignments.length, 0) * 30,
      100,
    );

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const schedules = new Map(
        aggregates.map((aggregate) => [aggregate.project.id, buildSchedule(aggregate)]),
      );
      const buckets = new Map<
        string,
        {
          date: string;
          resourceKey: string;
          allocatedHours: number;
          capacityHours: number;
          taskRefs: Array<{ projectId: string; taskId: string }>;
        }
      >();

      for (const aggregate of aggregates) {
        const schedule = schedules.get(aggregate.project.id)!;
        const resourcesById = new Map(aggregate.resources.map((resource) => [resource.id, resource]));

        for (const assignment of aggregate.assignments) {
          const task = schedule.tasksById[assignment.taskId];
          const resource = resourcesById.get(assignment.resourceId);
          if (!task || !resource || !task.scheduledStartDate || !task.scheduledFinishDate || task.isSummary) {
            continue;
          }

          const resourceKey = `${resource.name.trim().toLowerCase()}|${resource.role.trim().toLowerCase()}`;
          const taskCalendar = getTaskWorkingCalendar(aggregate, task);
          let cursor = task.scheduledStartDate;
          let guard = 0;
          while (compareIsoDates(cursor, task.scheduledFinishDate) <= 0 && guard < 370) {
            if (isWorkingDay(cursor, taskCalendar)) {
              const key = `${resourceKey}|${cursor}`;
              const existing =
                buckets.get(key) ??
                {
                  date: cursor,
                  resourceKey,
                  allocatedHours: 0,
                  capacityHours: 0,
                  taskRefs: [],
                };
              existing.allocatedHours +=
                resource.capacityHoursPerDay *
                (resource.availabilityPct / 100) *
                (assignment.allocationPct / 100);
              existing.capacityHours = Math.max(
                existing.capacityHours,
                resource.capacityHoursPerDay * (resource.availabilityPct / 100),
              );
              existing.taskRefs.push({
                projectId: aggregate.project.id,
                taskId: task.id,
              });
              buckets.set(key, existing);
            }
            cursor = addWorkingDays(cursor, 1, taskCalendar);
            guard += 1;
          }
        }
      }

      const overload = [...buckets.values()].find(
        (bucket) => bucket.allocatedHours - bucket.capacityHours > 0.05,
      );
      if (!overload) {
        break;
      }

      const candidates = overload.taskRefs
        .map((ref) => {
          const aggregate = aggregates.find((entry) => entry.project.id === ref.projectId);
          const schedule = schedules.get(ref.projectId);
          const task = schedule?.tasksById[ref.taskId];
          return aggregate && task ? { aggregate, task } : null;
        })
        .filter((entry): entry is { aggregate: ProjectAggregate; task: ScheduledTask } => Boolean(entry))
        .filter(({ task }) => isLevelableTask(task))
        .filter(
          ({ aggregate, task }) =>
            (delayByTaskId.get(task.id) ?? 0) < aggregate.project.levelingMaxDelayDays,
        )
        .sort((left, right) => {
          const priorityDiff = getLevelingPriority(left.task) - getLevelingPriority(right.task);
          if (priorityDiff !== 0) return priorityDiff;
          const slackDiff = (right.task.totalSlackDays ?? 0) - (left.task.totalSlackDays ?? 0);
          if (slackDiff !== 0) return slackDiff;
          return compareIsoDates(right.task.scheduledStartDate ?? null, left.task.scheduledStartDate ?? null);
        });

      const candidate = candidates[0];
      if (!candidate) {
        break;
      }

      const nextDelay = (delayByTaskId.get(candidate.task.id) ?? 0) + 1;
      delayByTaskId.set(candidate.task.id, nextDelay);
      const mutableTask = candidate.aggregate.tasks.find((task) => task.id === candidate.task.id);
      if (mutableTask && mutableTask.schedulingMode !== "MANUAL" && mutableTask.type !== "SUMMARY") {
        mutableTask.levelingDelayDays = nextDelay;
      }
    }

    for (const aggregate of aggregates) {
      aggregate.project.updatedAt = nowIso();
    }
  });
}

export async function clearProjectLeveling(projectId: string) {
  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, projectId);

    for (const task of aggregate.tasks) {
      task.levelingDelayDays = 0;
    }
    aggregate.dependencies = aggregate.dependencies.filter((d) => !isLevelingLink(d));

    aggregate.project.updatedAt = nowIso();
  });
}

export async function updateProjectCalendar(input: UpdateProjectCalendarInput) {
  const validated = validateProjectCalendarInput(input);

  await mutateStore((draft) => {
    const aggregate = getAggregateOrThrow(draft, input.projectId);
    aggregate.calendar = {
      ...aggregate.calendar,
      name: validated.name,
      timezone: validated.timezone,
      workingDays: validated.workingDays,
      hoursPerDay: validated.hoursPerDay,
      exceptions: validated.exceptions,
    };
    aggregate.project.levelingStrategy = validated.levelingStrategy;
    aggregate.project.levelingMaxDelayDays = validated.levelingMaxDelayDays;
    recalculateTaskPlanningStates(
      aggregate,
      aggregate.tasks
        .filter((task) => task.type !== "SUMMARY")
        .map((task) => task.id),
    );
    aggregate.project.updatedAt = nowIso();
  });
}

export async function exportProjectData(projectId: string) {
  const store = await readStore();
  const view = buildProjectViewFromStore(store, projectId);

  return {
    product: "Cheetah Time",
    exportedAt: nowIso(),
    dataModelVersion: store.version,
    persistence: getPersistenceInfo(),
    project: view.aggregate.project,
    calendar: view.aggregate.calendar,
    tasks: view.aggregate.tasks,
    scheduledTasks: view.tasks,
    dependencies: view.aggregate.dependencies,
    dependencyNetwork: view.dependencyNetwork,
    resources: view.aggregate.resources,
    assignments: view.aggregate.assignments,
    timesheetEntries: view.aggregate.timesheetEntries,
    actualCostEntries: view.aggregate.actualCostEntries,
    baselines: view.aggregate.baselines,
    baselineVarianceByTaskId: view.baselineVarianceByTaskId,
    resourceSummaries: view.resourceSummaries,
    metrics: view.metrics,
    schedule: view.schedule,
  };
}
