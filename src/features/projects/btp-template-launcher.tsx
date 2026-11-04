"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createProjectFromBtpTemplateAction } from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import type { BtpTemplateDefinition } from "@/services/btp-templates";

export function BtpTemplateLauncher({
  templates,
  defaultStartDate,
}: {
  templates: BtpTemplateDefinition[];
  defaultStartDate: string;
}) {
  const [state, action, pending] = useActionState(
    createProjectFromBtpTemplateAction,
    initialFormState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Templates BTP / Infrastructure</CardTitle>
        <p className="text-xs text-slate-500">
          WBS, durées, ressources, dépendances, jalons et référentiel initial préchargés.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {templates.map((template) => (
          <form key={template.id} action={action} className="rounded-xl border border-slate-200 bg-white/80 p-3">
            <input type="hidden" name="templateId" value={template.id} />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">{template.name}</div>
                <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">{template.description}</p>
                <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {template.steps.length} lots/phases - {template.milestones.length} jalons - budget type {template.defaultBudget.toLocaleString("fr-FR")} EUR
                </div>
              </div>
              <Button type="submit" size="sm" disabled={pending}>
                Utiliser
              </Button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Input name="projectName" placeholder={`${template.name} - Nouveau projet`} className="h-9" />
              <Input name="targetStartDate" type="date" defaultValue={defaultStartDate} className="h-9" required />
              <Input name="clientName" placeholder="Client" className="h-9" />
              <Input name="sponsorName" placeholder="Sponsor" className="h-9" />
            </div>
          </form>
        ))}
        {state.status !== "idle" ? (
          <p className={state.status === "error" ? "text-xs text-rose-600" : "text-xs text-emerald-700"}>
            {state.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

