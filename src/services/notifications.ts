import { randomUUID } from "node:crypto";

import { getResolvedPersistenceMode, getPrismaClient } from "@/lib/prisma";
import { getWorkspaceSettings } from "@/services/settings";

export type NotificationStatus = "UNREAD" | "READ" | "ARCHIVED";
export type NotificationChannel = "IN_APP" | "EMAIL" | "SLACK" | "TEAMS" | "JIRA";

export interface NotificationItem {
  id: string;
  workspaceId: string;
  projectId?: string | null;
  userId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  providerTarget?: string | null;
  providerMessageId?: string | null;
  sentAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  readAt?: string | null;
}

const localNotifications = new Map<string, NotificationItem[]>();

function toNotificationItem(row: {
  id: string;
  workspaceId: string;
  projectId: string | null;
  userId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  providerTarget: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  readAt: Date | null;
}): NotificationItem {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    userId: row.userId,
    channel: row.channel,
    status: row.status,
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    providerTarget: row.providerTarget,
    providerMessageId: row.providerMessageId,
    sentAt: row.sentAt?.toISOString() ?? null,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

function safeProviderTarget(endpoint?: string | null) {
  if (!endpoint) {
    return null;
  }
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return endpoint.slice(0, 120);
  }
}

async function postProviderJson(endpoint: string, payload: unknown) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Provider HTTP ${response.status}`);
  }

  return response.headers.get("x-request-id") ?? response.headers.get("x-correlation-id") ?? null;
}

async function dispatchExternalNotification(notification: NotificationItem) {
  if (notification.channel === "IN_APP") {
    return;
  }

  const settings = await getWorkspaceSettings(notification.workspaceId);
  const endpoint =
    notification.channel === "EMAIL"
      ? process.env["CHEETAH_TIME_EMAIL_WEBHOOK_URL"] ?? null
      : notification.channel === "SLACK"
        ? settings.slackWebhookUrl ?? process.env["CHEETAH_TIME_SLACK_WEBHOOK_URL"] ?? null
        : notification.channel === "TEAMS"
          ? settings.teamsWebhookUrl ?? process.env["CHEETAH_TIME_TEAMS_WEBHOOK_URL"] ?? null
          : process.env["CHEETAH_TIME_JIRA_WEBHOOK_URL"] ?? settings.jiraBaseUrl ?? null;

  const providerTarget = safeProviderTarget(endpoint);

  if (!endpoint) {
    return {
      providerTarget,
      providerMessageId: null,
      errorMessage: `Aucun provider ${notification.channel} configure.`,
    };
  }

  try {
    const providerMessageId = await postProviderJson(endpoint, {
      product: "Cheetah Time",
      channel: notification.channel,
      title: notification.title,
      body: notification.body,
      projectId: notification.projectId,
      userId: notification.userId,
      entityType: notification.entityType,
      entityId: notification.entityId,
      text:
        notification.channel === "SLACK" || notification.channel === "TEAMS"
          ? `*${notification.title}*\n${notification.body}`
          : undefined,
      email:
        notification.channel === "EMAIL"
          ? {
              subject: notification.title,
              text: notification.body,
              userId: notification.userId,
            }
          : undefined,
      jira:
        notification.channel === "JIRA"
          ? {
              summary: notification.title,
              description: notification.body,
              entityType: notification.entityType,
              entityId: notification.entityId,
            }
          : undefined,
    });

    return {
      providerTarget,
      providerMessageId,
      errorMessage: null,
    };
  } catch (error) {
    return {
      providerTarget,
      providerMessageId: null,
      errorMessage: error instanceof Error ? error.message : "Erreur provider inconnue.",
    };
  }
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationItem[]> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const rows = await db.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map((row) => toNotificationItem(row as Parameters<typeof toNotificationItem>[0]));
  }

  return [...(localNotifications.get(userId) ?? [])]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export async function createNotification(input: {
  workspaceId: string;
  projectId?: string | null;
  userId: string;
  title: string;
  body?: string;
  entityType?: string | null;
  entityId?: string | null;
  channel?: NotificationChannel;
}) {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const row = await db.notification.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? null,
        userId: input.userId,
        channel: input.channel ?? "IN_APP",
        status: "UNREAD",
        title: input.title,
        body: input.body ?? "",
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });

    const notification = toNotificationItem(row as Parameters<typeof toNotificationItem>[0]);
    const delivery = await dispatchExternalNotification(notification);
    if (delivery && input.channel && input.channel !== "IN_APP") {
      await db.notification.update({
        where: { id: row.id },
        data: {
          providerTarget: delivery.providerTarget,
          providerMessageId: delivery.providerMessageId,
          sentAt: delivery.errorMessage ? null : new Date(),
          errorMessage: delivery.errorMessage,
        },
      });
    }
    return;
  }

  const notification: NotificationItem = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? null,
    userId: input.userId,
    channel: input.channel ?? "IN_APP",
    status: "UNREAD",
    title: input.title,
    body: input.body ?? "",
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    providerTarget: null,
    providerMessageId: null,
    sentAt: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  const delivery = await dispatchExternalNotification(notification);
  if (delivery && notification.channel !== "IN_APP") {
    notification.providerTarget = delivery.providerTarget;
    notification.providerMessageId = delivery.providerMessageId;
    notification.sentAt = delivery.errorMessage ? null : new Date().toISOString();
    notification.errorMessage = delivery.errorMessage;
  }
  localNotifications.set(input.userId, [notification, ...(localNotifications.get(input.userId) ?? [])].slice(0, 200));
}

export async function markNotificationRead(userId: string, notificationId: string) {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    await db.notification.updateMany({
      where: { id: notificationId, userId },
      data: { status: "READ", readAt: new Date() },
    });
    return;
  }

  const rows = localNotifications.get(userId) ?? [];
  localNotifications.set(
    userId,
    rows.map((row) =>
      row.id === notificationId
        ? { ...row, status: "READ", readAt: new Date().toISOString() }
        : row,
    ),
  );
}

export function extractEmailMentions(content: string) {
  return Array.from(content.matchAll(/@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g))
    .map((match) => match[1].toLowerCase())
    .filter((email, index, all) => all.indexOf(email) === index);
}

export async function notifyMentionedUsers(input: {
  workspaceId: string;
  projectId: string;
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  content: string;
}) {
  const emails = extractEmailMentions(input.content);
  if (!emails.length || getResolvedPersistenceMode() !== "prisma") {
    return;
  }

  const db = getPrismaClient();
  const users = await db.user.findMany({
    where: {
      email: { in: emails },
      memberships: { some: { workspaceId: input.workspaceId } },
      status: "ACTIVE",
    },
    select: { id: true, email: true },
  });

  const settings = await getWorkspaceSettings(input.workspaceId);

  await Promise.all(
    users.flatMap((user) => {
      const notifications: Array<Promise<void>> = [];
      notifications.push(createNotification({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        userId: user.id,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      }));
      if (settings.emailNotifications) {
        notifications.push(createNotification({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          userId: user.id,
          channel: "EMAIL",
          title: input.title,
          body: input.body,
          entityType: input.entityType,
          entityId: input.entityId,
        }));
      }
      if (settings.slackNotifications || settings.slackWebhookUrl) {
        notifications.push(createNotification({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          userId: user.id,
          channel: "SLACK",
          title: input.title,
          body: `${input.body}\nDestinataire: ${user.email}`,
          entityType: input.entityType,
          entityId: input.entityId,
        }));
      }
      if (settings.teamsWebhookUrl) {
        notifications.push(createNotification({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          userId: user.id,
          channel: "TEAMS",
          title: input.title,
          body: `${input.body}\nDestinataire: ${user.email}`,
          entityType: input.entityType,
          entityId: input.entityId,
        }));
      }
      if (settings.jiraBaseUrl || process.env["CHEETAH_TIME_JIRA_WEBHOOK_URL"]) {
        notifications.push(createNotification({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          userId: user.id,
          channel: "JIRA",
          title: input.title,
          body: input.body,
          entityType: input.entityType,
          entityId: input.entityId,
        }));
      }
      return notifications;
    }),
  );
}
