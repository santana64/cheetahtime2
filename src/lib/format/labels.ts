import type {
  ActualCostCategory,
  ActualCostSource,
  ProjectHealth,
  ProjectOrigin,
  ProjectStatus,
  ResourceType,
  TaskConstraintType,
  TaskPriority,
  TaskSchedulingMode,
  TaskStatus,
  TaskType,
  TaskWorkFormula,
} from "@/types/planning";

export const weekdayLabelsFr = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export const workingDayOptionsFr = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 7, label: "Dim" },
] as const;

const projectHealthLabels: Record<ProjectHealth, string> = {
  ON_TRACK: "En bonne voie",
  WATCH: "Sous surveillance",
  AT_RISK: "A risque",
  OFF_TRACK: "Hors trajectoire",
};

const projectStatusLabels: Record<ProjectStatus, string> = {
  ACTIVE: "Actif",
  PLANNING: "Planification",
  AT_RISK: "A risque",
  ON_HOLD: "En pause",
  COMPLETED: "Termine",
};

const projectOriginLabels: Record<ProjectOrigin, string> = {
  SEEDED: "Demo",
  CREATED: "Cree",
  DUPLICATED: "Duplique",
  TEMPLATE: "Modele",
};

const taskStatusLabels: Record<TaskStatus, string> = {
  DONE: "Termine",
  IN_PROGRESS: "En cours",
  BLOCKED: "Bloque",
  NOT_STARTED: "Non demarre",
};

const taskPriorityLabels: Record<TaskPriority, string> = {
  URGENT: "Urgente",
  HIGH: "Elevee",
  MEDIUM: "Normale",
  LOW: "Faible",
};

const taskTypeLabels: Record<TaskType, string> = {
  SUMMARY: "Recapitulatif",
  TASK: "Tache",
  MILESTONE: "Jalon",
};

const taskConstraintLabels: Record<TaskConstraintType, string> = {
  ASAP: "Des que possible",
  START_NO_EARLIER_THAN: "Debut au plus tot le",
  START_NO_LATER_THAN: "Debut au plus tard le",
  FINISH_NO_EARLIER_THAN: "Fin au plus tot le",
  FINISH_NO_LATER_THAN: "Fin au plus tard le",
  MUST_START_ON: "Doit debuter le",
  MUST_FINISH_ON: "Doit finir le",
};

const taskSchedulingModeLabels: Record<TaskSchedulingMode, string> = {
  AUTO: "Planifie automatiquement",
  MANUAL: "Planifie manuellement",
};

const taskWorkFormulaLabels: Record<TaskWorkFormula, string> = {
  FIXED_DURATION: "Duree fixe",
  FIXED_WORK: "Charge fixe",
  FIXED_UNITS: "Unites fixes",
};

const resourceTypeLabels: Record<ResourceType, string> = {
  PERSON: "Personne",
  TEAM: "Equipe",
  EQUIPMENT: "Equipement",
};

const actualCostCategoryLabels: Record<ActualCostCategory, string> = {
  LABOR: "Main-d'oeuvre",
  MATERIAL: "Materiel",
  EQUIPMENT: "Equipement",
  SUBCONTRACT: "Sous-traitance",
  TRAVEL: "Deplacement",
  OVERHEAD: "Frais generaux",
  OTHER: "Autre",
};

const actualCostSourceLabels: Record<ActualCostSource, string> = {
  TIMESHEET: "Feuille de temps",
  MANUAL: "Saisie manuelle",
  IMPORT: "Import",
};

export function formatProjectHealthLabel(value: ProjectHealth) {
  return projectHealthLabels[value];
}

export function formatProjectStatusLabel(value: ProjectStatus) {
  return projectStatusLabels[value];
}

export function formatProjectOriginLabel(value: ProjectOrigin) {
  return projectOriginLabels[value];
}

export function formatTaskStatusLabel(value: TaskStatus) {
  return taskStatusLabels[value];
}

export function formatTaskPriorityLabel(value: TaskPriority) {
  return taskPriorityLabels[value];
}

export function formatTaskTypeLabel(value: TaskType) {
  return taskTypeLabels[value];
}

export function formatTaskConstraintLabel(value: TaskConstraintType) {
  return taskConstraintLabels[value];
}

export function formatTaskSchedulingModeLabel(value: TaskSchedulingMode) {
  return taskSchedulingModeLabels[value];
}

export function formatTaskWorkFormulaLabel(value: TaskWorkFormula) {
  return taskWorkFormulaLabels[value];
}

export function formatResourceTypeLabel(value: ResourceType) {
  return resourceTypeLabels[value];
}

export function formatActualCostCategoryLabel(value: ActualCostCategory) {
  return actualCostCategoryLabels[value];
}

export function formatActualCostSourceLabel(value: ActualCostSource) {
  return actualCostSourceLabels[value];
}
