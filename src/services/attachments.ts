import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { getPrismaClient, getResolvedPersistenceMode } from "@/lib/prisma";
import { recordActivity } from "@/services/activity";
import type { AttachmentKind, TaskAttachment } from "@/types/planning";

const localAttachments = new Map<string, TaskAttachment[]>();

const DEFAULT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function getMaxAttachmentBytes() {
  const configured = Number(process.env["CHEETAH_TIME_MAX_ATTACHMENT_BYTES"] ?? DEFAULT_MAX_ATTACHMENT_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_ATTACHMENT_BYTES;
}

function getAttachmentStorageRoot() {
  return path.join(process.cwd(), "data", "attachments");
}

function sanitizePathSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "attachment";
}

function getAttachmentDownloadUrl(projectId: string, attachmentId: string) {
  return `/api/projects/${projectId}/attachments/${attachmentId}`;
}

function resolveStoragePath(storagePath: string) {
  const root = path.resolve(getAttachmentStorageRoot());
  const resolved = path.resolve(root, storagePath);
  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
    throw new Error("Chemin de piece jointe invalide.");
  }
  return resolved;
}

function iso(row: { createdAt: Date }) {
  return row.createdAt.toISOString();
}

function toAttachment(row: {
  id: string;
  projectId: string;
  taskId: string;
  uploadedByUserId: string | null;
  kind: AttachmentKind;
  fileName: string;
  url: string | null;
  storageProvider: string;
  storagePath: string | null;
  checksumSha256: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  description: string;
  createdAt: Date;
}): TaskAttachment {
  return {
    id: row.id,
    projectId: row.projectId,
    taskId: row.taskId,
    uploadedByUserId: row.uploadedByUserId,
    kind: row.kind,
    fileName: row.fileName,
    url: row.url,
    storageProvider: row.storageProvider,
    storagePath: row.storagePath,
    checksumSha256: row.checksumSha256,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    description: row.description,
    createdAt: iso(row),
  };
}

export async function listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const rows = await db.taskAttachment.findMany({
      where: { taskId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => toAttachment(row as Parameters<typeof toAttachment>[0]));
  }

  return [...(localAttachments.get(taskId) ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listProjectAttachments(projectId: string): Promise<TaskAttachment[]> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const rows = await db.taskAttachment.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 250,
    });
    return rows.map((row) => toAttachment(row as Parameters<typeof toAttachment>[0]));
  }

  return [...localAttachments.values()]
    .flat()
    .filter((attachment) => attachment.projectId === projectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function addTaskAttachment(input: {
  projectId: string;
  taskId: string;
  uploadedByUserId?: string | null;
  uploadedByName: string;
  kind?: AttachmentKind;
  fileName: string;
  url: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  description?: string;
}): Promise<TaskAttachment> {
  const fileName = input.fileName.trim();
  const url = input.url.trim();
  if (!fileName) {
    throw new Error("Nom de piece jointe requis.");
  }
  if (!url) {
    throw new Error("URL ou reference de fichier requise.");
  }

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const row = await db.taskAttachment.create({
      data: {
        projectId: input.projectId,
        taskId: input.taskId,
        uploadedByUserId: input.uploadedByUserId ?? null,
        kind: input.kind ?? "LINK",
        fileName,
        url,
        storageProvider: "reference",
        storagePath: null,
        checksumSha256: null,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        description: input.description ?? "",
      },
    });

    await recordActivity({
      projectId: input.projectId,
      actorUserId: input.uploadedByUserId ?? null,
      actorName: input.uploadedByName,
      action: "attached",
      entityType: "attachment",
      entityId: row.id,
      entityName: fileName,
      fieldName: null,
      oldValue: null,
      newValue: url,
    });

    return toAttachment(row as Parameters<typeof toAttachment>[0]);
  }

  const attachment: TaskAttachment = {
    id: randomUUID(),
    projectId: input.projectId,
    taskId: input.taskId,
    uploadedByUserId: input.uploadedByUserId ?? null,
    kind: input.kind ?? "LINK",
    fileName,
    url,
    storageProvider: "reference",
    storagePath: null,
    checksumSha256: null,
    mimeType: input.mimeType ?? null,
    sizeBytes: input.sizeBytes ?? null,
    description: input.description ?? "",
    createdAt: new Date().toISOString(),
  };
  localAttachments.set(input.taskId, [attachment, ...(localAttachments.get(input.taskId) ?? [])]);
  await recordActivity({
    projectId: input.projectId,
    actorUserId: input.uploadedByUserId ?? null,
    actorName: input.uploadedByName,
    action: "attached",
    entityType: "attachment",
    entityId: attachment.id,
    entityName: fileName,
    fieldName: null,
    oldValue: null,
    newValue: url,
  });
  return attachment;
}

export async function addBinaryTaskAttachment(input: {
  projectId: string;
  taskId: string;
  uploadedByUserId?: string | null;
  uploadedByName: string;
  fileName: string;
  mimeType?: string | null;
  content: Buffer;
  description?: string;
}): Promise<TaskAttachment> {
  const fileName = input.fileName.trim();
  if (!fileName) {
    throw new Error("Nom de fichier requis.");
  }
  if (!input.content.length) {
    throw new Error("Le fichier transmis est vide.");
  }
  if (input.content.length > getMaxAttachmentBytes()) {
    throw new Error("Le fichier depasse la taille maximale autorisee.");
  }

  const attachmentId = randomUUID();
  const checksumSha256 = createHash("sha256").update(input.content).digest("hex");
  const relativeStoragePath = path.join(
    sanitizePathSegment(input.projectId),
    sanitizePathSegment(input.taskId),
    `${attachmentId}-${sanitizePathSegment(fileName)}`,
  );
  const absoluteStoragePath = resolveStoragePath(relativeStoragePath);
  await mkdir(path.dirname(absoluteStoragePath), { recursive: true });
  await writeFile(absoluteStoragePath, input.content);

  const url = getAttachmentDownloadUrl(input.projectId, attachmentId);

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const row = await db.taskAttachment.create({
      data: {
        id: attachmentId,
        projectId: input.projectId,
        taskId: input.taskId,
        uploadedByUserId: input.uploadedByUserId ?? null,
        kind: "BINARY",
        fileName,
        url,
        storageProvider: "local-fs",
        storagePath: relativeStoragePath,
        checksumSha256,
        mimeType: input.mimeType ?? "application/octet-stream",
        sizeBytes: input.content.length,
        description: input.description ?? "",
      },
    });

    await recordActivity({
      projectId: input.projectId,
      actorUserId: input.uploadedByUserId ?? null,
      actorName: input.uploadedByName,
      action: "uploaded",
      entityType: "attachment",
      entityId: row.id,
      entityName: fileName,
      fieldName: null,
      oldValue: null,
      newValue: checksumSha256,
    });

    return toAttachment(row as Parameters<typeof toAttachment>[0]);
  }

  const attachment: TaskAttachment = {
    id: attachmentId,
    projectId: input.projectId,
    taskId: input.taskId,
    uploadedByUserId: input.uploadedByUserId ?? null,
    kind: "BINARY",
    fileName,
    url,
    storageProvider: "local-fs",
    storagePath: relativeStoragePath,
    checksumSha256,
    mimeType: input.mimeType ?? "application/octet-stream",
    sizeBytes: input.content.length,
    description: input.description ?? "",
    createdAt: new Date().toISOString(),
  };
  localAttachments.set(input.taskId, [attachment, ...(localAttachments.get(input.taskId) ?? [])]);
  await recordActivity({
    projectId: input.projectId,
    actorUserId: input.uploadedByUserId ?? null,
    actorName: input.uploadedByName,
    action: "uploaded",
    entityType: "attachment",
    entityId: attachment.id,
    entityName: fileName,
    fieldName: null,
    oldValue: null,
    newValue: checksumSha256,
  });
  return attachment;
}

export async function getTaskAttachmentFile(projectId: string, attachmentId: string) {
  let attachment: TaskAttachment | null = null;

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const row = await db.taskAttachment.findFirst({
      where: { id: attachmentId, projectId, kind: "BINARY" },
    });
    attachment = row ? toAttachment(row as Parameters<typeof toAttachment>[0]) : null;
  } else {
    attachment =
      [...localAttachments.values()]
        .flat()
        .find((entry) => entry.id === attachmentId && entry.projectId === projectId && entry.kind === "BINARY") ??
      null;
  }

  if (!attachment?.storagePath) {
    return null;
  }

  const absolutePath = resolveStoragePath(attachment.storagePath);
  const [bytes, metadata] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
  return {
    attachment,
    bytes,
    sizeBytes: metadata.size,
    contentType: attachment.mimeType ?? "application/octet-stream",
  };
}

export async function deleteTaskAttachment(input: {
  projectId: string;
  taskId: string;
  attachmentId: string;
  actorName: string;
  actorUserId?: string | null;
}) {
  let attachmentToDelete: TaskAttachment | null = null;
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const row = await db.taskAttachment.findFirst({
      where: { id: input.attachmentId, projectId: input.projectId },
    });
    attachmentToDelete = row ? toAttachment(row as Parameters<typeof toAttachment>[0]) : null;
    await db.taskAttachment.delete({ where: { id: input.attachmentId } });
  } else {
    attachmentToDelete =
      (localAttachments.get(input.taskId) ?? []).find(
        (attachment) => attachment.id === input.attachmentId,
      ) ?? null;
    localAttachments.set(
      input.taskId,
      (localAttachments.get(input.taskId) ?? []).filter((attachment) => attachment.id !== input.attachmentId),
    );
  }

  if (attachmentToDelete?.kind === "BINARY" && attachmentToDelete.storagePath) {
    await rm(resolveStoragePath(attachmentToDelete.storagePath), { force: true });
  }

  await recordActivity({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName,
    action: "deleted",
    entityType: "attachment",
    entityId: input.attachmentId,
    entityName: "Piece jointe",
    fieldName: null,
    oldValue: null,
    newValue: null,
  });
}
