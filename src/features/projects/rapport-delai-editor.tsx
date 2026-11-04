"use client";

import { useActionState } from "react";

import { rapportDelaiCommandAction, saveRapportDelaiAction } from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import type { RapportDelai } from "@/types/planning";

/** Éditeur d'un rapport R2Pi — mêmes zones que l'éditeur de rapport de Cheetah Cost. */
export function RapportDelaiEditor({ projectId, rapport, label }: { projectId: string; rapport: RapportDelai; label: string }) {
  const [state, action, pending] = useActionState(saveRapportDelaiAction, initialFormState);
  const diffuse = rapport.statut === "diffuse";
  return (
    <div className="ct-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] px-5 py-3">
        <div>
          <div className="section-label">Rapport de délai</div>
          <h2 className="ct-title text-[17px]">
            {label}{" "}
            <span
              className={`ml-1 rounded-full border px-2 py-0.5 align-middle text-[10.5px] font-bold ${
                diffuse ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {diffuse ? `Diffusé${rapport.diffuseLe ? ` · ${rapport.diffuseLe.slice(8, 10)}/${rapport.diffuseLe.slice(5, 7)}/${rapport.diffuseLe.slice(0, 4)}` : ""}` : "Brouillon"}
            </span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/projects/${projectId}/rapports-delai?id=${rapport.id}`} className="toolbar-btn" download>
            ↓ PDF
          </a>
          <form action={rapportDelaiCommandAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="rapportId" value={rapport.id} />
            <input type="hidden" name="command" value={diffuse ? "brouillon" : "diffuser"} />
            <Button size="sm" type="submit" variant={diffuse ? "outline" : "default"} title={diffuse ? "Repasser en brouillon" : "Diffuser et archiver le rapport"}>
              {diffuse ? "Repasser en brouillon" : "Diffuser"}
            </Button>
          </form>
          {!diffuse ? (
            <form action={rapportDelaiCommandAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="rapportId" value={rapport.id} />
              <input type="hidden" name="command" value="supprimer" />
              <Button size="sm" variant="ghost" type="submit" className="text-rose-700 hover:bg-rose-50">Supprimer</Button>
            </form>
          ) : null}
        </div>
      </div>

      <form action={action} className="space-y-4 p-5">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="rapportId" value={rapport.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-[11px] font-semibold text-slate-600">
            Référence
            <input name="reference" defaultValue={rapport.reference ?? ""} disabled={diffuse} placeholder="Réf. documentaire" className="input-base mt-1" />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Auteur
            <input name="auteur" defaultValue={rapport.auteur ?? ""} disabled={diffuse} placeholder="Nom" className="input-base mt-1" />
          </label>
        </div>
        {rapport.sections.map((section) => (
          <div key={section.id}>
            <input type="hidden" name="sectionId" value={section.id} />
            <div className="mb-1 flex items-center gap-2">
              <label htmlFor={`sec-${section.id}`} className="text-[13px] font-black text-[#0d1f10]">
                {section.titre}
              </label>
              {section.auto ? (
                <span className="rounded-full border border-[#56a45b]/30 bg-[#56a45b]/10 px-2 py-0.5 text-[10px] font-bold text-[#1a4a20]">
                  pré-rempli depuis le tableau B2P
                </span>
              ) : null}
            </div>
            <textarea
              id={`sec-${section.id}`}
              name={`section:${section.id}`}
              defaultValue={section.contenu}
              disabled={diffuse}
              rows={section.auto ? 14 : 5}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] leading-5 text-slate-900 outline-none focus:border-[#56a45b] disabled:bg-slate-50"
              style={section.auto ? { fontFamily: "var(--font-mono)", fontSize: 11.5 } : undefined}
            />
          </div>
        ))}
        {!diffuse ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer le rapport"}</Button>
            <span role="status" aria-live="polite" className="text-[12px] font-semibold">
              {state.status === "success" ? <span className="text-emerald-700">{state.message}</span> : null}
              {state.status === "error" ? <span className="text-rose-600">{state.message}</span> : null}
            </span>
          </div>
        ) : (
          <p className="text-[12px] text-slate-500">Rapport diffusé : repassez-le en brouillon pour le modifier.</p>
        )}
      </form>
      {!diffuse ? (
        <form action={rapportDelaiCommandAction} className="border-t border-black/[0.06] px-5 py-3">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="rapportId" value={rapport.id} />
          <input type="hidden" name="command" value="regenerer" />
          <button type="submit" className="text-[12px] font-semibold text-[#3f8f48] hover:underline">
            ↻ Régénérer le §3 depuis le tableau B2P (les autres sections sont conservées)
          </button>
        </form>
      ) : null}
    </div>
  );
}
