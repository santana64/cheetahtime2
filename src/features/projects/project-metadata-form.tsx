"use client";

import { useActionState } from "react";

import { updateProjectMetadataAction } from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectView } from "@/types/planning";

export function ProjectMetadataForm({ view }: { view: ProjectView }) {
  const [state, action, pending] = useActionState(
    updateProjectMetadataAction,
    initialFormState,
  );

  return (
    <Card>
      <CardHeader className="border-b border-border/50 pb-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
          Métadonnées du projet
        </div>
        <CardTitle className="text-base">Modifier les détails du projet</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <form action={action} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="projectId" value={view.aggregate.project.id} />
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500 md:col-span-2">
            Nom
            <Input name="name" defaultValue={view.aggregate.project.name} required className="h-8 text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Client
            <Input name="clientName" defaultValue={view.aggregate.project.clientName} required className="h-8 text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Portefeuille
            <Input name="portfolio" defaultValue={view.aggregate.project.portfolio} required className="h-8 text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Responsable
            <Input name="ownerName" defaultValue={view.aggregate.project.ownerName} required className="h-8 text-sm" />
          </label>
          {/* Cheetah Time = outil de délai : ni commanditaire, ni maître d'ouvrage (spec François). Valeur conservée en interne. */}
          <input type="hidden" name="sponsorName" defaultValue={view.aggregate.project.sponsorName} />
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500 md:col-span-2">
            Description
            <Textarea
              name="description"
              defaultValue={view.aggregate.project.description}
              className="min-h-[88px] text-sm"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Statut
            <Select name="status" defaultValue={view.aggregate.project.status}>
              <option value="PLANNING">Planification</option>
              <option value="ACTIVE">Actif</option>
              <option value="AT_RISK">À risque</option>
              <option value="ON_HOLD">En pause</option>
              <option value="COMPLETED">Terminé</option>
            </Select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Santé
            <Select name="health" defaultValue={view.aggregate.project.health}>
              <option value="ON_TRACK">Dans les temps</option>
              <option value="WATCH">Surveillance</option>
              <option value="AT_RISK">À risque</option>
              <option value="OFF_TRACK">En retard</option>
            </Select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Début cible
            <Input
              name="targetStartDate"
              type="date"
              defaultValue={view.aggregate.project.targetStartDate}
              required
              className="h-8 text-sm"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Fin cible
            <Input
              name="targetFinishDate"
              type="date"
              defaultValue={view.aggregate.project.targetFinishDate ?? ""}
              className="h-8 text-sm"
            />
          </label>
          {/* Cheetah Time = outil de délai : pas de champ coût. Valeurs conservées en interne. */}
          <input type="hidden" name="budgetAmount" defaultValue={view.aggregate.project.budgetAmount} />
          <input type="hidden" name="currencyCode" defaultValue={view.aggregate.project.currencyCode} />
          <div className="md:col-span-2 flex items-center justify-between gap-4 border-t border-border/50 pt-4">
            <div
              className={
                state.status === "error"
                  ? "text-xs text-rose-600"
                  : state.status === "success"
                    ? "text-xs text-emerald-600"
                    : "text-xs text-slate-400"
              }
            >
              {state.message || "Les modifications sont immédiatement répercutées sur le tableau de bord et le planning."}
            </div>
            <Button type="submit" disabled={pending} className="shrink-0">
              {pending ? "Enregistrement…" : "Enregistrer les métadonnées"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
