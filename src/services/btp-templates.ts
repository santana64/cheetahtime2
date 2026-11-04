import { randomUUID } from "node:crypto";

import { buildSchedule } from "@/lib/planning/schedule-engine";
import { getTaskPlannedCost } from "@/lib/planning/work-model";
import { mutateStore, readStore } from "@/services/project-store";
import type {
  Baseline,
  Dependency,
  ProjectAggregate,
  Resource,
  Task,
  TaskType,
} from "@/types/planning";

export interface BtpTemplateStep {
  id: string;
  name: string;
  type?: TaskType;
  durationDays: number;
  role: string;
  risks: string[];
}

export interface BtpTemplateDefinition {
  id: string;
  name: string;
  sector: string;
  description: string;
  defaultBudget: number;
  steps: BtpTemplateStep[];
  milestones: Array<{ id: string; name: string; afterStepId?: string; beforeFirstStep?: boolean }>;
  resourceRoles: string[];
}

const templates: BtpTemplateDefinition[] = [
  {
    id: "construction-neuve-gros-oeuvre",
    name: "Construction neuve - Gros Oeuvre",
    sector: "Batiment",
    description: "VRD, fondations, structure, clos-couvert, lots techniques, second oeuvre et reception.",
    defaultBudget: 4_800_000,
    resourceRoles: ["Conducteur travaux", "Terrassement", "Fondations", "Gros oeuvre", "Charpente", "Lots techniques", "Second oeuvre", "MOE"],
    milestones: [
      { id: "pc", name: "PC obtenu", beforeFirstStep: true },
      { id: "os", name: "Ordre de service", beforeFirstStep: true },
      { id: "reception", name: "Reception", afterStepId: "finitions" },
      { id: "reserve", name: "Levee reserves", afterStepId: "finitions" },
    ],
    steps: [
      { id: "vrd", name: "LOT 1 - VRD / Terrassement", durationDays: 30, role: "Terrassement", risks: ["meteo", "reseaux existants"] },
      { id: "fondations", name: "LOT 2 - Fondations", durationDays: 20, role: "Fondations", risks: ["geotechnique", "beton"] },
      { id: "structure", name: "LOT 3 - Structure / Gros Oeuvre", durationDays: 60, role: "Gros oeuvre", risks: ["cadence coffrage", "appro acier"] },
      { id: "charpente", name: "LOT 4 - Charpente / Couverture", durationDays: 20, role: "Charpente", risks: ["levage", "meteo"] },
      { id: "clos-couvert", name: "LOT 5 - Clos et Couvert", durationDays: 30, role: "Charpente", risks: ["menuiseries", "interfaces facade"] },
      { id: "lots-techniques", name: "LOT 6 - Lots Techniques", durationDays: 40, role: "Lots techniques", risks: ["synthese technique", "appro materiel"] },
      { id: "second-oeuvre", name: "LOT 7 - Second Oeuvre", durationDays: 30, role: "Second oeuvre", risks: ["coactivite", "qualite support"] },
      { id: "finitions", name: "LOT 8 - Finitions / Revetements", durationDays: 20, role: "Second oeuvre", risks: ["reprises", "nettoyage livraison"] },
    ],
  },
  {
    id: "infrastructure-vrd",
    name: "Infrastructure VRD",
    sector: "Infrastructure",
    description: "Etudes, procedures, terrassements, reseaux secs/humides, revetements, mobilier et signalisation.",
    defaultBudget: 2_600_000,
    resourceRoles: ["Chef projet infra", "Etudes", "Administratif", "Terrassement", "Reseaux secs", "Reseaux humides", "Voirie", "Signalisation"],
    milestones: [
      { id: "dup", name: "DUP", afterStepId: "procedures" },
      { id: "voirie", name: "Arrete de voirie", afterStepId: "procedures" },
      { id: "reception", name: "Reception VRD", afterStepId: "mobilier" },
    ],
    steps: [
      { id: "etudes", name: "Phase 1 - Etudes et conception", durationDays: 35, role: "Etudes", risks: ["donnees concessionnaires", "interfaces parties prenantes"] },
      { id: "procedures", name: "Phase 2 - Procedures administratives", durationDays: 40, role: "Administratif", risks: ["delais instruction", "riverains"] },
      { id: "terrassements", name: "Phase 3 - Terrassements generaux", durationDays: 30, role: "Terrassement", risks: ["meteo", "sols pollues"] },
      { id: "reseaux-secs", name: "Phase 4 - Reseaux secs", durationDays: 25, role: "Reseaux secs", risks: ["raccordement", "concessionnaires"] },
      { id: "reseaux-humides", name: "Phase 5 - Reseaux humides", durationDays: 25, role: "Reseaux humides", risks: ["nappe", "essais pression"] },
      { id: "revetements", name: "Phase 6 - Revetements", durationDays: 18, role: "Voirie", risks: ["fenetre meteo", "trafic"] },
      { id: "mobilier", name: "Phase 7 - Mobilier / Signalisation", durationDays: 12, role: "Signalisation", risks: ["appro mobilier", "arretes circulation"] },
    ],
  },
  {
    id: "rehabilitation",
    name: "Rehabilitation",
    sector: "Batiment",
    description: "Diagnostic, desamiantage, mise hors eau/air, consolidation, conformite technique et renovation.",
    defaultBudget: 3_200_000,
    resourceRoles: ["Architecte", "Diagnostic", "Desamiantage", "Structure", "Lots techniques", "Renovation", "OPC"],
    milestones: [
      { id: "peril", name: "Arrete de peril leve", afterStepId: "diagnostic" },
      { id: "permis", name: "Permis rehabilitation", afterStepId: "diagnostic" },
      { id: "reception", name: "Reception rehabilitation", afterStepId: "renovation" },
    ],
    steps: [
      { id: "diagnostic", name: "Phase 1 - Diagnostic et etudes", durationDays: 25, role: "Diagnostic", risks: ["diagnostic incomplet", "amiante"] },
      { id: "desamiantage", name: "Phase 2 - Desamiantage / Deconstruction", durationDays: 30, role: "Desamiantage", risks: ["decouverte polluants", "confinement"] },
      { id: "hors-eau-air", name: "Phase 3 - Mise hors d'eau/air", durationDays: 20, role: "Structure", risks: ["infiltration", "meteo"] },
      { id: "structure", name: "Phase 4 - Structure / Consolidation", durationDays: 35, role: "Structure", risks: ["reprises structurelles", "acces"] },
      { id: "conformite", name: "Phase 5 - Mise en conformite techniques", durationDays: 35, role: "Lots techniques", risks: ["normes incendie", "accessibilite"] },
      { id: "renovation", name: "Phase 6 - Renovation", durationDays: 35, role: "Renovation", risks: ["qualite existant", "coactivite"] },
    ],
  },
  {
    id: "projet-it-digital",
    name: "Projet IT / Digital",
    sector: "Digital",
    description: "Cadrage, conception, build, integration, recette, deploiement et hypercare.",
    defaultBudget: 850_000,
    resourceRoles: ["Product owner", "Architecte", "Developpement", "QA", "Change", "Run"],
    milestones: [
      { id: "kickoff", name: "Kick-off", beforeFirstStep: true },
      { id: "go-live", name: "Go-live", afterStepId: "deploiement" },
      { id: "hypercare-fin", name: "Fin hypercare", afterStepId: "hypercare" },
    ],
    steps: [
      { id: "cadrage", name: "Phase 1 - Cadrage et backlog", durationDays: 15, role: "Product owner", risks: ["scope", "arbitrages"] },
      { id: "conception", name: "Phase 2 - Conception", durationDays: 20, role: "Architecte", risks: ["interfaces", "securite"] },
      { id: "build", name: "Phase 3 - Build", durationDays: 45, role: "Developpement", risks: ["capacite dev", "dette technique"] },
      { id: "integration", name: "Phase 4 - Integration", durationDays: 20, role: "Developpement", risks: ["environnements", "donnees"] },
      { id: "recette", name: "Phase 5 - Recette", durationDays: 20, role: "QA", risks: ["defauts bloquants", "disponibilite metier"] },
      { id: "deploiement", name: "Phase 6 - Deploiement", durationDays: 10, role: "Change", risks: ["formation", "communication"] },
      { id: "hypercare", name: "Phase 7 - Hypercare", durationDays: 10, role: "Run", risks: ["support", "stabilite"] },
    ],
  },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function nowIso() {
  return new Date().toISOString();
}

function uniqueProjectId(existingIds: Set<string>, name: string) {
  const base = slugify(name) || "projet-btp";
  let candidate = base;
  let index = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function uniqueProjectCode(existingCodes: Set<string>, template: BtpTemplateDefinition) {
  const prefix = template.sector === "Digital" ? "IT" : template.sector === "Infrastructure" ? "VRD" : "BTP";
  let index = existingCodes.size + 1;
  let candidate = `${prefix}-${String(index).padStart(3, "0")}`;
  while (existingCodes.has(candidate)) {
    index += 1;
    candidate = `${prefix}-${String(index).padStart(3, "0")}`;
  }
  return candidate;
}

function buildTask(projectId: string, task: Omit<Task, "projectId">): Task {
  return {
    ...task,
    projectId,
  };
}

function createTemplateAggregate(input: {
  workspaceId: string;
  template: BtpTemplateDefinition;
  projectId: string;
  projectCode: string;
  name: string;
  targetStartDate: string;
  ownerName: string;
  sponsorName: string;
  clientName: string;
}) {
  const createdAt = nowIso();
  const resourceByRole = new Map<string, Resource>();
  const resources = input.template.resourceRoles.map((role, index): Resource => {
    const resource: Resource = {
      id: randomUUID().slice(0, 8),
      projectId: input.projectId,
      name: role,
      role,
      type: role.match(/materiel|signalisation|voirie/i) ? "EQUIPMENT" : "TEAM",
      location: "France",
      availabilityPct: 100,
      capacityHoursPerDay: 8,
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      costRate: role.match(/Architecte|Chef|Conducteur|OPC|Product/i) ? 720 : 520,
      color: ["#1a4a20", "#56a45b", "#f4a321", "#0f766e", "#b45309", "#475569", "#dc2626", "#2563eb"][index % 8],
    };
    resourceByRole.set(role, resource);
    return resource;
  });

  const tasks: Task[] = [];
  const dependencies: Dependency[] = [];
  const stepTaskId = new Map<string, string>();

  let sortOrder = 10;
  for (const milestone of input.template.milestones.filter((item) => item.beforeFirstStep)) {
    const id = randomUUID().slice(0, 8);
    tasks.push(buildTask(input.projectId, {
      id,
      parentId: null,
      sortOrder,
      name: milestone.name,
      description: `Jalon contractuel ${milestone.name}`,
      notes: "Jalon synchronise avec le mode soutenance.",
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
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 100,
      manualStartDate: null,
      manualFinishDate: null,
      actualStartDate: null,
      actualFinishDate: null,
      actualWorkHours: 0,
      remainingWorkHours: 0,
    }));
    sortOrder += 10;
  }

  for (const [index, step] of input.template.steps.entries()) {
    const id = randomUUID().slice(0, 8);
    stepTaskId.set(step.id, id);
    tasks.push(buildTask(input.projectId, {
      id,
      parentId: null,
      sortOrder,
      name: step.name,
      description: `Template ${input.template.name}. Risques frequents: ${step.risks.join(", ")}.`,
      notes: `Risques frequents: ${step.risks.join(", ")}.`,
      type: step.type ?? "TASK",
      status: "NOT_STARTED",
      priority: index < 2 ? "HIGH" : "MEDIUM",
      progressPercent: 0,
      durationDays: step.durationDays,
      schedulingMode: index === 0 ? "MANUAL" : "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: step.durationDays * 8,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      constraintType: index === 0 ? "START_NO_EARLIER_THAN" : "ASAP",
      constraintDate: index === 0 ? input.targetStartDate : null,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: index < 2 ? 150 : 500,
      manualStartDate: index === 0 ? input.targetStartDate : null,
      manualFinishDate: null,
      actualStartDate: null,
      actualFinishDate: null,
      actualWorkHours: 0,
      remainingWorkHours: step.durationDays * 8,
    }));
    sortOrder += 10;
  }

  for (const milestone of input.template.milestones.filter((item) => !item.beforeFirstStep)) {
    const id = randomUUID().slice(0, 8);
    tasks.push(buildTask(input.projectId, {
      id,
      parentId: null,
      sortOrder,
      name: milestone.name,
      description: `Jalon contractuel ${milestone.name}`,
      notes: "Jalon marque dans les exports soutenance et le pont Cost.",
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
      constraintType: "ASAP",
      constraintDate: null,
      deadlineDate: null,
      levelingDelayDays: 0,
      levelingPriority: 100,
      manualStartDate: null,
      manualFinishDate: null,
      actualStartDate: null,
      actualFinishDate: null,
      actualWorkHours: 0,
      remainingWorkHours: 0,
    }));
    if (milestone.afterStepId) {
      const predecessorTaskId = stepTaskId.get(milestone.afterStepId);
      if (predecessorTaskId) {
        dependencies.push({
          id: randomUUID().slice(0, 8),
          projectId: input.projectId,
          predecessorProjectId: input.projectId,
          predecessorTaskId,
          successorProjectId: input.projectId,
          successorTaskId: id,
          type: "FS",
          lagDays: 0,
          label: milestone.name,
          createdAt,
        });
      }
    }
    sortOrder += 10;
  }

  const orderedStepIds = input.template.steps.map((step) => stepTaskId.get(step.id)!).filter(Boolean);
  for (let index = 1; index < orderedStepIds.length; index += 1) {
    dependencies.push({
      id: randomUUID().slice(0, 8),
      projectId: input.projectId,
      predecessorProjectId: input.projectId,
      predecessorTaskId: orderedStepIds[index - 1],
      successorProjectId: input.projectId,
      successorTaskId: orderedStepIds[index],
      type: "FS",
      lagDays: 0,
      label: "Sequence standard template",
      createdAt,
    });
  }

  const assignments = input.template.steps
    .map((step) => {
      const taskId = stepTaskId.get(step.id);
      const resourceId = resourceByRole.get(step.role)?.id;
      if (!taskId || !resourceId) {
        return null;
      }
      return {
        id: randomUUID().slice(0, 8),
        projectId: input.projectId,
        taskId,
        resourceId,
        allocationPct: 100,
        notes: `Affectation standard ${input.template.name}`,
      };
    })
    .filter(Boolean) as ProjectAggregate["assignments"];

  const aggregate: ProjectAggregate = {
    project: {
      id: input.projectId,
      workspaceId: input.workspaceId,
      slug: input.projectId,
      code: input.projectCode,
      name: input.name,
      origin: "TEMPLATE",
      sourceProjectId: null,
      clientName: input.clientName,
      description: input.template.description,
      portfolio: input.template.sector,
      ownerUserId: null,
      ownerName: input.ownerName,
      sponsorUserId: null,
      sponsorName: input.sponsorName,
      status: "PLANNING",
      health: "ON_TRACK",
      targetStartDate: input.targetStartDate,
      targetFinishDate: null,
      budgetAmount: input.template.defaultBudget,
      currencyCode: "EUR",
      levelingStrategy: "PRIORITY_THEN_SLACK",
      levelingMaxDelayDays: 30,
      archivedAt: null,
      archivedBy: null,
      createdAt,
      updatedAt: createdAt,
    },
    calendar: {
      id: `${input.projectId}-calendar`,
      name: "Calendrier BTP France",
      timezone: "Europe/Paris",
      workingDays: [1, 2, 3, 4, 5],
      hoursPerDay: 8,
      exceptions: [],
    },
    tasks,
    dependencies,
    resources,
    assignments,
    baselines: [],
    timesheetEntries: [],
    actualCostEntries: [],
  };

  const schedule = buildSchedule(aggregate);
  const baselineId = randomUUID().slice(0, 8);
  const baseline: Baseline = {
    id: baselineId,
    projectId: input.projectId,
    name: "Baseline template",
    description: `Reference initiale issue du template ${input.template.name}.`,
    capturedAt: createdAt,
    capturedBy: input.ownerName,
    isActive: true,
    snapshots: aggregate.tasks
      .filter((task) => task.type !== "SUMMARY")
      .map((task) => {
        const scheduled = schedule.tasksById[task.id];
        return {
          id: `${baselineId}-${task.id}`,
          baselineId,
          taskId: task.id,
          name: task.name,
          startDate: scheduled?.scheduledStartDate ?? null,
          finishDate: scheduled?.scheduledFinishDate ?? null,
          durationDays: task.durationDays,
          workHours: task.effortHours ?? 0,
          plannedCost: getTaskPlannedCost(scheduled ?? task, aggregate),
          progressPercent: task.progressPercent,
          isCritical: scheduled?.isCritical ?? false,
        };
      }),
  };
  aggregate.baselines = [baseline];
  aggregate.project.targetFinishDate = schedule.projectFinishDate ?? null;

  return aggregate;
}

export function listBtpTemplates() {
  return templates;
}

export async function createProjectFromBtpTemplate(input: {
  workspaceId: string;
  templateId: string;
  name?: string | null;
  targetStartDate: string;
  ownerName: string;
  sponsorName: string;
  clientName: string;
}) {
  const template = templates.find((entry) => entry.id === input.templateId);
  if (!template) {
    throw new Error("Template BTP introuvable.");
  }

  const store = await readStore();
  const existingIds = new Set(store.projects.map((entry) => entry.project.id));
  const existingCodes = new Set(store.projects.map((entry) => entry.project.code));
  const name = input.name?.trim() || template.name;
  const projectId = uniqueProjectId(existingIds, name);
  const projectCode = uniqueProjectCode(existingCodes, template);

  const aggregate = createTemplateAggregate({
    workspaceId: input.workspaceId,
    template,
    projectId,
    projectCode,
    name,
    targetStartDate: input.targetStartDate,
    ownerName: input.ownerName,
    sponsorName: input.sponsorName,
    clientName: input.clientName,
  });

  await mutateStore((draft) => {
    draft.projects.unshift(aggregate);
  });

  return projectId;
}
