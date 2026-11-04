"use client";

import { useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { projectSnapshotCommandAction } from "@/features/projects/actions";
import { Button } from "@/components/ui/button";
import type { AuditEvent, ProjectSnapshot } from "@/types/planning";

/**
 * Historique du projet — même contenu que la fenêtre « Historique » de
 * Cheetah Cost : journal d'audit et versions du projet (enregistrer,
 * restaurer, supprimer).
 */
const noopSubscribe = () => () => {};

const ACTION_LABEL: Record<AuditEvent["action"], string> = {
  project_created: "Projet",
  project_updated: "Projet",
  lots_updated: "Structure / LT",
  plan_updated: "Planning B2P",
  b2p_created: "Tableau B2P",
  b2p_deleted: "Tableau B2P",
  b2p_saved: "Tableau B2P",
  b2p_promoted: "Tableau B2P",
  b2p_locked: "Tableau B2P",
  b2p_unlocked: "Tableau B2P",
  export_created: "Export",
  rapport_created: "Rapport",
  rapport_updated: "Rapport",
  rapport_diffused: "Rapport",
  rapport_deleted: "Rapport",
  version_saved: "Version",
  version_restored: "Version",
  version_deleted: "Version",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ProjectHistory({
  projectId,
  auditTrail,
  snapshots,
}: {
  projectId: string;
  auditTrail: AuditEvent[];
  snapshots: (Omit<ProjectSnapshot, "payload"> & { sizeKb: number })[];
}) {
  // Restaurer / Supprimer restent inactifs tant que la page n'est pas hydratée :
  // sinon le formulaire partirait sans la fenêtre de confirmation.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Soumission pilotée côté client : on attend la fin de l'action puis on force
  // un rafraîchissement, pour que la liste reflète toujours l'état enregistré
  // (le routeur peut sinon écarter le résultat d'une action et garder l'ancien écran).
  function submit(event: FormEvent<HTMLFormElement>, confirmMessage?: string) {
    event.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      try {
        await projectSnapshotCommandAction(formData);
        if (formData.get("command") === "enregistrer") form.reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "L'opération a échoué.");
      }
      router.refresh();
    });
  }
  const locked = !hydrated || pending;
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="ct-card p-5" aria-labelledby="journal-audit">
        <div className="mb-3 flex items-center gap-2">
          <h2 id="journal-audit" className="text-[13px] font-bold text-slate-800">Journal d&apos;audit</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{auditTrail.length}</span>
        </div>
        <ol className="max-h-[640px] space-y-1.5 overflow-y-auto pr-1">
          {auditTrail.map((event) => (
            <li key={event.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-semibold text-slate-800">{event.label}</span>
                <span className="flex-shrink-0 text-[10px] text-slate-400">{fmt(event.at)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-600">{ACTION_LABEL[event.action] ?? event.action}</span>
                <span>· {event.actor}</span>
                {event.details ? <span>· {event.details}</span> : null}
              </div>
            </li>
          ))}
          {!auditTrail.length ? (
            <li className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-[12px] text-slate-400">Aucun événement enregistré.</li>
          ) : null}
        </ol>
      </section>

      <section className="ct-card p-5" aria-labelledby="versions-projet">
        <div className="mb-3 flex items-center gap-2">
          <h2 id="versions-projet" className="text-[13px] font-bold text-slate-800">Versions du projet</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{snapshots.length}</span>
        </div>
        <form onSubmit={(e) => submit(e)} className="mb-3 flex gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="command" value="enregistrer" />
          <input
            name="label"
            placeholder={`Version du ${new Date().toLocaleDateString("fr-FR")}`}
            aria-label="Nom de la version à enregistrer"
            className="input-base h-9 flex-1 text-[12.5px]"
          />
          <Button type="submit" size="sm" disabled={locked}>{pending ? "Enregistrement…" : "Enregistrer une version"}</Button>
        </form>
        {error ? <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p> : null}
        <ul className="space-y-1.5">
          {snapshots.map((snap) => (
            <li key={snap.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[12px] font-semibold text-slate-800">{snap.label}</span>
                  <span className="flex-shrink-0 text-[10px] text-slate-400">{fmt(snap.at)}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {snap.t2pCount} tableau(x) B2P · {snap.lotsCount} LT · {snap.sizeKb} Ko
                </div>
              </div>
              <form
                onSubmit={(e) =>
                  submit(e, `Restaurer la version « ${snap.label} » ?\nL'état actuel sera remplacé (enregistrez d'abord une version de l'état courant si besoin).`)
                }
              >
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="command" value="restaurer" />
                <input type="hidden" name="snapshotId" value={snap.id} />
                <button type="submit" disabled={locked} className="rounded-md disabled:opacity-50 border border-[#56a45b]/40 bg-[#56a45b]/10 px-2.5 py-1 text-[11px] font-semibold text-[#2f7a37] hover:bg-[#56a45b]/20" aria-label={`Restaurer la version ${snap.label}`}>
                  Restaurer
                </button>
              </form>
              <form onSubmit={(e) => submit(e, `Supprimer la version « ${snap.label} » ?`)}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="command" value="supprimer" />
                <input type="hidden" name="snapshotId" value={snap.id} />
                <button type="submit" disabled={locked} className="rounded-md disabled:opacity-50 border border-slate-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:border-red-300" aria-label={`Supprimer la version ${snap.label}`}>
                  ✕
                </button>
              </form>
            </li>
          ))}
          {!snapshots.length ? (
            <li className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-[12px] text-slate-400">
              Aucune version enregistrée. Cliquez sur « Enregistrer une version » pour figer l&apos;état actuel.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
