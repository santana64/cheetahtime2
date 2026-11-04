"use client";

import { useActionState } from "react";

import { createProjectAction } from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function CreateProjectForm() {
  const [state, action, pending] = useActionState(
    createProjectAction,
    initialFormState,
  );

  return (
    <Card>
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
          Nouveau projet
        </div>
        <CardTitle className="text-xl">Ouvrir un espace de planification</CardTitle>
        <p className="text-xs leading-5 text-slate-500">
          Les nouveaux projets demarrent avec un calendrier de livraison vierge et
          une structure de travail minimale afin que l'espace de planification soit
          utilisable immediatement.
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        <form action={action} className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500 md:col-span-2">
            Nom du projet
            <Input name="name" placeholder="Deploiement Cheetah Time" required className="h-9 text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Client
            <Input name="clientName" placeholder="Organisation cliente" required className="h-9 text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Portefeuille
            <Input name="portfolio" placeholder="Portefeuille de transformation" required className="h-9 text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Responsable du projet
            <Input name="ownerName" placeholder="Responsable de livraison" required className="h-9 text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Commanditaire
            <Input name="sponsorName" placeholder="Commanditaire executif" required className="h-9 text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Debut cible
            <Input name="targetStartDate" type="date" required className="h-9 text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Fin cible
            <Input name="targetFinishDate" type="date" className="h-9 text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Budget
            <Input name="budgetAmount" type="number" min={0} defaultValue={250000} className="h-9 text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
            Devise
            <Select name="currencyCode" defaultValue="EUR">
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </Select>
          </label>
          <div className="md:col-span-2 flex items-center justify-between gap-4 border-t border-border/50 pt-4">
            <div
              className={
                state.status === "error"
                  ? "text-xs text-rose-600"
                  : "text-xs text-slate-400"
              }
            >
              {state.message || "Vous arriverez directement sur le tableau de bord du projet apres sa creation."}
            </div>
            <Button type="submit" disabled={pending} className="shrink-0">
              {pending ? "Creation en cours..." : "Creer le projet"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
