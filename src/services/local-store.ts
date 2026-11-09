import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
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
    return path.join(/* turbopackIgnore: true */ process.cwd(), "data", path.basename(configuredPath));
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), "data", "cheetah-time.local.json");
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

  await mkdir(/* turbopackIgnore: true */ storeDirectory, { recursive: true });

  try {
    await readFile(/* turbopackIgnore: true */ storePath, "utf8");
  } catch {
    // Fichier principal absent (coupure/sortie anormale ?) : tenter d'abord une
    // récupération depuis le dernier snapshot valide, sinon repartir sur la démo.
    const recovered = await tryRecoverSerialized();
    await writeFile(/* turbopackIgnore: true */ 
      storePath,
      recovered ?? JSON.stringify(cloneStore(initialDataStore), null, 2),
      "utf8",
    );
  }
}

// Cache de lecture : le fichier n'est re-parsé que s'il a changé (mtime/taille).
// Un planning de plusieurs milliers de LT n'est plus re-lu à chaque requête.
let readCache: { path: string; mtimeMs: number; size: number; store: AppDataStore } | null = null;

export async function readStore() {
  await ensureStoreExists();
  const storePath = getLocalStorePath();
  const info = await stat(/* turbopackIgnore: true */ storePath).catch(() => null);
  if (
    info &&
    readCache &&
    readCache.path === storePath &&
    readCache.mtimeMs === info.mtimeMs &&
    readCache.size === info.size
  ) {
    return readCache.store;
  }
  const raw = await readFile(/* turbopackIgnore: true */ storePath, "utf8");
  let parsed: AppDataStore;

  try {
    parsed = JSON.parse(raw) as AppDataStore;
  } catch {
    // Fichier principal corrompu (écriture interrompue par une coupure ?) :
    // restaurer automatiquement le dernier snapshot valide de CE store.
    const recovered = await tryRecoverSerialized();
    if (recovered) {
      await writeFile(/* turbopackIgnore: true */ storePath, recovered, "utf8");
      parsed = JSON.parse(recovered) as AppDataStore;
    } else {
      throw new Error(
        "Le fichier de données local est illisible et aucune sauvegarde valide n'a été trouvée. Restaurez une sauvegarde depuis la page Sauvegarde.",
      );
    }
  }

  const normalized = normalizeStore(parsed);
  if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
    await writeStore(normalized);
  }

  const after = await stat(/* turbopackIgnore: true */ storePath).catch(() => null);
  readCache = after
    ? { path: storePath, mtimeMs: after.mtimeMs, size: after.size, store: normalized }
    : null;
  return normalized;
}

export async function writeStore(data: AppDataStore) {
  await ensureStoreExists();
  const storePath = getLocalStorePath();
  const normalized = normalizeStore(data);
  const serialized = JSON.stringify(normalized, null, 2);
  const tempPath = `${storePath}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tempPath, serialized, "utf8");

  let committed = false;
  for (let attempt = 0; attempt < 5 && !committed; attempt += 1) {
    try {
      await rename(/* turbopackIgnore: true */ tempPath, storePath);
      committed = true;
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";
      const retryable = code === "EPERM" || code === "EACCES";
      if (!retryable || attempt === 4) {
        await writeFile(/* turbopackIgnore: true */ storePath, serialized, "utf8");
        await rm(/* turbopackIgnore: true */ tempPath, { force: true });
        committed = true;
      } else {
        await wait(40 * (attempt + 1));
      }
    }
  }

  readCache = null;

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

/* ── Verrou d'écriture ──────────────────────────────────────────────────────
   1. File d'attente en mémoire : les lectures-modifications-écritures d'un même
      processus sont sérialisées (plus de « dernier qui écrit gagne »).
   2. Fichier verrou (<store>.lock, création exclusive) : protège aussi contre un
      second processus (application desktop + serveur, deux onglets Electron…).
      Un verrou abandonné (> 15 s) est considéré comme périmé et repris. */
let writeQueue: Promise<unknown> = Promise.resolve();
const LOCK_STALE_MS = 15_000;
const LOCK_TIMEOUT_MS = 20_000;

async function acquireFileLock(storePath: string): Promise<() => Promise<void>> {
  const lockPath = `${storePath}.lock`;
  const started = Date.now();
  for (;;) {
    try {
      const handle = await open(/* turbopackIgnore: true */ lockPath, "wx");
      await handle.writeFile(`${process.pid} ${nowIso()}`);
      await handle.close();
      return async () => {
        await rm(/* turbopackIgnore: true */ lockPath, { force: true });
      };
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";
      if (code !== "EEXIST") throw error;
      const info = await stat(/* turbopackIgnore: true */ lockPath).catch(() => null);
      if (info && Date.now() - info.mtimeMs > LOCK_STALE_MS) {
        await rm(/* turbopackIgnore: true */ lockPath, { force: true });
        continue;
      }
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new Error("Le fichier de données est verrouillé par un autre processus. Réessayez dans quelques secondes.");
      }
      await wait(25);
    }
  }
}

export async function mutateStore(
  mutate: (draft: AppDataStore) => void | Promise<void>,
) {
  const run = async () => {
    await ensureStoreExists();
    const release = await acquireFileLock(getLocalStorePath());
    try {
      readCache = null; // relire l'état disque sous verrou
      const draft = cloneStore(await readStore());
      await mutate(draft);
      draft.metadata.lastUpdatedAt = nowIso();
      await writeStore(draft);
      return draft;
    } finally {
      await release();
    }
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => undefined);
  return result;
}
