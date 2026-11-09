"use client";

import { useActionState } from "react";

import { updatePilotageSettingsAction } from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import { FrenchDateInput } from "@/components/ui/french-date-input";

/**
 * Paramètres de pilotage du temps :
 *  • date d'état (data date) — le reste à faire n'est jamais replanifié avant ;
 *  • coefficient du chemin pseudo-critique (CdC p. 4, « au choix du planificateur »).
 */
export function PilotageSettingsForm({
  projectId,
  statusDate,
  effectiveStatusDate,
  coefficient,
}: {
  projectId: string;
  statusDate: string | null;
  effectiveStatusDate: string | null;
  coefficient: number | null;
}) {
  const [state, action, pending] = useActionState(updatePilotageSettingsAction, initialFormState);
  return (
    <section className="ct-card overflow-hidden" aria-labelledby="pilotage-settings-title">
      <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg,#56a45b,#f4a321)" }} />
      <form action={action} className="space-y-4 p-5">
        <input type="hidden" name="projectId" value={projectId} />
        <div>
          <div className="section-label">Pilotage du temps</div>
          <h2 id="pilotage-settings-title" className="ct-title mt-0.5 text-[17px]">Date d&apos;état et chemin pseudo-critique</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-[12px] font-semibold text-slate-700">
            Date d&apos;état
            <FrenchDateInput name="statusDate" defaultValue={statusDate} ariaLabel="Date d'état" className="mt-1" />
            <span className="mt-1 block text-[11px] font-normal leading-4 text-slate-500">
              Le reste à faire est replanifié à partir de cette date (comme la « data date » de P6). Vide : date du jour dès
              que le PI est figé{effectiveStatusDate ? ` — actuellement ${new Date(`${effectiveStatusDate}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" })}` : ""}.
            </span>
          </label>
          <label className="block text-[12px] font-semibold text-slate-700">
            Coefficient pseudo-critique
            <input
              type="number"
              name="pseudoCriticalCoefficient"
              step="0.05"
              min="1"
              max="5"
              defaultValue={coefficient ?? 1.3}
              className="input-base mt-1"
            />
            <span className="mt-1 block text-[11px] font-normal leading-4 text-slate-500">
              Un LT est pseudo-critique si sa marge totale ≤ coefficient × la plus petite marge positive (1,3 par défaut).
            </span>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          <span role="status" aria-live="polite" className="text-[12px] font-semibold">
            {state.status === "success" ? <span className="text-emerald-700">{state.message}</span> : null}
            {state.status === "error" ? <span className="text-rose-600">{state.message}</span> : null}
          </span>
        </div>
      </form>
    </section>
  );
}
