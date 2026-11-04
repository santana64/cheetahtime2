import { getPrismaClient, getResolvedPersistenceMode } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_ID } from "@/services/auth";

export interface WorkspaceSettingsView {
  workspaceId: string;
  workspaceName: string;
  defaultCurrencyCode: string;
  timezone: string;
  fiscalYearStartMonth: number;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  slackNotifications: boolean;
  slackWebhookUrl?: string | null;
  teamsWebhookUrl?: string | null;
  jiraBaseUrl?: string | null;
  attachmentPolicy: string;
  updatedAt: string;
}

const localSettings = new Map<string, WorkspaceSettingsView>();

function defaultSettings(workspaceId = DEFAULT_WORKSPACE_ID): WorkspaceSettingsView {
  return {
    workspaceId,
    workspaceName: "Cheetah Time",
    defaultCurrencyCode: "EUR",
    timezone: "Europe/Paris",
    fiscalYearStartMonth: 1,
    emailNotifications: false,
    inAppNotifications: true,
    slackNotifications: false,
    slackWebhookUrl: null,
    teamsWebhookUrl: null,
    jiraBaseUrl: null,
    attachmentPolicy: "link-or-reference",
    updatedAt: new Date().toISOString(),
  };
}

export async function getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettingsView> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const workspace = await db.workspace.upsert({
      where: { id: workspaceId },
      create: {
        id: workspaceId,
        slug: "cheetah-time",
        name: "Cheetah Time",
        defaultCurrencyCode: "EUR",
        timezone: "Europe/Paris",
      },
      update: {},
      include: { settings: true },
    });

    const settings =
      workspace.settings ??
      (await db.workspaceSettings.create({
        data: {
          workspaceId,
          defaultCurrencyCode: workspace.defaultCurrencyCode,
          timezone: workspace.timezone,
          fiscalYearStartMonth: 1,
          emailNotifications: false,
          inAppNotifications: true,
          slackNotifications: false,
          attachmentPolicy: "link-or-reference",
        },
      }));

    return {
      workspaceId,
      workspaceName: workspace.name,
      defaultCurrencyCode: settings.defaultCurrencyCode,
      timezone: settings.timezone,
      fiscalYearStartMonth: settings.fiscalYearStartMonth,
      emailNotifications: settings.emailNotifications,
      inAppNotifications: settings.inAppNotifications,
      slackNotifications: settings.slackNotifications,
      slackWebhookUrl: settings.slackWebhookUrl,
      teamsWebhookUrl: settings.teamsWebhookUrl,
      jiraBaseUrl: settings.jiraBaseUrl,
      attachmentPolicy: settings.attachmentPolicy,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  return localSettings.get(workspaceId) ?? defaultSettings(workspaceId);
}

export async function updateWorkspaceSettings(input: {
  workspaceId: string;
  workspaceName: string;
  defaultCurrencyCode: string;
  timezone: string;
  fiscalYearStartMonth: number;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  slackNotifications: boolean;
  slackWebhookUrl?: string | null;
  teamsWebhookUrl?: string | null;
  jiraBaseUrl?: string | null;
  attachmentPolicy: string;
}) {
  const defaultCurrencyCode = input.defaultCurrencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(defaultCurrencyCode)) {
    throw new Error("Le code devise doit contenir 3 lettres, ex. EUR.");
  }

  if (input.fiscalYearStartMonth < 1 || input.fiscalYearStartMonth > 12) {
    throw new Error("Le mois de debut d'exercice doit etre compris entre 1 et 12.");
  }

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    await db.workspace.update({
      where: { id: input.workspaceId },
      data: {
        name: input.workspaceName.trim() || "Cheetah Time",
        defaultCurrencyCode,
        timezone: input.timezone.trim() || "Europe/Paris",
      },
    });
    await db.workspaceSettings.upsert({
      where: { workspaceId: input.workspaceId },
      create: {
        workspaceId: input.workspaceId,
        defaultCurrencyCode,
        timezone: input.timezone.trim() || "Europe/Paris",
        fiscalYearStartMonth: input.fiscalYearStartMonth,
        emailNotifications: input.emailNotifications,
        inAppNotifications: input.inAppNotifications,
        slackNotifications: input.slackNotifications,
        slackWebhookUrl: input.slackWebhookUrl || null,
        teamsWebhookUrl: input.teamsWebhookUrl || null,
        jiraBaseUrl: input.jiraBaseUrl || null,
        attachmentPolicy: input.attachmentPolicy.trim() || "link-or-reference",
      },
      update: {
        defaultCurrencyCode,
        timezone: input.timezone.trim() || "Europe/Paris",
        fiscalYearStartMonth: input.fiscalYearStartMonth,
        emailNotifications: input.emailNotifications,
        inAppNotifications: input.inAppNotifications,
        slackNotifications: input.slackNotifications,
        slackWebhookUrl: input.slackWebhookUrl || null,
        teamsWebhookUrl: input.teamsWebhookUrl || null,
        jiraBaseUrl: input.jiraBaseUrl || null,
        attachmentPolicy: input.attachmentPolicy.trim() || "link-or-reference",
      },
    });
    return;
  }

  localSettings.set(input.workspaceId, {
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName.trim() || "Cheetah Time",
    defaultCurrencyCode,
    timezone: input.timezone.trim() || "Europe/Paris",
    fiscalYearStartMonth: input.fiscalYearStartMonth,
    emailNotifications: input.emailNotifications,
    inAppNotifications: input.inAppNotifications,
    slackNotifications: input.slackNotifications,
    slackWebhookUrl: input.slackWebhookUrl || null,
    teamsWebhookUrl: input.teamsWebhookUrl || null,
    jiraBaseUrl: input.jiraBaseUrl || null,
    attachmentPolicy: input.attachmentPolicy.trim() || "link-or-reference",
    updatedAt: new Date().toISOString(),
  });
}
