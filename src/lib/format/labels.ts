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
  AT_RISK: "À risque",
  OFF_TRACK: "Hors trajectoire",
};

const projectStatusLabels: Record<ProjectStatus, string> = {
  ACTIVE: "Actif",
  PLANNING: "Planification",
  AT_RISK: "À risque",
  ON_HOLD: "En pause",
  COMPLETED: "Terminé",
};

const projectOriginLabels: Record<ProjectOrigin, string> = {
  SEEDED: "Démo",
  CREATED: "Créé",
  DUPLICATED: "Dupliqué",
  TEMPLATE: "Modèle",
};

const taskStatusLabels: Record<TaskStatus, string> = {
  DONE: "Terminé",
  IN_PROGRESS: "En cours",
  BLOCKED: "Bloqué",
  NOT_STARTED: "Non démarré",
};

const taskPriorityLabels: Record<TaskPriority, string> = {
  URGENT: "Urgente",
  HIGH: "Élevée",
  MEDIUM: "Normale",
  LOW: "Faible",
};

const taskTypeLabels: Record<TaskType, string> = {
  SUMMARY: "Tâche hamac",
  TASK: "LT",
  MILESTONE: "Jalon",
};

const taskConstraintLabels: Record<TaskConstraintType, string> = {
  ASAP: "Dès que possible",
  START_NO_EARLIER_THAN: "Début au plus tôt le",
  START_NO_LATER_THAN: "Début au plus tard le",
  FINISH_NO_EARLIER_THAN: "Fin au plus tôt le",
  FINISH_NO_LATER_THAN: "Fin au plus tard le",
  MUST_START_ON: "Doit débuter le",
  MUST_FINISH_ON: "Doit finir le",
};

const taskSchedulingModeLabels: Record<TaskSchedulingMode, string> = {
  AUTO: "Planifié automatiquement",
  MANUAL: "Planifié manuellement",
};

const taskWorkFormulaLabels: Record<TaskWorkFormula, string> = {
  FIXED_DURATION: "Durée fixe",
  FIXED_WORK: "Charge fixe",
  FIXED_UNITS: "Unités fixes",
};

const resourceTypeLabels: Record<ResourceType, string> = {
  PERSON: "Personne",
  TEAM: "Équipe",
  EQUIPMENT: "Équipement",
};

const actualCostCategoryLabels: Record<ActualCostCategory, string> = {
  LABOR: "Main-d’œuvre",
  MATERIAL: "Matériel",
  EQUIPMENT: "Équipement",
  SUBCONTRACT: "Sous-traitance",
  TRAVEL: "Déplacement",
  OVERHEAD: "Frais généraux",
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
