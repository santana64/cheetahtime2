"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentSession } from "@/services/auth";
import {
  backupNowToExternal,
  getBackupConfig,
  importFullBackup,
  readMainRaw,
  restoreProjectFromSnapshot,
  restoreSnapshotToMain,
  setBackupConfig,
  writeSnapshot,
} from "@/services/backup-store";

function required(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || v.length === 0) throw new Error(`Champ manquant : ${key}`);
  return v;
}
function optional(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return typeof v === "string" ? v : null;
}

async function guard() {
  await requireCurrentSession();
}

function revalidateEverything() {
  revalidatePath("/backup");
  revalidatePath("/projects");
  revalidatePath("/", "layout");
}

/** Crée immédiatement un snapshot manuel de l'état courant. */
export async function manualSnapshotAction() {
  await guard();
  const raw = await readMainRaw();
  await writeSnapshot(raw, "manual");
  revalidatePath("/backup");
}

/** Restaure tout le portefeuille depuis un snapshot. */
export async function restoreSnapshotAction(formData: FormData) {
  await guard();
  await restoreSnapshotToMain(required(formData, "name"));
  revalidateEverything();
}

/** Importe une sauvegarde complète (remplace tout le portefeuille). */
export async function importBackupAction(formData: FormData) {
  await guard();
  await importFullBackup(required(formData, "content"));
  revalidateEverything();
}

/** Définit (ou efface) le dossier de sauvegarde externe. */
export async function setExternalFolderAction(formData: FormData) {
  await guard();
  const folder = optional(formData, "folder");
  await setBackupConfig({ externalFolder: folder && folder.trim() ? folder.trim() : null });
  revalidatePath("/backup");
}

/** Recopie immédiate dans le dossier externe. */
export async function backupNowAction() {
  await guard();
  await backupNowToExternal();
  revalidatePath("/backup");
}

/** Restaure UN projet à une version antérieure (depuis un snapshot). */
export async function restoreProjectVersionAction(formData: FormData) {
  await guard();
  const projectId = required(formData, "projectId");
  await restoreProjectFromSnapshot(projectId, required(formData, "name"));
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidateEverything();
}

/** Lecture de la config (utilisée par des composants serveur si besoin). */
export async function readBackupConfigAction() {
  await guard();
  return getBackupConfig();
}
