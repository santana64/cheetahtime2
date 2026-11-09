"use client";

import { useActionState } from "react";

import { saveB2PDatesAction } from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import { FrenchDateInput } from "@/components/ui/french-date-input";
import { formatDateLabel } from "@/lib/format/formatters";

/**
 * Onglet « Dates des B2P » — même écran que Cheetah Cost : une carte par B2P
 * (B2P0 = lancement), modification de la date, « Ajouter un B2P » (retard
 * projet), « Réinitialiser FGF » et écarts à la règle FGF.
 */
export function B2PDatesEditor({
  projectId,
  dates,
  recommended,
  cadenceLabel,
  cadenceExplanation,
  warnings,
  startedDates,
  projectStart,
}: {
  projectId: string;
  dates: string[];
  recommended: string[];
  cadenceLabel: string;
  cadenceExplanation?: string;
  warnings: string[];
  startedDates: string[];
  projectStart: string;
}) {
  const [state, action, pending] = useActionState(saveB2PDatesAction, initialFormState);
  return (
    <form action={action} className="ct-card p-5">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="recommended" value={JSON.stringify(recommended)} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-bold text-slate-800">Dates de déclenchement B2P</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">Modifiez les dates ou recalez sur la règle FGF</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" type="submit" name="intent" value="add" disabled={pending}>
            + Ajouter un B2P
          </Button>
          <Button size="sm" variant="outline" type="submit" name="intent" value="reset" disabled={pending}>
            Réinitialiser FGF
          </Button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[11px] text-emerald-800">
        <strong>{cadenceLabel}</strong>
        {cadenceExplanation ? ` · ${cadenceExplanation}` : ""} · <strong>{Math.max(0, dates.length - 1)} B2P</strong> + B2P0
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {dates.map((date, i) => {
          const started = startedDates.includes(date) || i === 0;
          return (
            <div
              key={`${i}-${date}`}
              className={`block rounded-xl border p-3.5 ${started ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-slate-50/80"}`}
            >
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                {i === 0 ? "B2P0 — lancement" : `B2P${i} — déclenchement`}
              </span>
              <FrenchDateInput name="date" defaultValue={date} min={projectStart} ariaLabel={i === 0 ? "B2P0" : `B2P${i}`} />
              <span className="mt-2 flex items-center justify-between text-[10px]">
                <span className={started ? "font-semibold text-emerald-700" : "text-slate-400"}>
                  {started ? "✓ Tableau démarré" : "À démarrer"}
                </span>
                <span className="text-slate-400">{formatDateLabel(date)}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" name="intent" value="save" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer les dates"}
        </Button>
        <span role="status" aria-live="polite" className="text-[12px] font-semibold">
          {state.status === "success" ? <span className="text-emerald-700">{state.message}</span> : null}
          {state.status === "error" ? <span className="text-rose-600">{state.message}</span> : null}
        </span>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <div className="mb-1.5 text-[11px] font-semibold text-amber-900">Écart à la règle FGF ({warnings.length})</div>
          {warnings.slice(0, 5).map((w) => (
            <div key={w} className="pl-4 text-[11px] text-amber-800">
              {w}
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
