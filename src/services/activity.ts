import { randomUUID } from "node:crypto";
import { getResolvedPersistenceMode } from "@/lib/prisma";
import { getPrismaClient } from "@/lib/prisma";

export interface ActivityEvent {
  id: string;
  projectId: string;
  actorUserId?: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

const localEvents = new Map<string, ActivityEvent[]>();

function getLocalEvents(projectId: string): ActivityEvent[] {
  return localEvents.get(projectId) ?? [];
}

export async function listActivity(projectId: string, limit = 100): Promise<ActivityEvent[]> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const rows = await db.activityEvent.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id, projectId: r.projectId, actorName: r.actorName,
      actorUserId: r.actorUserId,
      action: r.action, entityType: r.entityType,
      entityId: r.entityId, entityName: r.entityName,
      fieldName: r.fieldName, oldValue: r.oldValue, newValue: r.newValue,
      createdAt: r.createdAt.toISOString(),
    }));
  }
  return [...getLocalEvents(projectId)].reverse().slice(0, limit);
}

export async function recordActivity(event: Omit<ActivityEvent, "id" | "createdAt">): Promise<void> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    await db.activityEvent.create({ data: { ...event, actorUserId: event.actorUserId ?? null, createdAt: new Date() } });
    return;
  }
  const e: ActivityEvent = { id: randomUUID(), ...event, createdAt: new Date().toISOString() };
  const prev = getLocalEvents(event.projectId);
  // keep last 500 events in memory
  localEvents.set(event.projectId, [...prev, e].slice(-500));
}
