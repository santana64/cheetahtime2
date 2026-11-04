import { randomUUID } from "node:crypto";

import { getPrismaClient, getResolvedPersistenceMode } from "@/lib/prisma";
import { recordActivity } from "@/services/activity";
import type {
  ChangeRequest,
  ChangeRequestImpact,
  ChangeRequestStatus,
  IssueItem,
  IssueSeverity,
  IssueStatus,
} from "@/types/planning";

const localIssues = new Map<string, IssueItem[]>();
const localChanges = new Map<string, ChangeRequest[]>();

function isoDate(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function isoTimestamp(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function nextCode(prefix: string, count: number) {
  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
}

function toNumber(value: unknown) {
  if (value == null) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return Number(value.toNumber());
  }
  return Number(value);
}

export async function listIssues(projectId: string): Promise<IssueItem[]> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const rows = await db.issueItem.findMany({
      where: { projectId },
      orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      taskId: row.taskId,
      assigneeUserId: row.assigneeUserId,
      code: row.code,
      title: row.title,
      description: row.description,
      severity: row.severity as IssueSeverity,
      status: row.status as IssueStatus,
      ownerName: row.ownerName,
      dueDate: isoDate(row.dueDate),
      resolvedAt: isoTimestamp(row.resolvedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  return localIssues.get(projectId) ?? [];
}

export async function saveIssue(input: {
  id?: string | null;
  projectId: string;
  taskId?: string | null;
  assigneeUserId?: string | null;
  title: string;
  description?: string;
  severity?: IssueSeverity;
  status?: IssueStatus;
  ownerName?: string;
  dueDate?: string | null;
  actorName: string;
  actorUserId?: string | null;
}) {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Titre d'incident requis.");
  }

  const existing = await listIssues(input.projectId);
  const timestamp = new Date().toISOString();

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const row = input.id
      ? await db.issueItem.update({
          where: { id: input.id },
          data: {
            taskId: input.taskId ?? null,
            assigneeUserId: input.assigneeUserId ?? null,
            title,
            description: input.description ?? "",
            severity: input.severity ?? "MEDIUM",
            status: input.status ?? "OPEN",
            ownerName: input.ownerName ?? "",
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            resolvedAt: input.status === "RESOLVED" || input.status === "CLOSED" ? new Date() : null,
          },
        })
      : await db.issueItem.create({
          data: {
            projectId: input.projectId,
            taskId: input.taskId ?? null,
            assigneeUserId: input.assigneeUserId ?? null,
            code: nextCode("I", existing.length),
            title,
            description: input.description ?? "",
            severity: input.severity ?? "MEDIUM",
            status: input.status ?? "OPEN",
            ownerName: input.ownerName ?? "",
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
          },
        });

    await recordActivity({
      projectId: input.projectId,
      actorUserId: input.actorUserId ?? null,
      actorName: input.actorName,
      action: input.id ? "updated" : "created",
      entityType: "issue",
      entityId: row.id,
      entityName: row.title,
      fieldName: input.id ? "incident" : null,
      oldValue: null,
      newValue: row.status,
    });
    return row.id;
  }

  const rows = [...existing];
  if (input.id) {
    const index = rows.findIndex((issue) => issue.id === input.id);
    if (index < 0) {
      throw new Error("Incident introuvable.");
    }
    rows[index] = {
      ...rows[index],
      taskId: input.taskId ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      title,
      description: input.description ?? "",
      severity: input.severity ?? "MEDIUM",
      status: input.status ?? "OPEN",
      ownerName: input.ownerName ?? "",
      dueDate: input.dueDate ?? null,
      resolvedAt: input.status === "RESOLVED" || input.status === "CLOSED" ? timestamp : null,
      updatedAt: timestamp,
    };
  } else {
    rows.unshift({
      id: randomUUID(),
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      code: nextCode("I", rows.length),
      title,
      description: input.description ?? "",
      severity: input.severity ?? "MEDIUM",
      status: input.status ?? "OPEN",
      ownerName: input.ownerName ?? "",
      dueDate: input.dueDate ?? null,
      resolvedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  localIssues.set(input.projectId, rows);
  await recordActivity({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName,
    action: input.id ? "updated" : "created",
    entityType: "issue",
    entityId: input.id ?? rows[0].id,
    entityName: title,
    fieldName: input.id ? "incident" : null,
    oldValue: null,
    newValue: input.status ?? "OPEN",
  });
  return input.id ?? rows[0].id;
}

export async function deleteIssue(input: {
  projectId: string;
  issueId: string;
  actorName: string;
  actorUserId?: string | null;
}) {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    await db.issueItem.delete({ where: { id: input.issueId } });
  } else {
    localIssues.set(input.projectId, (localIssues.get(input.projectId) ?? []).filter((issue) => issue.id !== input.issueId));
  }
  await recordActivity({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName,
    action: "deleted",
    entityType: "issue",
    entityId: input.issueId,
    entityName: "Incident",
    fieldName: null,
    oldValue: null,
    newValue: null,
  });
}

export async function listChangeRequests(projectId: string): Promise<ChangeRequest[]> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const rows = await db.changeRequest.findMany({
      where: { projectId },
      orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      taskId: row.taskId,
      requesterUserId: row.requesterUserId,
      approverUserId: row.approverUserId,
      code: row.code,
      title: row.title,
      description: row.description,
      status: row.status as ChangeRequestStatus,
      scheduleImpactDays: row.scheduleImpactDays,
      costImpactAmount: toNumber(row.costImpactAmount),
      impactLevel: row.impactLevel as ChangeRequestImpact,
      decisionNotes: row.decisionNotes,
      requestedAt: row.requestedAt.toISOString(),
      decidedAt: isoTimestamp(row.decidedAt),
      implementedAt: isoTimestamp(row.implementedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  return localChanges.get(projectId) ?? [];
}

export async function saveChangeRequest(input: {
  id?: string | null;
  projectId: string;
  taskId?: string | null;
  requesterUserId?: string | null;
  approverUserId?: string | null;
  title: string;
  description?: string;
  status?: ChangeRequestStatus;
  scheduleImpactDays?: number;
  costImpactAmount?: number;
  impactLevel?: ChangeRequestImpact;
  decisionNotes?: string;
  actorName: string;
  actorUserId?: string | null;
}) {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Titre de demande de changement requis.");
  }

  const existing = await listChangeRequests(input.projectId);
  const timestamp = new Date().toISOString();

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const decisionDate =
      input.status === "APPROVED" || input.status === "REJECTED" ? new Date() : null;
    const implementedAt = input.status === "IMPLEMENTED" ? new Date() : null;
    const row = input.id
      ? await db.changeRequest.update({
          where: { id: input.id },
          data: {
            taskId: input.taskId ?? null,
            requesterUserId: input.requesterUserId ?? null,
            approverUserId: input.approverUserId ?? null,
            title,
            description: input.description ?? "",
            status: input.status ?? "DRAFT",
            scheduleImpactDays: input.scheduleImpactDays ?? 0,
            costImpactAmount: input.costImpactAmount ?? 0,
            impactLevel: input.impactLevel ?? "MEDIUM",
            decisionNotes: input.decisionNotes ?? "",
            decidedAt: decisionDate,
            implementedAt,
          },
        })
      : await db.changeRequest.create({
          data: {
            projectId: input.projectId,
            taskId: input.taskId ?? null,
            requesterUserId: input.requesterUserId ?? null,
            approverUserId: input.approverUserId ?? null,
            code: nextCode("CR", existing.length),
            title,
            description: input.description ?? "",
            status: input.status ?? "DRAFT",
            scheduleImpactDays: input.scheduleImpactDays ?? 0,
            costImpactAmount: input.costImpactAmount ?? 0,
            impactLevel: input.impactLevel ?? "MEDIUM",
            decisionNotes: input.decisionNotes ?? "",
          },
        });
    await recordActivity({
      projectId: input.projectId,
      actorUserId: input.actorUserId ?? null,
      actorName: input.actorName,
      action: input.id ? "updated" : "created",
      entityType: "change",
      entityId: row.id,
      entityName: title,
      fieldName: input.id ? "demande de changement" : null,
      oldValue: null,
      newValue: row.status,
    });
    return row.id;
  }

  const rows = [...existing];
  if (input.id) {
    const index = rows.findIndex((row) => row.id === input.id);
    if (index < 0) {
      throw new Error("Demande de changement introuvable.");
    }
    rows[index] = {
      ...rows[index],
      taskId: input.taskId ?? null,
      requesterUserId: input.requesterUserId ?? null,
      approverUserId: input.approverUserId ?? null,
      title,
      description: input.description ?? "",
      status: input.status ?? "DRAFT",
      scheduleImpactDays: input.scheduleImpactDays ?? 0,
      costImpactAmount: input.costImpactAmount ?? 0,
      impactLevel: input.impactLevel ?? "MEDIUM",
      decisionNotes: input.decisionNotes ?? "",
      decidedAt: input.status === "APPROVED" || input.status === "REJECTED" ? timestamp : null,
      implementedAt: input.status === "IMPLEMENTED" ? timestamp : null,
      updatedAt: timestamp,
    };
  } else {
    rows.unshift({
      id: randomUUID(),
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      requesterUserId: input.requesterUserId ?? null,
      approverUserId: input.approverUserId ?? null,
      code: nextCode("CR", rows.length),
      title,
      description: input.description ?? "",
      status: input.status ?? "DRAFT",
      scheduleImpactDays: input.scheduleImpactDays ?? 0,
      costImpactAmount: input.costImpactAmount ?? 0,
      impactLevel: input.impactLevel ?? "MEDIUM",
      decisionNotes: input.decisionNotes ?? "",
      requestedAt: timestamp,
      decidedAt: null,
      implementedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  localChanges.set(input.projectId, rows);
  await recordActivity({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName,
    action: input.id ? "updated" : "created",
    entityType: "change",
    entityId: input.id ?? rows[0].id,
    entityName: title,
    fieldName: input.id ? "demande de changement" : null,
    oldValue: null,
    newValue: input.status ?? "DRAFT",
  });
  return input.id ?? rows[0].id;
}

export async function deleteChangeRequest(input: {
  projectId: string;
  changeRequestId: string;
  actorName: string;
  actorUserId?: string | null;
}) {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    await db.changeRequest.delete({ where: { id: input.changeRequestId } });
  } else {
    localChanges.set(
      input.projectId,
      (localChanges.get(input.projectId) ?? []).filter((row) => row.id !== input.changeRequestId),
    );
  }
  await recordActivity({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName,
    action: "deleted",
    entityType: "change",
    entityId: input.changeRequestId,
    entityName: "Demande de changement",
    fieldName: null,
    oldValue: null,
    newValue: null,
  });
}
