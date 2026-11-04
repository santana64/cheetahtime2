"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/features/projects/form-state";
import { updateWorkspaceSettingsAction } from "@/features/settings/actions";
import type { WorkspaceSettingsView } from "@/services/settings";
import { cn } from "@/lib/utils";

function Toggle({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/70 p-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 size-4 rounded border-slate-300 accent-[#56a45b]"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span>
      </span>
    </label>
  );
}

export function WorkspaceSettingsForm({ settings }: { settings: WorkspaceSettingsView }) {
  const [state, action, pending] = useActionState(updateWorkspaceSettingsAction, initialFormState);

  return (
    <form action={action} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#1a4a20]">Espace de travail</CardTitle>
          <p className="text-xs text-slate-500">
            Paramètres SaaS de base : nom, devise, fuseau horaire et exercice fiscal.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600 md:col-span-2">
            Nom de l'organisation / workspace
            <Input name="workspaceName" defaultValue={settings.workspaceName} className="h-10" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
            Devise par defaut
            <Input name="defaultCurrencyCode" maxLength={3} defaultValue={settings.defaultCurrencyCode} className="h-10" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
            Fuseau horaire
            <Input name="timezone" defaultValue={settings.timezone} className="h-10" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
            Mois de debut d'exercice fiscal
            <Input name="fiscalYearStartMonth" type="number" min={1} max={12} defaultValue={settings.fiscalYearStartMonth} className="h-10" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
            Politique pieces jointes
            <Input name="attachmentPolicy" defaultValue={settings.attachmentPolicy} className="h-10" />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#1a4a20]">Notifications et intégrations</CardTitle>
          <p className="text-xs text-slate-500">
            Les notifications in-app sont natives. E-mail, Slack, Teams et Jira se dispatchent via les webhooks/providers configures.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Toggle
              name="inAppNotifications"
              label="Notifications in-app"
              description="Mentions et événements visibles dans Cheetah Time."
              defaultChecked={settings.inAppNotifications}
            />
            <Toggle
              name="emailNotifications"
              label="Notifications e-mail"
              description="Envoi via CHEETAH_TIME_EMAIL_WEBHOOK_URL."
              defaultChecked={settings.emailNotifications}
            />
            <Toggle
              name="slackNotifications"
              label="Slack"
              description="Envoi vers le webhook configure."
              defaultChecked={settings.slackNotifications}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              Slack webhook
              <Input name="slackWebhookUrl" defaultValue={settings.slackWebhookUrl ?? ""} className="h-10" />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              Teams webhook
              <Input name="teamsWebhookUrl" defaultValue={settings.teamsWebhookUrl ?? ""} className="h-10" />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              Base URL Jira
              <Input name="jiraBaseUrl" defaultValue={settings.jiraBaseUrl ?? ""} className="h-10" />
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 p-4">
        <p
          className={cn(
            "text-xs",
            state.status === "error" && "text-rose-600",
            state.status === "success" && "text-emerald-700",
            state.status === "idle" && "text-slate-500",
          )}
        >
          {state.message || `Dernière mise à jour: ${new Date(settings.updatedAt).toLocaleString("fr-FR")}`}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement..." : "Enregistrer les paramètres"}
        </Button>
      </div>
    </form>
  );
}
