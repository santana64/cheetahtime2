"use client";

import { useActionState, useState } from "react";

import { advanceB2PAction } from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import { FrenchDateInput } from "@/components/ui/french-date-input";
import { formatDateLabel } from "@/lib/format/formatters";

export interface B2PAdvanceTaskRow {
  id: string;
  code: string;
  name: string;
  isProvision: boolean;
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE" | string;
  plannedStart: string | null;
  plannedFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  durationUnits: number;
}

type Etat = "NOT_STARTED" | "STARTED" | "DONE";

/**
 * Saisie guidée du passage au B2P suivant (CdC B1, façon SiteProgress d'Asta) :
 *  • LT commencés → date de début réelle + prévision de fin ;
 *  • LT finis → date de fin réelle ;
 *  • Provisions de Temps non franchies → nouvelle durée ;
 *  • nouveaux LT → bouton vers le planning.
 * La date d'état passe à la date du B2P, puis la prévision avant pilotage est figée.
 */
export function B2PAdvanceForm({
  projectId,
  nextB2PDate,
  b2pLabel,
  unitLabel,
  rows,
}: {
  projectId: string;
  nextB2PDate: string;
  b2pLabel: string;
  unitLabel: string;
  rows: B2PAdvanceTaskRow[];
}) {
  const [state, action, pending] = useActionState(advanceB2PAction, initialFormState);
  const [date, setDate] = useState(nextB2PDate);
  const [etats, setEtats] = useState<Record<string, Etat>>(() =>
    Object.fromEntries(
      rows.map((r) => [r.id, r.status === "DONE" ? "DONE" : r.status === "IN_PROGRESS" || r.actualStart ? "STARTED" : "NOT_STARTED"]),
    ),
  );
  const [showAll, setShowAll] = useState(false);

  // Par défaut : seulement les LT « concernés » (qui devaient démarrer avant la date du B2P, déjà commencés, ou PT).
  const relevant = rows.filter(
    (r) => showAll || r.isProvision || etats[r.id] !== "NOT_STARTED" || (r.plannedStart ?? "9999") <= date,
  );
  const counts = {
    started: Object.values(etats).filter((e) => e === "STARTED").length,
    done: Object.values(etats).filter((e) => e === "DONE").length,
  };

  return (
    <section id="saisie-b2p" className="ct-card scroll-mt-20 overflow-hidden" aria-labelledby="b2p-advance-title">
      <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg,#56a45b,#f4a321)" }} />
      <form action={action}>
        <input type="hidden" name="projectId" value={projectId} />
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-black/[0.06] px-5 py-4">
          <div>
            <div className="section-label">Passage au B2P suivant</div>
            <h2 id="b2p-advance-title" className="ct-title mt-0.5 text-[17px]">
              Saisie de l&apos;avancement au {b2pLabel}
            </h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-5 text-slate-500">
              Pour chaque LT : commencé (début réel + prévision de fin) ou fini (fin réelle). Les Provisions de Temps non
              franchies peuvent recevoir une nouvelle durée. La date d&apos;état passe à la date du B2P et le reste à faire
              est replanifié après cette date.
            </p>
          </div>
          <FrenchDateInput
            name="b2pDate"
            label="Date du B2P"
            defaultValue={date}
            onChange={setDate}
            required
            className="w-52"
          />
        </header>

        <div className="max-h-[520px] overflow-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-[#f6f4ee]">
              <tr className="text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2">LT</th>
                <th className="px-2 py-2">Prévu</th>
                <th className="px-2 py-2">État au B2P</th>
                <th className="px-2 py-2">Début réel</th>
                <th className="px-2 py-2">Prévision de fin</th>
                <th className="px-2 py-2">Fin réelle</th>
                <th className="px-2 py-2">Nouvelle durée (PT)</th>
              </tr>
            </thead>
            <tbody>
              {relevant.map((r) => {
                const etat = etats[r.id];
                return (
                  <tr key={r.id} className="border-t border-black/[0.05] align-middle">
                    <td className="px-4 py-2">
                      <input type="hidden" name="taskId" value={r.id} />
                      <div className="font-bold text-slate-900">
                        <span className="ct-num mr-1.5 text-[11px] text-slate-500">{r.code}</span>
                        {r.name}
                      </div>
                    </td>
                    <td className="ct-num whitespace-nowrap px-2 py-2 text-[11px] text-slate-500">
                      {formatDateLabel(r.plannedStart)} → {formatDateLabel(r.plannedFinish)}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        name={`etat:${r.id}`}
                        value={etat}
                        onChange={(e) => setEtats((prev) => ({ ...prev, [r.id]: e.target.value as Etat }))}
                        className="input-base h-8 min-w-[9.5rem] text-[12px]"
                        aria-label={`État de ${r.name}`}
                      >
                        <option value="NOT_STARTED">Non commencé</option>
                        <option value="STARTED">Commencé</option>
                        <option value="DONE">Fini</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <FrenchDateInput
                        name={`debut:${r.id}`}
                        defaultValue={r.actualStart ?? r.plannedStart ?? ""}
                        disabled={etat === "NOT_STARTED"}
                        ariaLabel={`Début réel de ${r.name}`}
                        className="w-40"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <FrenchDateInput
                        name={`prevfin:${r.id}`}
                        defaultValue={r.plannedFinish ?? ""}
                        disabled={etat !== "STARTED"}
                        ariaLabel={`Prévision de fin de ${r.name}`}
                        className="w-40"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <FrenchDateInput
                        name={`fin:${r.id}`}
                        defaultValue={r.actualFinish ?? ""}
                        disabled={etat !== "DONE"}
                        ariaLabel={`Fin réelle de ${r.name}`}
                        className="w-40"
                      />
                    </td>
                    <td className="px-2 py-2">
                      {r.isProvision && etat !== "DONE" ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            name={`duree:${r.id}`}
                            placeholder={String(r.durationUnits)}
                            className="input-base h-8 w-20 text-[12px]"
                            aria-label={`Nouvelle durée de ${r.name}`}
                          />
                          <span className="text-[11px] text-slate-500">{unitLabel}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {relevant.length === 0 ? (
            <p className="px-5 py-6 text-center text-[12.5px] text-slate-500">
              Aucun LT ne devait démarrer avant cette date. Affichez tous les LT pour saisir un démarrage anticipé.
            </p>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-black/[0.06] px-5 py-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : `Enregistrer le ${b2pLabel}`}
          </Button>
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[12px] font-semibold text-[#3f8f48] underline-offset-2 hover:underline">
            {showAll ? "Ne montrer que les LT concernés" : `Afficher tous les LT (${rows.length})`}
          </button>
          <a href={`/projects/${projectId}/planning`} className="text-[12px] font-semibold text-slate-600 underline-offset-2 hover:underline">
            + Ajouter un nouveau LT (Planning)
          </a>
          <span className="ml-auto text-[11.5px] text-slate-500">
            {counts.started} commencé(s) · {counts.done} fini(s)
          </span>
          <div role="status" aria-live="polite" className="w-full text-[12px] font-semibold">
            {state.status === "success" ? <span className="text-emerald-700">{state.message}</span> : null}
            {state.status === "error" ? <span className="text-rose-600">{state.message}</span> : null}
          </div>
        </footer>
      </form>
    </section>
  );
}
