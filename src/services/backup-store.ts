import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { getLocalStorePath } from "@/services/local-store";
import type { AppDataStore } from "@/types/planning";

/**
 * Système de sauvegarde local (mono-poste) — demande François « sauvegarde des
 * données si sortie anormale » + variantes d'usage :
 *   1. Snapshots automatiques horodatés (rotation) à chaque enregistrement et à la fermeture.
 *   2. Récupération automatique du dernier bon état si le fichier principal est corrompu.
 *   3. Export / import d'une sauvegarde complète (fichier).
 *   4. Recopie automatique dans un dossier externe (Drive/OneDrive/USB).
 *   5. Historique par projet (restauration d'un projet depuis un snapshot).
 * Aucun serveur, aucun cloud : tout reste sur le poste + dossier externe choisi.
 */

export type SnapshotKind = "auto" | "close" | "manual" | "pre-restore" | "pre-import";

export interface SnapshotInfo {
  name: string;
  kind: SnapshotKind;
  at: string; // ISO
  sizeBytes: number;
  projectCount: number | null;
}

const MAX_AUTO_SNAPSHOTS = 40; // rotation des snapshots automatiques
const AUTO_SNAPSHOT_MIN_INTERVAL_MS = 90_000; // au plus 1 snapshot auto / 90 s

let lastAutoSnapshotMs = 0;
let lastSerializedLength = -1;

/**
 * Un dossier de sauvegardes PAR store : backups/<nom-du-store>/. Auparavant le
 * dossier backups/ était commun à tous les stores d'un même répertoire, et un
 * store neuf « récupérait » les projets d'un autre store.
 */
function storeKey() {
  return path.basename(getLocalStorePath()).replace(/\.json$/i, "").replace(/[^a-zA-Z0-9._-]/g, "_");
}
function backupsDir() {
  return path.join(path.dirname(getLocalStorePath()), "backups", storeKey());
}
/** Ancien emplacement partagé — lu seulement pour le store par défaut (migration). */
function legacyBackupsDir() {
  return storeKey() === "cheetah-time.local" ? path.join(path.dirname(getLocalStorePath()), "backups") : null;
}
function configPath() {
  return path.join(path.dirname(getLocalStorePath()), "cheetah-backup-config.json");
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function parseSnapshotName(name: string): { kind: SnapshotKind; at: string } | null {
  // format : <kind>-YYYYMMDD-HHmmss-<rand>.json
  const m = name.match(/^(auto|close|manual|pre-restore|pre-import)-(\d{8})-(\d{6})-[0-9a-f]+\.json$/);
  if (!m) return null;
  const [, kind, d, t] = m;
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
  return { kind: kind as SnapshotKind, at: iso };
}

async function ensureBackupsDir() {
  await mkdir(/* turbopackIgnore: true */ backupsDir(), { recursive: true });
}

/** Écrit un snapshot (copie horodatée) + recopie externe éventuelle. */
export async function writeSnapshot(serialized: string, kind: SnapshotKind): Promise<string> {
  await ensureBackupsDir();
  const name = `${kind}-${stamp()}-${randomUUID().slice(0, 6)}.json`;
  const dest = path.join(backupsDir(), name);
  const tmp = `${dest}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmp, serialized, "utf8");
  try {
    await rename(/* turbopackIgnore: true */ tmp, dest);
  } catch {
    await writeFile(/* turbopackIgnore: true */ dest, serialized, "utf8");
    await rm(/* turbopackIgnore: true */ tmp, { force: true });
  }
  await mirrorToExternal(serialized, name).catch(() => {});
  return name;
}

/** Snapshot automatique throttlé + rotation (appelé à chaque writeStore). */
export async function maybeWriteAutoSnapshot(serialized: string): Promise<void> {
  const now = Date.now();
  // throttle : au plus 1 snapshot auto par intervalle, sauf si le contenu n'a pas changé.
  if (now - lastAutoSnapshotMs < AUTO_SNAPSHOT_MIN_INTERVAL_MS) return;
  if (serialized.length === lastSerializedLength) return;
  lastAutoSnapshotMs = now;
  lastSerializedLength = serialized.length;
  try {
    await writeSnapshot(serialized, "auto");
    await pruneAutoSnapshots();
  } catch {
    /* la sauvegarde ne doit jamais casser l'écriture principale */
  }
}

async function pruneAutoSnapshots() {
  const all = await listSnapshots();
  const autos = all.filter((s) => s.kind === "auto");
  if (autos.length <= MAX_AUTO_SNAPSHOTS) return;
  const toDelete = autos.slice(MAX_AUTO_SNAPSHOTS); // listSnapshots trie du + récent au + ancien
  await Promise.all(toDelete.map((s) => rm(/* turbopackIgnore: true */ path.join(backupsDir(), s.name), { force: true })));
}

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  await ensureBackupsDir();
  let names: string[];
  try {
    names = await readdir(/* turbopackIgnore: true */ backupsDir());
  } catch {
    return [];
  }
  const infos: SnapshotInfo[] = [];
  for (const name of names) {
    const meta = parseSnapshotName(name);
    if (!meta) continue;
    let sizeBytes = 0;
    const projectCount: number | null = null;
    try {
      const st = await stat(/* turbopackIgnore: true */ path.join(backupsDir(), name));
      sizeBytes = st.size;
    } catch {
      /* ignore */
    }
    infos.push({ name, kind: meta.kind, at: meta.at, sizeBytes, projectCount });
  }
  // tri décroissant par horodatage du nom
  infos.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return infos;
}

export async function readSnapshotRaw(name: string): Promise<string> {
  if (!parseSnapshotName(name)) throw new Error("Nom de snapshot invalide.");
  return readFile(/* turbopackIgnore: true */ path.join(backupsDir(), name), "utf8");
}

/** Renvoie le contenu du snapshot valide le plus récent (pour récupération). */
export async function readLatestValidSnapshot(): Promise<string | null> {
  const snaps = await listSnapshots();
  for (const snap of snaps) {
    try {
      const raw = await readSnapshotRaw(snap.name);
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.projects)) return raw;
    } catch {
      /* essaie le suivant */
    }
  }
  // Migration : snapshots de l'ancien dossier partagé (store par défaut uniquement).
  const legacy = legacyBackupsDir();
  if (legacy) {
    const names = (await readdir(/* turbopackIgnore: true */ legacy).catch(() => [] as string[]))
      .filter((n) => parseSnapshotName(n))
      .sort()
      .reverse();
    for (const name of names) {
      try {
        const raw = await readFile(/* turbopackIgnore: true */ path.join(legacy, name), "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.projects)) return raw;
      } catch {
        /* essaie le suivant */
      }
    }
  }
  return null;
}

/** Écrit un contenu brut (déjà sérialisé) dans le store principal, de façon atomique. */
export async function restoreSerializedToMain(serialized: string): Promise<void> {
  const storePath = getLocalStorePath();
  await mkdir(/* turbopackIgnore: true */ path.dirname(storePath), { recursive: true });
  const tmp = `${storePath}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmp, serialized, "utf8");
  try {
    await rename(/* turbopackIgnore: true */ tmp, storePath);
  } catch {
    await writeFile(/* turbopackIgnore: true */ storePath, serialized, "utf8");
    await rm(/* turbopackIgnore: true */ tmp, { force: true });
  }
}

/** Restaure tout le portefeuille depuis un snapshot (après snapshot de sécurité). */
export async function restoreSnapshotToMain(name: string): Promise<void> {
  const raw = await readSnapshotRaw(name);
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.projects)) {
    throw new Error("Snapshot illisible ou incomplet.");
  }
  // snapshot de sécurité de l'état courant avant d'écraser
  try {
    const current = await readFile(/* turbopackIgnore: true */ getLocalStorePath(), "utf8");
    await writeSnapshot(current, "pre-restore");
  } catch {
    /* pas d'état courant lisible — on continue */
  }
  await restoreSerializedToMain(raw);
}

/** Restaure UN seul projet depuis un snapshot (historique par projet). */
export async function restoreProjectFromSnapshot(
  projectId: string,
  snapshotName: string,
): Promise<AppDataStore> {
  const raw = await readSnapshotRaw(snapshotName);
  const snapStore = JSON.parse(raw) as AppDataStore;
  const snapProject = snapStore.projects?.find((p) => p.project.id === projectId);
  if (!snapProject) {
    throw new Error("Ce projet est absent du snapshot sélectionné.");
  }
  // snapshot de sécurité avant modification
  try {
    const current = await readFile(/* turbopackIgnore: true */ getLocalStorePath(), "utf8");
    await writeSnapshot(current, "pre-restore");
  } catch {
    /* ignore */
  }
  const currentRaw = await readFile(/* turbopackIgnore: true */ getLocalStorePath(), "utf8");
  const store = JSON.parse(currentRaw) as AppDataStore;
  const idx = store.projects.findIndex((p) => p.project.id === projectId);
  if (idx >= 0) store.projects[idx] = snapProject;
  else store.projects.push(snapProject);
  store.metadata.lastUpdatedAt = new Date().toISOString();
  const serialized = JSON.stringify(store, null, 2);
  await restoreSerializedToMain(serialized);
  return store;
}

/** Applique un import complet (remplace tout le store) après validation + snapshot. */
export async function importFullBackup(serialized: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Fichier de sauvegarde illisible (JSON invalide).");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as AppDataStore).projects)) {
    throw new Error("Fichier de sauvegarde invalide (aucun projet trouvé).");
  }
  try {
    const current = await readFile(/* turbopackIgnore: true */ getLocalStorePath(), "utf8");
    await writeSnapshot(current, "pre-import");
  } catch {
    /* ignore */
  }
  await restoreSerializedToMain(JSON.stringify(parsed, null, 2));
}

/** Contenu brut du store principal (pour export/téléchargement). */
export async function readMainRaw(): Promise<string> {
  return readFile(/* turbopackIgnore: true */ getLocalStorePath(), "utf8");
}

// ── Dossier de sauvegarde externe (Drive / OneDrive / USB) ─────────────────
export interface BackupConfig {
  externalFolder: string | null;
}

export async function getBackupConfig(): Promise<BackupConfig> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ configPath(), "utf8");
    const parsed = JSON.parse(raw);
    return { externalFolder: typeof parsed?.externalFolder === "string" ? parsed.externalFolder : null };
  } catch {
    return { externalFolder: null };
  }
}

export async function setBackupConfig(config: BackupConfig): Promise<void> {
  await mkdir(/* turbopackIgnore: true */ path.dirname(configPath()), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ configPath(), JSON.stringify(config, null, 2), "utf8");
}

async function mirrorToExternal(serialized: string, name: string): Promise<void> {
  const { externalFolder } = await getBackupConfig();
  if (!externalFolder) return;
  const dir = path.join(externalFolder, "CheetahTime-Sauvegardes");
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  await writeFile(/* turbopackIgnore: true */ path.join(dir, name), serialized, "utf8");
  // garde aussi une copie « dernière » facile à retrouver
  await writeFile(/* turbopackIgnore: true */ path.join(dir, "cheetah-time-derniere-sauvegarde.json"), serialized, "utf8").catch(() => {});
}

/** Recopie immédiate du store courant dans le dossier externe (bouton « sauvegarder maintenant »). */
export async function backupNowToExternal(): Promise<{ ok: boolean; folder: string | null }> {
  const { externalFolder } = await getBackupConfig();
  if (!externalFolder) return { ok: false, folder: null };
  const raw = await readMainRaw();
  const name = `manual-${stamp()}-${randomUUID().slice(0, 6)}.json`;
  await mirrorToExternal(raw, name);
  return { ok: true, folder: externalFolder };
}
