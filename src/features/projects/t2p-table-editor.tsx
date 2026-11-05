"use client";

import { useActionState } from "react";

import { saveT2PLinesAction } from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import { FrenchDateInput } from "@/components/ui/french-date-input";
import { formatDateLabel } from "@/lib/format/formatters";
import type { T2PLine } from "@/types/planning";

/**
 * Tableau d'un T2P, une ligne par lot — transposition délai du B2PTable de
 * Cheetah Cost. Colonnes : Fi · PàD · Avancement · RàF · FP · Écart · Obs.
 * Dans un scénario correctif (T2Pi-2j / T2Pi-2), la FP et le RàF de chaque
 * lot se saisissent (comme dépenses / RàF côté coût) ; partout, l'observation.
 */
export function T2PTableEditor({
  projectId,
  tableId,
  lines,
  editablePlan,
  locked,
  unitLabel,
  ecarts,
}: {
  projectId: string;
  tableId: string;
  lines: T2PLine[];
  editablePlan: boolean;
  locked: boolean;
  unitLabel: string;
  /** Écart FP − PàD par lot (unité projet), calculé côté serveur. */
  ecarts: Record<string, number>;
}) {
  const [state, action, pending] = useActionState(saveT2PLinesAction, initialFormState);
  const fmt = (v: number) =>
    v === 0 ? `0 ${unitLabel}` : `${v > 0 ? "+" : "−"}${Math.abs(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${unitLabel}`;

  return (
    <form action={action} className="ct-card overflow-hidden">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="tableId" value={tableId} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-[12.5px]">
          <thead className="bg-[#f6f4ee]">
            <tr className="text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              <th className="px-3 py-2.5">Code</th>
              <th className="px-3 py-2.5">Lot de tâches</th>
              <th className="px-3 py-2.5">Fi</th>
              <th className="px-3 py-2.5">PàD</th>
              <th className="px-3 py-2.5 text-right">Avanc.</th>
              <th className="px-3 py-2.5 text-right">RàF ({unitLabel})</th>
              <th className="px-3 py-2.5">FP</th>
              <th className="px-3 py-2.5 text-right">Écart</th>
              <th className="px-3 py-2.5">Observations</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const e = ecarts[line.lotId] ?? 0;
              return (
                <tr key={line.lotId} className="border-t border-black/[0.05] align-middle">
                  <td className="ct-num px-3 py-2 text-slate-500">
                    <input type="hidden" name="lotId" value={line.lotId} />
                    {line.code}
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{line.libelle}</td>
                  <td className="ct-num px-3 py-2 text-slate-600">{formatDateLabel(line.finInitiale)}</td>
                  <td className="ct-num px-3 py-2 text-slate-600">{formatDateLabel(line.finADate)}</td>
                  <td className="ct-num px-3 py-2 text-right">{line.avancement} %</td>
                  <td className="px-3 py-2 text-right">
                    {editablePlan && !locked ? (
                      <input
                        type="number"
                        name={`raf:${line.lotId}`}
                        defaultValue={line.resteAFaire}
                        min={0}
                        step="any"
                        className="input-base h-8 w-24 text-right text-[12px]"
                        aria-label={`Reste à faire de ${line.libelle}`}
                      />
                    ) : (
                      <span className="ct-num">{line.resteAFaire.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editablePlan && !locked ? (
                      <FrenchDateInput name={`fp:${line.lotId}`} defaultValue={line.finPrevue} ariaLabel={`Fin prévue de ${line.libelle}`} className="w-40" />
                    ) : (
                      <span className="ct-num font-bold">{formatDateLabel(line.finPrevue)}</span>
                    )}
                  </td>
                  <td className={`ct-num whitespace-nowrap px-3 py-2 text-right font-black ${e > 0 ? "text-[#be123c]" : "text-[#047857]"}`}>{fmt(e)}</td>
                  <td className="px-3 py-2">
                    <input
                      name={`obs:${line.lotId}`}
                      defaultValue={line.commentaire ?? ""}
                      disabled={locked}
                      maxLength={500}
                      placeholder="—"
                      className="input-base h-8 min-w-[12rem] text-[12px] disabled:opacity-50"
                      aria-label={`Observations sur ${line.libelle}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!locked ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-black/[0.06] px-4 py-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer le tableau"}
          </Button>
          <span role="status" aria-live="polite" className="text-[12px] font-semibold">
            {state.status === "success" ? <span className="text-emerald-700">{state.message}</span> : null}
            {state.status === "error" ? <span className="text-rose-600">{state.message}</span> : null}
          </span>
          {editablePlan ? (
            <span className="ml-auto text-[11px] text-slate-500">
              Scénario : saisissez la fin prévue et le reste à faire visés pour chaque lot.
            </span>
          ) : (
            <span className="ml-auto text-[11px] text-slate-500">
              Prévision calculée par le moteur à la date du B2P : seules les observations se saisissent.
            </span>
          )}
        </div>
      ) : (
        <div className="border-t border-black/[0.06] px-4 py-3 text-[12px] text-slate-500">Tableau verrouillé.</div>
      )}
    </form>
  );
}
