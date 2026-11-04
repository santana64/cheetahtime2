"use server";

import { revalidatePath } from "next/cache";

import { type FormState } from "@/features/projects/form-state";
import { getErrorMessage } from "@/lib/planning/errors";
import {
  buildMfaOtpAuthUrl,
  disableUserMfa,
  enableUserMfa,
  generateMfaSecret,
  requirePermission,
  requireCurrentSession,
} from "@/services/auth";
import { updateWorkspaceSettings } from "@/services/settings";

function text(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(formData: FormData, key: string, fallback: number) {
  const parsed = Number(formData.get(key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function checkbox(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

export async function updateWorkspaceSettingsAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requirePermission("settings:update");
    await updateWorkspaceSettings({
      workspaceId: session.workspaceId,
      workspaceName: text(formData, "workspaceName", "Cheetah Time"),
      defaultCurrencyCode: text(formData, "defaultCurrencyCode", "EUR"),
      timezone: text(formData, "timezone", "Europe/Paris"),
      fiscalYearStartMonth: numberValue(formData, "fiscalYearStartMonth", 1),
      emailNotifications: checkbox(formData, "emailNotifications"),
      inAppNotifications: checkbox(formData, "inAppNotifications"),
      slackNotifications: checkbox(formData, "slackNotifications"),
      slackWebhookUrl: text(formData, "slackWebhookUrl", ""),
      teamsWebhookUrl: text(formData, "teamsWebhookUrl", ""),
      jiraBaseUrl: text(formData, "jiraBaseUrl", ""),
      attachmentPolicy: text(formData, "attachmentPolicy", "link-or-reference"),
    });

    revalidatePath("/settings");
    revalidatePath("/projects");
    return { status: "success", message: "Parametres de l'espace mis a jour." };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible d'enregistrer les parametres.") };
  }
}

export async function generateMfaSecretAction(): Promise<FormState> {
  try {
    const session = await requireCurrentSession();
    const secret = generateMfaSecret();
    return {
      status: "success",
      message: `Secret MFA: ${secret} | URI: ${buildMfaOtpAuthUrl(session.email, secret)}`,
    };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible de generer un secret MFA.") };
  }
}

export async function enableMfaAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireCurrentSession();
    await enableUserMfa({
      userId: session.userId,
      secret: text(formData, "mfaSecret"),
      code: text(formData, "mfaCode"),
    });
    revalidatePath("/settings");
    return { status: "success", message: "MFA active pour votre compte." };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible d'activer le MFA.") };
  }
}

export async function disableMfaAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireCurrentSession();
    await disableUserMfa({
      userId: session.userId,
      code: text(formData, "mfaCode", ""),
    });
    revalidatePath("/settings");
    return { status: "success", message: "MFA desactive pour votre compte." };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error, "Impossible de desactiver le MFA.") };
  }
}
