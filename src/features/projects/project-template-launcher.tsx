"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createProjectFromTemplateAction } from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import type { ProjectTemplateSummary } from "@/services/templates";

export function ProjectTemplateLauncher({ templates }: { templates: ProjectTemplateSummary[] }) {
  const [state, action, pending] = useActionState(createProjectFromTemplateAction, initialFormState);

  if (!templates.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modeles</CardTitle>
          <p className="text-xs text-slate-500">
            Aucun modele encore. Enregistrez un projet comme modele depuis ses parametres.
          </p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Creer depuis un modele</CardTitle>
        <p className="text-xs text-slate-500">
          Lance un nouveau projet a partir d'une structure de planning deja capturee.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {templates.map((template) => (
          <form key={template.id} action={action} className="rounded-xl border border-slate-200 bg-white/80 p-3">
            <input type="hidden" name="templateId" value={template.id} />
            <div className="font-semibold text-slate-900">{template.name}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{template.description || "Modele projet Cheetah Time."}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input name="projectName" className="h-9 min-w-[220px] flex-1" placeholder={`${template.name} - Nouveau`} />
              <Button type="submit" size="sm" disabled={pending}>
                Utiliser
              </Button>
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
