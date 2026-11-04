"use client";

import { projectSnapshotCommandAction } from "@/features/projects/actions";
import { Button } from "@/components/ui/button";
import type { AuditEvent, ProjectSnapshot } from "@/types/planning";

/**
 * Historique du projet — même contenu que la fenêtre « Historique » de
 * Cheetah Cost : journal d'audit et versions du projet (enregistrer,
 * restaurer, supprimer).
 */
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
        <form action={projectSnapshotCommandAction} className="mb-3 flex gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="command" value="enregistrer" />
          <input
            name="label"
            placeholder={`Version du ${new Date().toLocaleDateString("fr-FR")}`}
            aria-label="Nom de la version à enregistrer"
            className="input-base h-9 flex-1 text-[12.5px]"
          />
          <Button type="submit" size="sm">Enregistrer une version</Button>
        </form>
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
                action={projectSnapshotCommandAction}
                onSubmit={(e) => {
                  if (!window.confirm(`Restaurer la version « ${snap.label} » ?\nL'état actuel sera remplacé (enregistrez d'abord une version de l'état courant si besoin).`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="command" value="restaurer" />
                <input type="hidden" name="snapshotId" value={snap.id} />
                <button type="submit" className="rounded-md border border-[#56a45b]/40 bg-[#56a45b]/10 px-2.5 py-1 text-[11px] font-semibold text-[#2f7a37] hover:bg-[#56a45b]/20" aria-label={`Restaurer la version ${snap.label}`}>
                  Restaurer
                </button>
              </form>
              <form
                action={projectSnapshotCommandAction}
                onSubmit={(e) => {
                  if (!window.confirm(`Supprimer la version « ${snap.label} » ?`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="command" value="supprimer" />
                <input type="hidden" name="snapshotId" value={snap.id} />
                <button type="submit" className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:border-red-300" aria-label={`Supprimer la version ${snap.label}`}>
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
