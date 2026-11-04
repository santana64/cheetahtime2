import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { initialDataStore } from "@/data/demo-projects";
import type {
  AppDataStore,
  ProjectAggregate,
  StoreMetadata,
} from "@/types/planning";

const CURRENT_STORE_VERSION = 7;

export function getLocalStorePath() {
  // VERCEL=1 is set at build time — Turbopack dead-code-eliminates
  // the path.join(process.cwd()) branches entirely, preventing NFT
  // from tracing the whole project into the deployment bundle.
  if (process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return "/tmp/cheetah-time.local.json";
  }

  const configuredPath = process.env["CHEETAH_TIME_LOCAL_STORE_PATH"]?.trim();
  if (configuredPath) {
    if (path.isAbsolute(configuredPath)) return configuredPath;
    return path.join(process.cwd(), "data", path.basename(configuredPath));
  }

  return path.join(process.cwd(), "data", "cheetah-time.local.json");
}

function getLocalStoreDirectory() {
  return path.dirname(getLocalStorePath());
}

function cloneStore(data: AppDataStore): AppDataStore {
  return structuredClone(data);
}

function nowIso() {
  return new Date().toISOString();
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMetadata(metadata?: Partial<StoreMetadata>): StoreMetadata {
  const fallback = initialDataStore.metadata;

  return {
    seededFrom: metadata?.seededFrom || fallback.seededFrom,
    initializedAt: metadata?.initializedAt || fallback.initializedAt,
    lastUpdatedAt: metadata?.lastUpdatedAt || fallback.lastUpdatedAt,
  };
}

function normalizeProject(aggregate: ProjectAggregate): ProjectAggregate {
  return {
    ...aggregate,
    project: {
      ...aggregate.project,
      workspaceId: aggregate.project.workspaceId ?? "workspace-cheetah-time",
      origin: aggregate.project.origin ?? "SEEDED",
      sourceProjectId: aggregate.project.sourceProjectId ?? null,
      ownerUserId: aggregate.project.ownerUserId ?? null,
      sponsorUserId: aggregate.project.sponsorUserId ?? null,
      levelingStrategy:
        aggregate.project.levelingStrategy ?? "PRIORITY_THEN_SLACK",
      levelingMaxDelayDays:
        typeof aggregate.project.levelingMaxDelayDays === "number"
          ? aggregate.project.levelingMaxDelayDays
          : 30,
      archivedAt: aggregate.project.archivedAt ?? null,
      archivedBy: aggregate.project.archivedBy ?? null,
      declassedAt: aggregate.project.declassedAt ?? null,
      declassedBy: aggregate.project.declassedBy ?? null,
    },
    tasks: aggregate.tasks.map((task) => ({
      ...task,
      schedulingMode: task.schedulingMode ?? "AUTO",
      workFormula: task.workFormula ?? "FIXED_DURATION",
      effortHours:
        typeof task.effortHours === "number"
          ? task.effortHours
          : Math.max(task.durationDays, 0) * aggregate.calendar.hoursPerDay,
      calendarMode: task.calendarMode ?? "PROJECT",
      calendarWorkingDays: Array.isArray(task.calendarWorkingDays)
        ? task.calendarWorkingDays
        : [],
      calendarHoursPerDay:
        typeof task.calendarHoursPerDay === "number" ? task.calendarHoursPerDay : null,
      calendarExceptions: Array.isArray(task.calendarExceptions)
        ? task.calendarExceptions
        : [],
      actualWorkHours:
        typeof task.actualWorkHours === "number" ? task.actualWorkHours : 0,
      remainingWorkHours:
        typeof task.remainingWorkHours === "number"
          ? task.remainingWorkHours
          : Math.max(
              (typeof task.effortHours === "number"
                ? task.effortHours
                : Math.max(task.durationDays, 0) * aggregate.calendar.hoursPerDay) -
                (typeof task.actualWorkHours === "number" ? task.actualWorkHours : 0),
              0,
            ),
      deadlineDate: task.deadlineDate ?? null,
      levelingDelayDays:
        typeof task.levelingDelayDays === "number" ? task.levelingDelayDays : 0,
      levelingPriority:
        typeof task.levelingPriority === "number" ? task.levelingPriority : 500,
      manualStartDate: task.manualStartDate ?? null,
      manualFinishDate: task.manualFinishDate ?? null,
      actualStartDate: task.actualStartDate ?? null,
      actualFinishDate: task.actualFinishDate ?? null,
    })),
    dependencies: aggregate.dependencies.map((dependency) => ({
      ...dependency,
      predecessorProjectId:
        dependency.predecessorProjectId ?? aggregate.project.id,
      successorProjectId: dependency.successorProjectId ?? aggregate.project.id,
      createdAt: dependency.createdAt ?? aggregate.project.updatedAt ?? nowIso(),
    })),
    resources: aggregate.resources.map((resource) => ({
      ...resource,
      calendarWorkingDays: Array.isArray(resource.calendarWorkingDays)
        ? resource.calendarWorkingDays
        : [],
      calendarHoursPerDay:
        typeof resource.calendarHoursPerDay === "number"
          ? resource.calendarHoursPerDay
          : null,
      calendarExceptions: Array.isArray(resource.calendarExceptions)
        ? resource.calendarExceptions
        : [],
    })),
    baselines: aggregate.baselines.map((baseline) => ({
      ...baseline,
      snapshots: baseline.snapshots.map((snapshot) => ({
        ...snapshot,
        workHours:
          typeof snapshot.workHours === "number" ? snapshot.workHours : 0,
        plannedCost:
          typeof snapshot.plannedCost === "number" ? snapshot.plannedCost : 0,
      })),
    })),
    timesheetEntries: (aggregate.timesheetEntries ?? []).map((entry) => ({
      ...entry,
      resourceId: entry.resourceId ?? null,
      workHours: typeof entry.workHours === "number" ? entry.workHours : 0,
      costAmount:
        typeof entry.costAmount === "number" ? entry.costAmount : entry.costAmount ?? null,
      notes: entry.notes ?? "",
      createdAt: entry.createdAt ?? nowIso(),
      updatedAt: entry.updatedAt ?? entry.createdAt ?? nowIso(),
    })),
    actualCostEntries: (aggregate.actualCostEntries ?? []).map((entry) => ({
      ...entry,
      taskId: entry.taskId ?? null,
      resourceId: entry.resourceId ?? null,
      timesheetEntryId: entry.timesheetEntryId ?? null,
      source: entry.source ?? "MANUAL",
      category: entry.category ?? "OTHER",
      vendorName: entry.vendorName ?? null,
      referenceCode: entry.referenceCode ?? null,
      description: entry.description ?? "",
      quantity: typeof entry.quantity === "number" ? entry.quantity : entry.quantity ?? null,
      unitCost: typeof entry.unitCost === "number" ? entry.unitCost : entry.unitCost ?? null,
      amount: typeof entry.amount === "number" ? entry.amount : 0,
      currencyCode: entry.currencyCode ?? aggregate.project.currencyCode ?? "EUR",
      createdAt: entry.createdAt ?? nowIso(),
      updatedAt: entry.updatedAt ?? entry.createdAt ?? nowIso(),
    })),
  };
}

function normalizeStore(store?: Partial<AppDataStore> | null): AppDataStore {
  const projects = (store?.projects ?? initialDataStore.projects).map(normalizeProject);
  const metadata = normalizeMetadata(store?.metadata);

  return {
    version: CURRENT_STORE_VERSION,
    metadata,
    projects,
  };
}

async function ensureStoreExists() {
  const storeDirectory = getLocalStoreDirectory();
  const storePath = getLocalStorePath();

  await mkdir(storeDirectory, { recursive: true });

  try {
    await readFile(storePath, "utf8");
  } catch {
    // Fichier principal absent (coupure/sortie anormale ?) : tenter d'abord une
    // récupération depuis le dernier snapshot valide, sinon repartir sur la démo.
    const recovered = await tryRecoverSerialized();
    await writeFile(
      storePath,
      recovered ?? JSON.stringify(cloneStore(initialDataStore), null, 2),
      "utf8",
    );
  }
}

export async function readStore() {
  await ensureStoreExists();
  const storePath = getLocalStorePath();
  const raw = await readFile(storePath, "utf8");
  let parsed: AppDataStore;

  try {
    parsed = JSON.parse(raw) as AppDataStore;
  } catch {
    // Fichier principal corrompu (écriture interrompue par une coupure ?) :
    // restaurer automatiquement le dernier snapshot valide plutôt que de planter.
    const recovered = await tryRecoverSerialized();
    if (recovered) {
      await writeFile(storePath, recovered, "utf8");
      parsed = JSON.parse(recovered) as AppDataStore;
    } else {
      throw new Error(
        "The local runtime store could not be parsed. Remove data/cheetah-time.local.json to regenerate the demo portfolio.",
      );
    }
  }

  const normalized = normalizeStore(parsed);
  if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
    await writeStore(normalized);
  }

  return normalized;
}

export async function writeStore(data: AppDataStore) {
  await ensureStoreExists();
  const storePath = getLocalStorePath();
  const normalized = normalizeStore(data);
  const serialized = JSON.stringify(normalized, null, 2);
  const tempPath = `${storePath}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tempPath, serialized, "utf8");

  let committed = false;
  for (let attempt = 0; attempt < 5 && !committed; attempt += 1) {
    try {
      await rename(tempPath, storePath);
      committed = true;
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";
      const retryable = code === "EPERM" || code === "EACCES";
      if (!retryable || attempt === 4) {
        await writeFile(storePath, serialized, "utf8");
        await rm(tempPath, { force: true });
        committed = true;
      } else {
        await wait(40 * (attempt + 1));
      }
    }
  }

  // Sauvegarde automatique (snapshot horodaté throttlé + rotation) — best-effort,
  // ne doit jamais faire échouer l'enregistrement principal. Import dynamique pour
  // éviter le cycle local-store ↔ backup-store.
  try {
    const backup = await import("@/services/backup-store");
    await backup.maybeWriteAutoSnapshot(serialized);
  } catch {
    /* la sauvegarde échoue en silence, jamais l'écriture */
  }
}

/** Récupère le dernier snapshot valide (contenu sérialisé) ou null. */
async function tryRecoverSerialized(): Promise<string | null> {
  try {
    const backup = await import("@/services/backup-store");
    return await backup.readLatestValidSnapshot();
  } catch {
    return null;
  }
}

export async function mutateStore(
  mutate: (draft: AppDataStore) => void | Promise<void>,
) {
  const draft = cloneStore(await readStore());
  await mutate(draft);
  draft.metadata.lastUpdatedAt = nowIso();
  await writeStore(draft);
  return draft;
}
