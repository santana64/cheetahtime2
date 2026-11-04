import type {
  Assignment,
  Baseline,
  BaselineTaskSnapshot,
  Dependency,
  Project,
  ProjectCalendar,
  Resource,
  Task,
} from "@/types/planning";

export function createCalendar(projectId: string, timezone: string): ProjectCalendar {
  return {
    id: `${projectId}-calendar`,
    name: "Calendrier chantier",
    timezone,
    workingDays: [1, 2, 3, 4, 5],
    hoursPerDay: 8,
    exceptions: [
      {
        id: `${projectId}-ferie-1`,
        date: "2026-05-01",
        label: "Fête du Travail",
        isWorkingDay: false,
      },
      {
        id: `${projectId}-ferie-2`,
        date: "2026-05-14",
        label: "Jeudi de l'Ascension",
        isWorkingDay: false,
      },
      {
        id: `${projectId}-samedi-travaille`,
        date: "2026-06-13",
        label: "Samedi travaillé (rattrapage chantier)",
        isWorkingDay: true,
      },
      {
        id: `${projectId}-ferie-3`,
        date: "2026-07-14",
        label: "Fête nationale",
        isWorkingDay: false,
      },
    ],
  };
}

export function createProject(
  base: Partial<Project> & Pick<Project, "id" | "slug" | "code" | "name">,
): Project {
  return {
    workspaceId: "workspace-cheetah-time",
    origin: "SEEDED",
    sourceProjectId: null,
    clientName: "Client",
    description: "",
    portfolio: "Opérations",
    ownerUserId: null,
    ownerName: "Directeur de projet",
    sponsorUserId: null,
    sponsorName: "Maître d'ouvrage",
    status: "PLANNING",
    health: "ON_TRACK",
    targetStartDate: "2026-04-06",
    targetFinishDate: null,
    budgetAmount: 0,
    currencyCode: "EUR",
    levelingStrategy: "PRIORITY_THEN_SLACK",
    levelingMaxDelayDays: 30,
    archivedAt: null,
    archivedBy: null,
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-04-15T09:00:00.000Z",
    ...base,
  };
}

export function taskFactory(projectId: string) {
  return function createTask(
    base: Partial<Task> &
      Pick<Task, "id" | "name" | "sortOrder" | "type" | "durationDays">,
  ): Task {
    return {
      projectId,
      parentId: null,
      description: "",
      notes: "",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      progressPercent: 0,
      schedulingMode: "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: base.durationDays * 8,
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
      remainingWorkHours: base.durationDays * 8,
      ...base,
    };
  };
}

export function dependencyFactory(projectId: string) {
  return function createDependency(
    id: string,
    predecessorTaskId: string,
    successorTaskId: string,
    type: Dependency["type"],
    lagDays = 0,
    label?: string,
  ): Dependency {
    return {
      id,
      projectId,
      predecessorTaskId,
      predecessorProjectId: projectId,
      successorProjectId: projectId,
      successorTaskId,
      type,
      lagDays,
      label,
      createdAt: "2026-03-20T10:00:00.000Z",
    };
  };
}

/**
 * Taux horaire par défaut (EUR/h) déduit du rôle — alimente la chaîne de coût
 * FGF (BàD / VA / Dépenses / CP) pour que le cockpit de coûtenance affiche de
 * vraies valeurs. Surchargeable par `costRate` explicite sur chaque ressource.
 */
export function defaultCostRate(role: string, type: Resource["type"]): number | null {
  const r = role.toLowerCase();
  // Une équipe = taux journalier mélangé plus élevé qu'une personne seule.
  if (type === "TEAM") return 280;
  // Encadrement / maîtrise d'œuvre senior.
  if (/directeur|directrice|architect|principal|chef|head|sponsor|responsable|coordinateur|coordinatrice|manager|lead/.test(r))
    return 145;
  // Cadres techniques.
  if (/senior|expert|consultant|ing[ée]nieur|conducteur|conductrice|[ée]conomiste|sp[ée]cialiste|charg[ée]|analyst|engineer/.test(r))
    return 110;
  // Exécution / support.
  if (/junior|assistant|support|intern|apprenti|stagiaire|technicien|ouvrier/.test(r))
    return 65;
  return 90;
}

export function resourceFactory(projectId: string) {
  return function createResource(
    base: Partial<Resource> &
      Pick<Resource, "id" | "name" | "role" | "color">,
  ): Resource {
    const type = base.type ?? "PERSON";
    return {
      projectId,
      type: "PERSON",
      location: "Paris",
      availabilityPct: 100,
      capacityHoursPerDay: 8,
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      ...base,
      costRate: base.costRate ?? defaultCostRate(base.role, type),
    };
  };
}

export function assignmentFactory(projectId: string) {
  return function createAssignment(
    id: string,
    taskId: string,
    resourceId: string,
    allocationPct: number,
    notes?: string,
  ): Assignment {
    return {
      id,
      projectId,
      taskId,
      resourceId,
      allocationPct,
      notes,
    };
  };
}

export function snapshotFactory() {
  return function createSnapshot(
    baselineId: string,
    taskId: string,
    name: string,
    startDate: string | null,
    finishDate: string | null,
    durationDays: number,
    progressPercent: number,
    isCritical: boolean,
    workHours = durationDays * 8,
    plannedCost = 0,
  ): BaselineTaskSnapshot {
    return {
      id: `${baselineId}-${taskId}`,
      baselineId,
      taskId,
      name,
      startDate,
      finishDate,
      durationDays,
      workHours,
      plannedCost,
      progressPercent,
      isCritical,
    };
  };
}

export function createBaseline(
  projectId: string,
  base: Omit<Baseline, "projectId">,
): Baseline {
  return {
    projectId,
    ...base,
  };
}
