"use client";

import { useState } from "react";

import { deleteAssignmentAction, saveAssignmentDirectAction } from "@/features/projects/actions";
import { Button } from "@/components/ui/button";
import type { Assignment, Resource } from "@/types/planning";

/**
 * Édition des RESSOURCES d'un LT depuis l'inspecteur du planning (spec François 29/08 :
 * pouvoir revenir sur les prédécesseurs ET les ressources d'un LT après création, sans
 * repasser par « Nouveau projet »). Intensité : 1 = plein temps · 0,5 = mi-temps · 2 = deux personnes.
 */
export function LtResourceEditor({
  projectId,
  taskId,
  resources,
  assignments,
}: {
  projectId: string;
  taskId: string;
  resources: Resource[];
  assignments: Assignment[];
}) {
  const mine = assignments.filter((a) => a.taskId === taskId);
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "");
  const [intensity, setIntensity] = useState("1");
  const allocationPct = Math.max(0, Math.round((Number(intensity.replace(",", ".")) || 0) * 100));
  const nameOf = (rid: string) => {
    const r = resources.find((x) => x.id === rid);
    return r ? `${r.code ? `${r.code} · ` : ""}${r.name}` : rid;
  };

  return (
    <div className="space-y-3 border-t border-border/70 pt-5">
      <div>
        <div className="text-sm font-semibold text-slate-900">Ressources du LT</div>
        <p className="mt-1 text-sm text-slate-600">
          Affectez des ressources et leur intensité (1 = plein temps · 0,5 = mi-temps · 2 = deux personnes).
        </p>
      </div>

      {mine.length ? (
        <div className="space-y-1.5">
          {mine.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-[13px]"
            >
              <span className="min-w-0 truncate font-medium text-slate-800">{nameOf(a.resourceId)}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums font-semibold text-[#2a6b30]">
                  intensité{" "}
                  {(a.allocationPct / 100).toLocaleString("fr-FR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <form action={deleteAssignmentAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="assignmentId" value={a.id} />
                  <button type="submit" className="text-slate-400 hover:text-rose-500" title="Retirer cette ressource">
                    ×
                  </button>
                </form>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-slate-400">Aucune ressource affectée à ce LT.</p>
      )}

      {resources.length ? (
        <form action={saveAssignmentDirectAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="allocationPct" value={allocationPct} />
          <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Ressource
            <select
              name="resourceId"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-[#56a45b]"
            >
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code ? `${r.code} · ` : ""}
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Intensité
            <input
              value={intensity}
              inputMode="decimal"
              onChange={(e) => setIntensity(e.target.value)}
              className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-sm tabular-nums outline-none focus:border-[#56a45b]"
            />
          </label>
          <Button type="submit" variant="outline" size="sm">
            Affecter
          </Button>
        </form>
      ) : (
        <p className="text-[13px] text-slate-400">Créez d'abord des ressources dans l'onglet Ressources.</p>
      )}
    </div>
  );
}
