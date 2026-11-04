"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type FormState } from "@/features/projects/form-state";
import { getErrorMessage, validationError } from "@/lib/planning/errors";
import {
  deleteProject,
  deleteAssignment,
  deleteActualCostEntry,
  deleteDependency,
  deleteResource,
  deleteTask,
  captureBaseline,
  clearProjectLeveling,
  createProject,
  createResource,
  createTask,
  deleteTimesheetEntry,
  duplicateProject,
  levelProjectResources,
  stretchProjectResources,
  levelWorkspaceResources,
  rescheduleTaskFromGantt,
  saveActualCostEntry,
  saveTimesheetEntry,
  setProjectArchived,
  setProjectDeclassed,
  setProjectB2PNote,
  setProjectB2PScenario,
  saveAssignment,
  saveDependency,
  saveTask,
  moveTask,
  setActiveBaseline,
  setResourceAvailability,
  updateResource,
  updateProjectCalendar,
  updateProjectMetadata,
  type CreateProjectStructureInput,
} from "@/services/projects";
import type {
  ActualCostCategory,
  ProjectHealth,
  ProjetPhase,
  ProjectStatus,
  ResourceType,
  TaskConstraintType,
  TaskMoveDirection,
  TaskPriority,
  TaskSchedulingMode,
  TaskStatus,
  TaskType,
  TaskWorkFormula,
} from "@/types/planning";
import { createRisk, updateRisk, deleteRisk } from "@/services/risks";
import type { RiskCategory, RiskLevel, RiskStatus } from "@/services/risks";
import { runWithCostBridgeWebhook } from "@/services/cost-bridge";
import { SPORTIF_STRUCTURE, SPORTIF_META } from "@/data/sportif-recipe";
import { addTaskComment, deleteTaskComment } from "@/services/comments";
import { recordActivity } from "@/services/activity";
import { requireCurrentSession, roleCan } from "@/services/auth";
import {
  deleteChangeRequest,
  deleteIssue,
  saveChangeRequest,
  saveIssue,
} from "@/services/controls";
import {
  addBinaryTaskAttachment,
  addTaskAttachment,
  deleteTaskAttachment,
} from "@/services/attachments";
import { createProjectFromTemplate, saveProjectAsTemplate } from "@/services/templates";
import { createProjectFromBtpTemplate } from "@/services/btp-templates";
import type {
  AttachmentKind,
  ChangeRequestImpact,
  ChangeRequestStatus,
  IssueSeverity,
  IssueStatus,
} from "@/types/planning";

function required(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Champ requis manquant : ${key}`);
  }

  return value.trim();
}

function optional(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(formData: FormData, key: string, fallback = 0) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));
}

function optionalNumberValue(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function requireProjectWriteAccess() {
  const session = await requireCurrentSession();
  if (!roleCan(session.role, "project:update") && !roleCan(session.role, "project:*")) {
    throw new Error("Droits insuffisants pour modifier le planning.");
  }
  return session;
}

async function requireProjectAdminAccess() {
  const session = await requireCurrentSession();
  if (!roleCan(session.role, "project:*")) {
    throw new Error("Droits administrateur projet requis.");
  }
  return session;
}

function parseCalendarExceptions(formData: FormData, key: string) {
  const raw = optional(formData, key);
  if (!raw) {
    return [];
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [date, label, mode = "off"] = line.split("|").map((part) => part?.trim());
      if (!date || !label) {
        throw validationError(
          `La ligne d'exception calendrier ${index + 1} doit utiliser "YYYY-MM-DD | Libelle | off|working|ouvre".`,
        );
      }

      const normalizedMode = mode.toLowerCase();
      const isWorkingDay =
        normalizedMode === "working" ||
        normalizedMode === "work" ||
        normalizedMode === "on" ||
        normalizedMode === "ouvre" ||
        normalizedMode === "ouvert" ||
        normalizedMode === "travaille";

      if (
        ![
          "off",
          "non-working",
          "nonworking",
          "holiday",
          "ferme",
          "fermeture",
          "working",
          "work",
          "on",
          "ouvre",
          "ouvert",
          "travaille",
        ].includes(normalizedMode)
      ) {
        throw validationError(
          `La ligne d'exception calendrier ${index + 1} doit se terminer par off ou working.`,
        );
      }

      return {
        date,
        label,
        isWorkingDay,
      };
    });
}

export async function createProjectAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireProjectWriteAccess();
    const projectId = await createProject({
      workspaceId: session.workspaceId,
      ownerUserId: session.userId,
      name: required(formData, "name"),
      clientName: required(formData, "clientName"),
      ownerName: required(formData, "ownerName") || session.name,
      sponsorName: required(formData, "sponsorName"),
      portfolio: required(formData, "portfolio"),
      targetStartDate: required(formData, "targetStartDate"),
      targetFinishDate: optional(formData, "targetFinishDate"),
      budgetAmount: numberValue(formData, "budgetAmount"),
      currencyCode: required(formData, "currencyCode"),
    });

    revalidatePath("/projects");
    redirect(`/projects/${projectId}/dashboard`);
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible de creer le projet."),
    };
  }
}

export async function createGuidedProjectAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireProjectWriteAccess();

    let lots: { name: string; budgetAmount: number }[] = [];
    let b2pDates: string[] = [];
    let structure: CreateProjectStructureInput | undefined;
    try {
      const rawLots = optional(formData, "lots");
      if (rawLots) {
        lots = (JSON.parse(rawLots) as { name?: string; budgetAmount?: number }[])
          .map((lot) => ({
            name: String(lot.name ?? "").trim(),
            budgetAmount: Number(lot.budgetAmount) || 0,
          }))
          .filter((lot) => lot.name || lot.budgetAmount);
      }
      const rawDates = optional(formData, "b2pDates");
      if (rawDates) {
        b2pDates = (JSON.parse(rawDates) as string[]).filter((d) =>
          /^\d{4}-\d{2}-\d{2}$/.test(d),
        );
      }
      const rawStructure = optional(formData, "structure");
      if (rawStructure) {
        const parsed = JSON.parse(rawStructure) as CreateProjectStructureInput;
        if (parsed && Array.isArray(parsed.lots) && parsed.lots.length) {
          structure = {
            timeUnit: parsed.timeUnit ?? "jours",
            resources: Array.isArray(parsed.resources) ? parsed.resources : [],
            lots: parsed.lots,
            hammocks: Array.isArray(parsed.hammocks) ? parsed.hammocks : [],
            jalons: Array.isArray(parsed.jalons) ? parsed.jalons.slice(0, 9) : [],
          };
        }
      }
    } catch {
      return { status: "error", message: "Données de lots/B2P invalides." };
    }

    const phaseRaw = optional(formData, "phase");

    const projectId = await createProject({
      workspaceId: session.workspaceId,
      ownerUserId: session.userId,
      name: required(formData, "name"),
      clientName: optional(formData, "clientName") || "Client",
      ownerName: optional(formData, "ownerName") || session.name,
      sponsorName: optional(formData, "sponsorName") || "Maître d'ouvrage",
      portfolio: optional(formData, "portfolio") || "Opérations",
      targetStartDate: required(formData, "targetStartDate"),
      targetFinishDate: optional(formData, "targetFinishDate"),
      budgetAmount: 0,
      currencyCode: optional(formData, "currencyCode") || "EUR",
      phase: (phaseRaw as ProjetPhase) || null,
      b2pDates,
      lots,
      structure,
    });

    revalidatePath("/projects");
    // Après création : on ouvre directement le PLANNING du projet (demande François).
    redirect(`/projects/${projectId}/planning`);
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible de créer le projet."),
    };
  }
}

/** Crée le projet de recette « Cas complexe sportif » (corrigé FGF, données figées). */
export async function createSportifRecipeAction(): Promise<void> {
  const session = await requireProjectWriteAccess();
  const projectId = await createProject({
    workspaceId: session.workspaceId,
    ownerUserId: session.userId,
    name: SPORTIF_META.name,
    clientName: SPORTIF_META.clientName,
    ownerName: session.name,
    sponsorName: "Maître d'ouvrage",
    portfolio: "Recette",
    targetStartDate: SPORTIF_META.targetStartDate,
    targetFinishDate: SPORTIF_META.targetFinishDate,
    budgetAmount: 0,
    currencyCode: "EUR",
    phase: SPORTIF_META.phase,
    b2pDates: [],
    lots: [],
    structure: SPORTIF_STRUCTURE,
  });
  revalidatePath("/projects");
  redirect(`/projects/${projectId}/dashboard`);
}

export async function saveB2PNoteAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    await setProjectB2PNote({
      projectId,
      date: required(formData, "date"),
      note: optional(formData, "note") ?? "",
    });
    revalidatePath(`/projects/${projectId}/b2p`);
    revalidatePath(`/projects/${projectId}/dashboard`);
    return { status: "success", message: "Note de bilan enregistrée." };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible d'enregistrer la note."),
    };
  }
}

export async function saveB2PScenarioAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    await setProjectB2PScenario({
      projectId,
      date: required(formData, "date"),
      scenario: optional(formData, "scenario") ?? "",
    });
    revalidatePath(`/projects/${projectId}/b2p`);
    return { status: "success", message: "Scénarios correctifs enregistrés." };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible d'enregistrer les scénarios."),
    };
  }
}

export async function updateProjectMetadataAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    await updateProjectMetadata({
      projectId,
      name: required(formData, "name"),
      clientName: required(formData, "clientName"),
      ownerName: required(formData, "ownerName"),
      sponsorName: required(formData, "sponsorName"),
      portfolio: required(formData, "portfolio"),
      description: required(formData, "description"),
      status: required(formData, "status") as ProjectStatus,
      health: required(formData, "health") as ProjectHealth,
      targetStartDate: required(formData, "targetStartDate"),
      targetFinishDate: optional(formData, "targetFinishDate"),
      budgetAmount: numberValue(formData, "budgetAmount"),
      currencyCode: required(formData, "currencyCode"),
    });

    revalidatePath(`/projects/${projectId}/dashboard`);
    revalidatePath(`/projects/${projectId}/planning`);
    revalidatePath(`/projects/${projectId}/activity`);
    revalidatePath("/projects");

    return {
      status: "success",
      message: "Metadonnees du projet mises a jour.",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible de mettre a jour le projet."),
    };
  }
}

export async function updateProjectCalendarAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    await runWithCostBridgeWebhook(projectId, { kind: "calendar.update" }, () =>
      updateProjectCalendar({
        projectId,
        name: required(formData, "calendarName"),
        timezone: required(formData, "timezone"),
        workingDays: integerList(formData, "workingDays"),
        hoursPerDay: numberValue(formData, "hoursPerDay", 8),
        levelingStrategy: (optional(formData, "levelingStrategy") ??
          "PRIORITY_THEN_SLACK") as
          | "PRIORITY_THEN_SLACK"
          | "SLACK_THEN_PRIORITY"
          | "MIN_DELAY",
        levelingMaxDelayDays: numberValue(formData, "levelingMaxDelayDays", 30),
        exceptions: parseCalendarExceptions(formData, "exceptions"),
      }),
    );

    revalidatePath(`/projects/${projectId}/dashboard`);
    revalidatePath(`/projects/${projectId}/planning`);
    revalidatePath(`/projects/${projectId}/resources`);
    revalidatePath(`/projects/${projectId}/baselines`);

    return {
      status: "success",
      message: "Calendrier projet mis a jour.",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible de mettre a jour le calendrier projet."),
    };
  }
}

export async function levelProjectResourcesAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await runWithCostBridgeWebhook(projectId, { kind: "leveling.apply" }, () =>
    levelProjectResources(projectId),
  );

  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
  revalidatePath(`/projects/${projectId}/baselines`);
}

/** Nivellement par allongement : durée ×F, intensité ÷F (charge constante). */
export async function stretchProjectResourcesAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await runWithCostBridgeWebhook(projectId, { kind: "leveling.apply" }, () =>
    stretchProjectResources(projectId),
  );

  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
  revalidatePath(`/projects/${projectId}/baselines`);
}

export async function levelWorkspaceResourcesAction() {
  const session = await requireProjectWriteAccess();
  await levelWorkspaceResources(session.workspaceId);
  revalidatePath("/projects");
}

export async function clearProjectLevelingAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await runWithCostBridgeWebhook(projectId, { kind: "leveling.clear" }, () =>
    clearProjectLeveling(projectId),
  );

  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
  revalidatePath(`/projects/${projectId}/baselines`);
}

export async function duplicateProjectAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    const duplicatedProjectId = await duplicateProject({
      projectId,
      name: optional(formData, "duplicateName") ?? undefined,
      duplicatedBy: required(formData, "duplicatedBy"),
    });

    revalidatePath("/projects");
    redirect(`/projects/${duplicatedProjectId}/dashboard`);
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible de dupliquer le projet."),
    };
  }
}

export async function setProjectArchiveStateAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectAdminAccess();
    const projectId = required(formData, "projectId");
    const archived = required(formData, "archived") === "true";
    await setProjectArchived(projectId, archived, required(formData, "actor"));

    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}/dashboard`);
    revalidatePath(`/projects/${projectId}/planning`);
    revalidatePath(`/projects/${projectId}/resources`);
    revalidatePath(`/projects/${projectId}/baselines`);

    return {
      status: "success",
      message: archived ? "Projet archive." : "Projet restaure dans le portefeuille actif.",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible de mettre a jour le cycle de vie du projet."),
    };
  }
}

/** Déclasser / reclasser un projet (bouton direct sur la liste — spec François). */
export async function setProjectDeclassedAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  const declassed = required(formData, "declassed") === "true";
  await setProjectDeclassed(projectId, declassed, optional(formData, "actor") || "Cheetah Time");

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}/dashboard`);
}

export async function deleteProjectAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectAdminAccess();
    const projectId = required(formData, "projectId");
    await deleteProject(projectId, required(formData, "confirmationName"));

    revalidatePath("/projects");
    redirect("/projects");
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible de supprimer le projet."),
    };
  }
}

export async function saveTaskAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    const taskId = required(formData, "taskId");
    await runWithCostBridgeWebhook(projectId, { kind: "task.update", taskId }, () =>
      saveTask({
        projectId,
        taskId,
        name: required(formData, "name"),
        description: optional(formData, "description") ?? "",
        notes: optional(formData, "notes") ?? "",
        parentId: optional(formData, "parentId"),
        sortOrder: numberValue(formData, "sortOrder", 10),
        type: required(formData, "type") as TaskType,
        status: required(formData, "status") as TaskStatus,
        priority: required(formData, "priority") as TaskPriority,
        progressPercent: numberValue(formData, "progressPercent", 0),
        durationDays: numberValue(formData, "durationDays", 1),
        schedulingMode: required(formData, "schedulingMode") as TaskSchedulingMode,
        workFormula: required(formData, "workFormula") as TaskWorkFormula,
        effortHours: optionalNumberValue(formData, "effortHours"),
        calendarMode: (optional(formData, "calendarMode") ?? "PROJECT") as
          | "PROJECT"
          | "CUSTOM",
        calendarWorkingDays: integerList(formData, "taskCalendarWorkingDays"),
        calendarHoursPerDay: optionalNumberValue(
          formData,
          "taskCalendarHoursPerDay",
        ),
        calendarExceptions: parseCalendarExceptions(
          formData,
          "taskCalendarExceptions",
        ),
        levelingPriority: numberValue(formData, "levelingPriority", 500),
        constraintType: required(formData, "constraintType") as TaskConstraintType,
        constraintDate: optional(formData, "constraintDate"),
        deadlineDate: optional(formData, "deadlineDate"),
        manualStartDate: optional(formData, "manualStartDate"),
        manualFinishDate: optional(formData, "manualFinishDate"),
        actualStartDate: optional(formData, "actualStartDate"),
        actualFinishDate: optional(formData, "actualFinishDate"),
        actualWorkHours: optionalNumberValue(formData, "actualWorkHours"),
        remainingWorkHours: optionalNumberValue(formData, "remainingWorkHours"),
      }),
    );

    revalidatePath(`/projects/${projectId}/planning`);
    revalidatePath(`/projects/${projectId}/dashboard`);
    revalidatePath(`/projects/${projectId}/resources`);
    revalidatePath(`/projects/${projectId}/baselines`);

    return {
      status: "success",
      message: "Tache mise a jour.",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible d'enregistrer la tache."),
    };
  }
}

export async function createTaskAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  const eventHint = { kind: "task.create" as const, taskId: null as string | null };
  await runWithCostBridgeWebhook(projectId, eventHint, async () => {
    const taskId = await createTask({
      projectId,
      parentId: optional(formData, "parentId"),
      name: optional(formData, "name") ?? "Nouvelle tache",
      type: (optional(formData, "type") as TaskType | null) ?? "TASK",
    });
    eventHint.taskId = taskId;
    return taskId;
  });

  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
}

export async function moveTaskAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    const taskId = required(formData, "taskId");
    await runWithCostBridgeWebhook(projectId, { kind: "task.move", taskId }, () =>
      moveTask({
        projectId,
        taskId,
        direction: required(formData, "direction") as TaskMoveDirection,
      }),
    );

    revalidatePath(`/projects/${projectId}/planning`);
    revalidatePath(`/projects/${projectId}/dashboard`);
    revalidatePath(`/projects/${projectId}/resources`);
    revalidatePath(`/projects/${projectId}/baselines`);

    return {
      status: "success",
      message: "Plan de tache mis a jour.",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible de deplacer la tache."),
    };
  }
}

export async function rescheduleTaskFromGanttAction(
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    const taskId = required(formData, "taskId");
    await runWithCostBridgeWebhook(projectId, { kind: "task.reschedule", taskId }, () =>
      rescheduleTaskFromGantt({
        projectId,
        taskId,
        startDate: required(formData, "startDate"),
        finishDate: required(formData, "finishDate"),
      }),
    );

    revalidatePath(`/projects/${projectId}/planning`);
    revalidatePath(`/projects/${projectId}/dashboard`);
    revalidatePath(`/projects/${projectId}/resources`);
    revalidatePath(`/projects/${projectId}/baselines`);

    return {
      status: "success",
      message: "Dates Gantt appliquees en planification manuelle.",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible d'appliquer le changement Gantt."),
    };
  }
}

export async function deleteTaskAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  const taskId = required(formData, "taskId");
  await runWithCostBridgeWebhook(projectId, { kind: "task.delete", taskId }, () =>
    deleteTask(projectId, taskId),
  );

  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/baselines`);
}

export async function saveDependencyAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    const successorTaskId = required(formData, "successorTaskId");
    await runWithCostBridgeWebhook(projectId, { kind: "dependency.create", taskId: successorTaskId }, () =>
      saveDependency({
        projectId,
        predecessorProjectId: optional(formData, "predecessorProjectId") ?? undefined,
        predecessorTaskId: required(formData, "predecessorTaskId"),
        successorProjectId: optional(formData, "successorProjectId") ?? undefined,
        successorTaskId,
        type: required(formData, "type") as "FS" | "SS" | "FF" | "SF",
        lagDays: numberValue(formData, "lagDays", 0),
      }),
    );

    revalidatePath(`/projects/${projectId}/planning`);
    revalidatePath(`/projects/${projectId}/dashboard`);

    return {
      status: "success",
      message: "Dependance enregistree.",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible d'enregistrer la dependance."),
    };
  }
}

export async function deleteDependencyAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await runWithCostBridgeWebhook(projectId, { kind: "dependency.delete" }, () =>
    deleteDependency(projectId, required(formData, "dependencyId")),
  );

  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
}

export async function captureBaselineAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await runWithCostBridgeWebhook(
    projectId,
    { kind: "baseline.capture" },
    () =>
      captureBaseline(
        projectId,
        required(formData, "baselineName"),
        required(formData, "capturedBy"),
      ),
  );

  revalidatePath(`/projects/${projectId}/baselines`);
  revalidatePath(`/projects/${projectId}/dashboard`);
  revalidatePath(`/projects/${projectId}/planning`);
}

export async function activateBaselineAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  const baselineId = required(formData, "baselineId");
  await runWithCostBridgeWebhook(projectId, { kind: "baseline.activate", baselineId }, () =>
    setActiveBaseline(projectId, baselineId),
  );

  revalidatePath(`/projects/${projectId}/baselines`);
  revalidatePath(`/projects/${projectId}/dashboard`);
  revalidatePath(`/projects/${projectId}/planning`);
}

export async function createResourceAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    const eventHint = { kind: "resource.create" as const, resourceId: null as string | null };
    await runWithCostBridgeWebhook(projectId, eventHint, async () => {
      const resourceId = await createResource({
        projectId,
        name: required(formData, "name"),
        role: required(formData, "role"),
        type: required(formData, "type") as ResourceType,
        location: optional(formData, "location") ?? "Non affecte",
        availabilityPct: numberValue(formData, "availabilityPct", 100),
        capacityHoursPerDay: numberValue(formData, "capacityHoursPerDay", 8),
        calendarWorkingDays: integerList(formData, "resourceCalendarWorkingDays"),
        calendarHoursPerDay: optionalNumberValue(
          formData,
          "resourceCalendarHoursPerDay",
        ),
        calendarExceptions: parseCalendarExceptions(
          formData,
          "resourceCalendarExceptions",
        ),
        costRate: optional(formData, "costRate")
          ? numberValue(formData, "costRate")
          : null,
        color: optional(formData, "color"),
      });
      eventHint.resourceId = resourceId;
      return resourceId;
    });

    revalidatePath(`/projects/${projectId}/resources`);
    revalidatePath(`/projects/${projectId}/planning`);
    revalidatePath(`/projects/${projectId}/dashboard`);

    return {
      status: "success",
      message: "Ressource ajoutee.",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible de creer la ressource."),
    };
  }
}

export async function updateResourceDirectAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  const resourceId = required(formData, "resourceId");
  await runWithCostBridgeWebhook(projectId, { kind: "resource.update", resourceId }, () =>
    updateResource({
      projectId,
      resourceId,
      name: required(formData, "name"),
      role: required(formData, "role"),
      type: required(formData, "type") as ResourceType,
      location: optional(formData, "location") ?? "Non affecte",
      availabilityPct: numberValue(formData, "availabilityPct", 100),
      capacityHoursPerDay: numberValue(formData, "capacityHoursPerDay", 8),
      calendarWorkingDays: integerList(formData, "resourceCalendarWorkingDays"),
      calendarHoursPerDay: optionalNumberValue(
        formData,
        "resourceCalendarHoursPerDay",
      ),
      calendarExceptions: parseCalendarExceptions(
        formData,
        "resourceCalendarExceptions",
      ),
      costRate: optional(formData, "costRate")
        ? numberValue(formData, "costRate")
        : null,
      color: optional(formData, "color"),
    }),
  );

  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
}

/** Calendrier de disponibilité d'une ressource (intensité par mois) — demande François 23/08. */
export async function setResourceAvailabilityAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  const resourceId = required(formData, "resourceId");
  let availabilityByMonth: Record<string, number> = {};
  try {
    const parsed = JSON.parse(optional(formData, "availability") ?? "{}");
    if (parsed && typeof parsed === "object") availabilityByMonth = parsed as Record<string, number>;
  } catch {
    /* JSON invalide : disponibilité vide (= pleine dispo) */
  }
  await setResourceAvailability({ projectId, resourceId, availabilityByMonth });

  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
}

export async function deleteResourceAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  const resourceId = required(formData, "resourceId");
  await runWithCostBridgeWebhook(projectId, { kind: "resource.delete", resourceId }, () =>
    deleteResource(projectId, resourceId),
  );

  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
}

export async function saveAssignmentAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    const taskId = required(formData, "taskId");
    const resourceId = required(formData, "resourceId");
    await runWithCostBridgeWebhook(projectId, { kind: "assignment.save", taskId, resourceId }, () =>
      saveAssignment({
        projectId,
        taskId,
        resourceId,
        allocationPct: numberValue(formData, "allocationPct", 100),
        notes: optional(formData, "notes") ?? undefined,
      }),
    );

    revalidatePath(`/projects/${projectId}/resources`);
    revalidatePath(`/projects/${projectId}/planning`);
    revalidatePath(`/projects/${projectId}/dashboard`);

    return {
      status: "success",
      message: "Affectation enregistree.",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible d'enregistrer l'affectation."),
    };
  }
}

export async function saveAssignmentDirectAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  const taskId = required(formData, "taskId");
  const resourceId = required(formData, "resourceId");
  await runWithCostBridgeWebhook(projectId, { kind: "assignment.save", taskId, resourceId }, () =>
    saveAssignment({
      projectId,
      taskId,
      resourceId,
      allocationPct: numberValue(formData, "allocationPct", 100),
      notes: optional(formData, "notes") ?? undefined,
    }),
  );

  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
}

export async function deleteAssignmentAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await runWithCostBridgeWebhook(projectId, { kind: "assignment.delete" }, () =>
    deleteAssignment(projectId, required(formData, "assignmentId")),
  );

  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
}

export async function saveTimesheetEntryAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    await saveTimesheetEntry({
      projectId,
      entryId: optional(formData, "entryId") ?? undefined,
      taskId: required(formData, "taskId"),
      resourceId: optional(formData, "resourceId"),
      entryDate: required(formData, "entryDate"),
      workHours: numberValue(formData, "workHours", 0),
      costAmount: optional(formData, "costAmount")
        ? numberValue(formData, "costAmount")
        : null,
      notes: optional(formData, "notes") ?? "",
    });

    revalidatePath(`/projects/${projectId}/resources`);
    revalidatePath(`/projects/${projectId}/planning`);
    revalidatePath(`/projects/${projectId}/dashboard`);
    revalidatePath(`/projects/${projectId}/baselines`);

    return {
      status: "success",
      message: "Imputation enregistree.",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible d'enregistrer l'imputation."),
    };
  }
}

export async function deleteTimesheetEntryAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await deleteTimesheetEntry(projectId, required(formData, "entryId"));

  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
  revalidatePath(`/projects/${projectId}/baselines`);
}

export async function saveTimesheetEntryDirectAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await saveTimesheetEntry({
    projectId,
    entryId: optional(formData, "entryId") ?? undefined,
    taskId: required(formData, "taskId"),
    resourceId: optional(formData, "resourceId"),
    entryDate: required(formData, "entryDate"),
    workHours: numberValue(formData, "workHours", 0),
    costAmount: optional(formData, "costAmount")
      ? numberValue(formData, "costAmount")
      : null,
    notes: optional(formData, "notes") ?? "",
  });

  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/dashboard`);
  revalidatePath(`/projects/${projectId}/baselines`);
}

export async function saveActualCostEntryAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    await saveActualCostEntry({
      projectId,
      entryId: optional(formData, "entryId") ?? undefined,
      taskId: optional(formData, "taskId"),
      resourceId: optional(formData, "resourceId"),
      entryDate: required(formData, "entryDate"),
      category: required(formData, "category") as ActualCostCategory,
      vendorName: optional(formData, "vendorName"),
      referenceCode: optional(formData, "referenceCode"),
      description: optional(formData, "description"),
      quantity: optionalNumberValue(formData, "quantity"),
      unitCost: optionalNumberValue(formData, "unitCost"),
      amount: optionalNumberValue(formData, "amount"),
      currencyCode: optional(formData, "currencyCode"),
    });

    revalidatePath(`/projects/${projectId}/dashboard`);
    revalidatePath(`/projects/${projectId}/resources`);
    revalidatePath(`/projects/${projectId}/baselines`);

    return {
      status: "success",
      message: "Cout reel enregistre.",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Impossible d'enregistrer le cout reel."),
    };
  }
}

export async function saveActualCostEntryDirectAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await saveActualCostEntry({
    projectId,
    entryId: optional(formData, "entryId") ?? undefined,
    taskId: optional(formData, "taskId"),
    resourceId: optional(formData, "resourceId"),
    entryDate: required(formData, "entryDate"),
    category: required(formData, "category") as ActualCostCategory,
    vendorName: optional(formData, "vendorName"),
    referenceCode: optional(formData, "referenceCode"),
    description: optional(formData, "description"),
    quantity: optionalNumberValue(formData, "quantity"),
    unitCost: optionalNumberValue(formData, "unitCost"),
    amount: optionalNumberValue(formData, "amount"),
    currencyCode: optional(formData, "currencyCode"),
  });

  revalidatePath(`/projects/${projectId}/dashboard`);
  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/baselines`);
}

export async function deleteActualCostEntryAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await deleteActualCostEntry(projectId, required(formData, "entryId"));

  revalidatePath(`/projects/${projectId}/dashboard`);
  revalidatePath(`/projects/${projectId}/resources`);
  revalidatePath(`/projects/${projectId}/baselines`);
}

// --- RISK ACTIONS ---

export async function createRiskAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    await createRisk({
      projectId,
      title: required(formData, "title"),
      description: optional(formData, "description") ?? "",
      category: (optional(formData, "category") ?? "TECHNICAL") as RiskCategory,
      probability: (optional(formData, "probability") ?? "MEDIUM") as RiskLevel,
      impact: (optional(formData, "impact") ?? "MEDIUM") as RiskLevel,
      ownerName: optional(formData, "ownerName") ?? "",
      mitigation: optional(formData, "mitigation") ?? "",
      contingency: optional(formData, "contingency") ?? "",
      identifiedDate: optional(formData, "identifiedDate") ?? new Date().toISOString().slice(0, 10),
      targetDate: optional(formData, "targetDate") ?? undefined,
    });

    revalidatePath(`/projects/${projectId}/risks`);
    revalidatePath(`/projects/${projectId}/dashboard`);

    return { status: "success", message: "Risque créé." };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible de créer le risque.") };
  }
}

export async function updateRiskAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    const riskId = required(formData, "riskId");
    await updateRisk({
      id: riskId,
      projectId,
      title: optional(formData, "title") ?? undefined,
      description: optional(formData, "description") ?? undefined,
      category: (optional(formData, "category") as RiskCategory | null) ?? undefined,
      probability: (optional(formData, "probability") as RiskLevel | null) ?? undefined,
      impact: (optional(formData, "impact") as RiskLevel | null) ?? undefined,
      status: (optional(formData, "status") as RiskStatus | null) ?? undefined,
      ownerName: optional(formData, "ownerName") ?? undefined,
      mitigation: optional(formData, "mitigation") ?? undefined,
      contingency: optional(formData, "contingency") ?? undefined,
      targetDate: optional(formData, "targetDate"),
      closedDate: optional(formData, "closedDate"),
    });

    revalidatePath(`/projects/${projectId}/risks`);
    revalidatePath(`/projects/${projectId}/dashboard`);

    return { status: "success", message: "Risque mis à jour." };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible de mettre à jour le risque.") };
  }
}

export async function deleteRiskAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await deleteRisk(required(formData, "riskId"), projectId);
  revalidatePath(`/projects/${projectId}/risks`);
  revalidatePath(`/projects/${projectId}/dashboard`);
}

// --- COMMENT ACTIONS ---

export async function addTaskCommentAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    const taskId = required(formData, "taskId");
    await addTaskComment({
      projectId,
      taskId,
      workspaceId: session.workspaceId,
      authorUserId: session.userId,
      authorName: optional(formData, "authorName") ?? session.name,
      content: required(formData, "content"),
    });

    revalidatePath(`/projects/${projectId}/planning`);

    return { status: "success", message: "Commentaire ajouté." };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible d'ajouter le commentaire.") };
  }
}

export async function deleteTaskCommentAction(formData: FormData) {
  await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  const taskId = required(formData, "taskId");
  await deleteTaskComment(required(formData, "commentId"), taskId);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/activity`);
}

// --- ATTACHMENT ACTIONS ---

export async function addTaskAttachmentAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    const taskId = required(formData, "taskId");
    const uploadedFile = formData.get("file");

    if (uploadedFile instanceof File && uploadedFile.size > 0) {
      await addBinaryTaskAttachment({
        projectId,
        taskId,
        uploadedByUserId: session.userId,
        uploadedByName: session.name,
        fileName: optional(formData, "fileName") ?? uploadedFile.name,
        mimeType: uploadedFile.type || "application/octet-stream",
        content: Buffer.from(await uploadedFile.arrayBuffer()),
        description: optional(formData, "description") ?? "",
      });
    } else {
      await addTaskAttachment({
        projectId,
        taskId,
        uploadedByUserId: session.userId,
        uploadedByName: session.name,
        kind: (optional(formData, "kind") ?? "LINK") as AttachmentKind,
        fileName: required(formData, "fileName"),
        url: required(formData, "url"),
        mimeType: optional(formData, "mimeType"),
        sizeBytes: optionalNumberValue(formData, "sizeBytes"),
        description: optional(formData, "description") ?? "",
      });
    }

    revalidatePath(`/projects/${projectId}/activity`);
    revalidatePath(`/projects/${projectId}/planning`);
    return { status: "success", message: "Piece jointe ajoutee." };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible d'ajouter la piece jointe.") };
  }
}

export async function deleteTaskAttachmentAction(formData: FormData) {
  const session = await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  const taskId = required(formData, "taskId");
  await deleteTaskAttachment({
    projectId,
    taskId,
    attachmentId: required(formData, "attachmentId"),
    actorName: session.name,
    actorUserId: session.userId,
  });
  revalidatePath(`/projects/${projectId}/activity`);
  revalidatePath(`/projects/${projectId}/planning`);
}

// --- ISSUE AND CHANGE CONTROL ACTIONS ---

export async function saveIssueAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    await saveIssue({
      id: optional(formData, "issueId"),
      projectId,
      taskId: optional(formData, "taskId"),
      assigneeUserId: optional(formData, "assigneeUserId"),
      title: required(formData, "title"),
      description: optional(formData, "description") ?? "",
      severity: (optional(formData, "severity") ?? "MEDIUM") as IssueSeverity,
      status: (optional(formData, "status") ?? "OPEN") as IssueStatus,
      ownerName: optional(formData, "ownerName") ?? session.name,
      dueDate: optional(formData, "dueDate"),
      actorName: session.name,
      actorUserId: session.userId,
    });
    revalidatePath(`/projects/${projectId}/risks`);
    revalidatePath(`/projects/${projectId}/activity`);
    revalidatePath(`/projects/${projectId}/dashboard`);
    return { status: "success", message: "Incident enregistre." };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible d'enregistrer l'incident.") };
  }
}

export async function deleteIssueAction(formData: FormData) {
  const session = await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await deleteIssue({
    projectId,
    issueId: required(formData, "issueId"),
    actorName: session.name,
    actorUserId: session.userId,
  });
  revalidatePath(`/projects/${projectId}/risks`);
  revalidatePath(`/projects/${projectId}/activity`);
  revalidatePath(`/projects/${projectId}/dashboard`);
}

export async function saveChangeRequestAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireProjectWriteAccess();
    const projectId = required(formData, "projectId");
    await saveChangeRequest({
      id: optional(formData, "changeRequestId"),
      projectId,
      taskId: optional(formData, "taskId"),
      requesterUserId: session.userId,
      approverUserId: optional(formData, "approverUserId"),
      title: required(formData, "title"),
      description: optional(formData, "description") ?? "",
      status: (optional(formData, "status") ?? "DRAFT") as ChangeRequestStatus,
      scheduleImpactDays: numberValue(formData, "scheduleImpactDays", 0),
      costImpactAmount: numberValue(formData, "costImpactAmount", 0),
      impactLevel: (optional(formData, "impactLevel") ?? "MEDIUM") as ChangeRequestImpact,
      decisionNotes: optional(formData, "decisionNotes") ?? "",
      actorName: session.name,
      actorUserId: session.userId,
    });
    revalidatePath(`/projects/${projectId}/risks`);
    revalidatePath(`/projects/${projectId}/activity`);
    revalidatePath(`/projects/${projectId}/dashboard`);
    return { status: "success", message: "Demande de changement enregistree." };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible d'enregistrer la demande de changement.") };
  }
}

export async function deleteChangeRequestAction(formData: FormData) {
  const session = await requireProjectWriteAccess();
  const projectId = required(formData, "projectId");
  await deleteChangeRequest({
    projectId,
    changeRequestId: required(formData, "changeRequestId"),
    actorName: session.name,
    actorUserId: session.userId,
  });
  revalidatePath(`/projects/${projectId}/risks`);
  revalidatePath(`/projects/${projectId}/activity`);
  revalidatePath(`/projects/${projectId}/dashboard`);
}

// --- TEMPLATE ACTIONS ---

export async function saveProjectTemplateAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireProjectAdminAccess();
    const projectId = required(formData, "projectId");
    await saveProjectAsTemplate({
      workspaceId: session.workspaceId,
      projectId,
      name: required(formData, "templateName"),
      description: optional(formData, "templateDescription") ?? "",
      createdByUserId: session.userId,
    });
    revalidatePath("/settings");
    revalidatePath(`/projects/${projectId}/settings`);
    return { status: "success", message: "Modele projet enregistre." };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible d'enregistrer le modele.") };
  }
}

export async function createProjectFromTemplateAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  let projectId = "";
  try {
    const session = await requireProjectWriteAccess();
    projectId = await createProjectFromTemplate({
      workspaceId: session.workspaceId,
      templateId: required(formData, "templateId"),
      name: optional(formData, "projectName"),
      actorName: session.name,
    });
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible de creer le projet depuis le modele.") };
  }

  revalidatePath("/projects");
  redirect(`/projects/${projectId}/dashboard`);
}

export async function createProjectFromBtpTemplateAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  let projectId = "";
  try {
    const session = await requireProjectWriteAccess();
    projectId = await createProjectFromBtpTemplate({
      workspaceId: session.workspaceId,
      templateId: required(formData, "templateId"),
      name: optional(formData, "projectName"),
      targetStartDate: required(formData, "targetStartDate"),
      ownerName: optional(formData, "ownerName") ?? session.name,
      sponsorName: optional(formData, "sponsorName") ?? session.name,
      clientName: optional(formData, "clientName") ?? "Client BTP",
    });
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible de creer le projet BTP.") };
  }

  revalidatePath("/projects");
  redirect(`/projects/${projectId}/dashboard`);
}

// --- ACTIVITY ACTIONS ---

export async function recordActivityAction(formData: FormData) {
  await requireProjectWriteAccess();
  await recordActivity({
    projectId: required(formData, "projectId"),
    actorUserId: null,
    actorName: optional(formData, "actorName") ?? "Système",
    action: required(formData, "action"),
    entityType: required(formData, "entityType"),
    entityId: optional(formData, "entityId"),
    entityName: optional(formData, "entityName"),
    fieldName: optional(formData, "fieldName"),
    oldValue: optional(formData, "oldValue"),
    newValue: optional(formData, "newValue"),
  });
}
