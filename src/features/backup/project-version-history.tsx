"use client";

import { useTransition } from "react";

import { restoreProjectVersionAction } from "@/features/backup/actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/app/ui-kit";
import type { SnapshotInfo } from "@/services/backup-store";

const KIND_LABEL: Record<SnapshotInfo["kind"], string> = {
  auto: "Automatique",
  close: "Fermeture",
  manual: "Manuel",
  "pre-restore": "Avant restauration",
  "pre-import": "Avant import",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("fr-FR");
}

export function ProjectVersionHistory({
  projectId,
  snapshots,
}: {
  projectId: string;
  snapshots: SnapshotInfo[];
}) {
  const [pending, start] = useTransition();

  function restore(name: string) {
    if (
      !confirm(
        "Restaurer CE projet à cet état antérieur ? Le reste du portefeuille n'est pas modifié. Une sauvegarde de sécurité est créée avant.",
      )
    )
      return;
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("name", name);
    start(async () => {
      try {
        await restoreProjectVersionAction(fd);
      } catch (e) {
        alert("Restauration impossible : " + (e instanceof Error ? e.message : String(e)));
      }
    });
  }

  return (
    <Panel
      title="Historique des versions de ce projet"
      subtitle="Revenez à un état antérieur de CE projet uniquement (extrait d'un point de sauvegarde). Le reste du portefeuille est préservé."
      accent="#f4a321"
      aria-busy={pending}
    >
      {snapshots.length === 0 ? (
        <p className="text-[13px] text-slate-500">
          Aucun point de sauvegarde disponible pour l'instant — il s'en crée automatiquement à chaque enregistrement.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-1">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                <th className="px-3 py-1.5">Date</th>
                <th className="px-3 py-1.5">Type</th>
                <th className="px-3 py-1.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.name} className="rounded-xl" style={{ background: "rgba(15,23,42,0.025)" }}>
                  <td className="rounded-l-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800">{fmtDate(s.at)}</td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-500">{KIND_LABEL[s.kind]}</td>
                  <td className="rounded-r-xl px-3 py-2.5 text-right">
                    <Button type="button" variant="outline" size="sm" onClick={() => restore(s.name)} disabled={pending}>
                      Restaurer cette version
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
