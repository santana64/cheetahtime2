"use client";

import { useActionState } from "react";

import {
  deleteProjectAction,
  duplicateProjectAction,
  setProjectArchiveStateAction,
} from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { ProjectOriginBadge, ProjectStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ProjectView } from "@/types/planning";

export function ProjectOperationsPanel({ view }: { view: ProjectView }) {
  const [duplicateState, duplicateAction, duplicatePending] = useActionState(
    duplicateProjectAction,
    initialFormState,
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    setProjectArchiveStateAction,
    initialFormState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteProjectAction,
    initialFormState,
  );
  const isArchived = Boolean(view.aggregate.project.archivedAt);

  return (
    <Card className="border-white/70 bg-white/95">
      <CardHeader>
        <CardTitle className="text-xl">Operations projet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <ProjectStatusBadge status={view.aggregate.project.status} />
          <ProjectOriginBadge origin={view.aggregate.project.origin} />
          {isArchived ? (
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
              Archive
            </span>
          ) : null}
        </div>
        {view.aggregate.project.sourceProjectId ? (
          <div className="text-sm text-slate-600">
            Ce scenario conserve une filiation vers le projet source pour l'archivage et les exports.
          </div>
        ) : null}

        <form action={duplicateAction} className="space-y-3 rounded-2xl border border-border/70 bg-slate-50 p-4">
          <input type="hidden" name="projectId" value={view.aggregate.project.id} />
          <input type="hidden" name="duplicatedBy" value={view.aggregate.project.ownerName} />
          <div>
            <div className="text-sm font-semibold text-slate-950">Dupliquer le projet</div>
            <p className="mt-1 text-sm text-slate-600">
              Creez un bac a sable de planification avec le meme perimetre, la meme logique et les memes ressources.
            </p>
          </div>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Nom du nouveau projet
            <Input
              name="duplicateName"
              defaultValue={`${view.aggregate.project.name} Copie`}
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <div
              className={
                duplicateState.status === "error"
                  ? "text-sm text-rose-700"
                  : "text-sm text-slate-500"
              }
            >
              {duplicateState.message || "La duplication cree un scenario de planification avec son propre historique exportable."}
            </div>
            <Button type="submit" variant="outline" disabled={duplicatePending}>
              {duplicatePending ? "Duplication..." : "Dupliquer"}
            </Button>
          </div>
        </form>

        <div className="rounded-2xl border border-border/70 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-950">Exporter le paquet projet</div>
          <p className="mt-1 text-sm text-slate-600">
            Telechargez le projet en JSON pour les snapshots internes, ou en MSPDI XML pour les echanges serieux avec d'autres outils de planning.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`/api/projects/${view.aggregate.project.id}/export`}>Exporter en JSON</a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/projects/${view.aggregate.project.id}/export?format=mspdi`}>
                Exporter en MSPDI XML
              </a>
            </Button>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            L'export natif `.mpp` n'est pas disponible dans le bridge open source actuel. Utilisez MSPDI XML pour les echanges aller-retour.
          </div>
        </div>

        <form action={archiveAction} className="space-y-3 rounded-2xl border border-border/70 bg-slate-50 p-4">
          <input type="hidden" name="projectId" value={view.aggregate.project.id} />
          <input type="hidden" name="actor" value={view.aggregate.project.ownerName} />
          <input type="hidden" name="archived" value={String(!isArchived)} />
          <div>
            <div className="text-sm font-semibold text-slate-950">
              {isArchived ? "Restaurer dans le portefeuille actif" : "Archiver le projet"}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {isArchived
                ? "La restauration remet le projet dans les vues actives sans modifier son planning."
                : "L'archivage retire le projet du portefeuille actif tout en conservant l'historique complet."}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div
              className={
                archiveState.status === "error"
                  ? "text-sm text-rose-700"
                  : archiveState.status === "success"
                    ? "text-sm text-emerald-700"
                    : "text-sm text-slate-500"
              }
            >
              {archiveState.message ||
                (isArchived
                  ? `Archive par ${view.aggregate.project.archivedBy ?? "l'equipe"}.`
                  : "Les projets actifs restent visibles dans le portefeuille et les consolidations du tableau de bord.")}
            </div>
            <Button type="submit" variant="outline" disabled={archivePending}>
              {archivePending
                ? "Mise a jour..."
                : isArchived
                  ? "Restaurer"
                  : "Archiver"}
            </Button>
          </div>
        </form>

        <form action={deleteAction} className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
          <input type="hidden" name="projectId" value={view.aggregate.project.id} />
          <div>
            <div className="text-sm font-semibold text-rose-900">Supprimer definitivement</div>
            <p className="mt-1 text-sm text-rose-800">
              Cette operation retire le projet entier de la couche de persistance configuree, y compris taches, dependances, ressources, affectations, baselines et historique.
            </p>
          </div>
          <label className="grid gap-2 text-sm font-medium text-rose-900">
            Saisissez <span className="font-semibold">{view.aggregate.project.name}</span> pour confirmer
            <Input
              name="confirmationName"
              placeholder={view.aggregate.project.name}
              className="border-rose-200 bg-white"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <div
              className={
                deleteState.status === "error"
                  ? "text-sm text-rose-700"
                  : "text-sm text-rose-800"
              }
            >
              {deleteState.message || "N'utilisez la suppression que si le projet doit sortir completement de l'espace beta."}
            </div>
            <Button type="submit" variant="destructive" disabled={deletePending}>
              {deletePending ? "Suppression..." : "Supprimer le projet"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
