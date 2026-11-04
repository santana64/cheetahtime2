import { randomUUID } from "node:crypto";
import { getResolvedPersistenceMode } from "@/lib/prisma";
import { getPrismaClient } from "@/lib/prisma";
import { notifyMentionedUsers } from "@/services/notifications";
import { recordActivity } from "@/services/activity";

export interface TaskComment {
  id: string;
  projectId: string;
  taskId: string;
  authorUserId?: string | null;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const localComments = new Map<string, TaskComment[]>();

function getLocalComments(taskId: string): TaskComment[] {
  return localComments.get(taskId) ?? [];
}

export async function listTaskComments(taskId: string): Promise<TaskComment[]> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const rows = await db.taskComment.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      id: r.id, projectId: r.projectId, taskId: r.taskId,
      authorUserId: r.authorUserId, authorName: r.authorName, content: r.content,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    }));
  }
  return getLocalComments(taskId);
}

export async function listProjectComments(projectId: string): Promise<TaskComment[]> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const rows = await db.taskComment.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 250,
    });
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      taskId: r.taskId,
      authorUserId: r.authorUserId,
      authorName: r.authorName,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  return [...localComments.values()]
    .flat()
    .filter((comment) => comment.projectId === projectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function addTaskComment(input: {
  projectId: string;
  taskId: string;
  workspaceId?: string;
  authorUserId?: string | null;
  authorName: string;
  content: string;
}): Promise<TaskComment> {
  const content = input.content.trim();
  if (!content) {
    throw new Error("Le commentaire ne peut pas etre vide.");
  }

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const r = await db.taskComment.create({
      data: {
        projectId: input.projectId,
        taskId: input.taskId,
        authorUserId: input.authorUserId ?? null,
        authorName: input.authorName,
        content,
      },
    });
    const comment = {
      id: r.id, projectId: r.projectId, taskId: r.taskId,
      authorUserId: r.authorUserId, authorName: r.authorName, content: r.content,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    };

    await notifyMentionedUsers({
      workspaceId: input.workspaceId ?? "workspace-cheetah-time",
      projectId: input.projectId,
      entityType: "comment",
      entityId: r.id,
      title: "Mention dans un commentaire",
      body: `${input.authorName} vous a mentionne dans une tache.`,
      content,
    });
    await recordActivity({
      projectId: input.projectId,
      actorUserId: input.authorUserId ?? null,
      actorName: input.authorName,
      action: "commented",
      entityType: "comment",
      entityId: r.id,
      entityName: "Commentaire de tache",
      fieldName: null,
      oldValue: null,
      newValue: content.slice(0, 160),
    });

    return comment;
  }
  const comment: TaskComment = {
    id: randomUUID(), ...input, content,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  localComments.set(input.taskId, [...getLocalComments(input.taskId), comment]);
  await recordActivity({
    projectId: input.projectId,
    actorUserId: input.authorUserId ?? null,
    actorName: input.authorName,
    action: "commented",
    entityType: "comment",
    entityId: comment.id,
    entityName: "Commentaire de tache",
    fieldName: null,
    oldValue: null,
    newValue: content.slice(0, 160),
  });
  return comment;
}

export async function deleteTaskComment(id: string, taskId: string): Promise<void> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    await db.taskComment.delete({ where: { id } });
    return;
  }
  localComments.set(taskId, getLocalComments(taskId).filter((c) => c.id !== id));
}
