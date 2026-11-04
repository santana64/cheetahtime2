"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  backupNowAction,
  importBackupAction,
  manualSnapshotAction,
  restoreSnapshotAction,
  setExternalFolderAction,
} from "@/features/backup/actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/app/ui-kit";
import type { BackupConfig, SnapshotInfo } from "@/services/backup-store";

type DesktopBackupApi = {
  chooseFolder: () => Promise<string | null>;
  revealBackups?: () => void;
};
function desktopApi(): DesktopBackupApi | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { cheetahBackup?: DesktopBackupApi }).cheetahBackup ?? null;
}

const KIND_LABEL: Record<SnapshotInfo["kind"], string> = {
  auto: "Automatique",
  close: "Fermeture",
  manual: "Manuel",
  "pre-restore": "Avant restauration",
  "pre-import": "Avant import",
};
const KIND_TONE: Record<SnapshotInfo["kind"], string> = {
  auto: "#56a45b",
  close: "#3f8f48",
  manual: "#f4a321",
  "pre-restore": "#b45309",
  "pre-import": "#b45309",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("fr-FR");
}
function fmtSize(b: number) {
  if (b >= 1_000_000) return `${(b / 1_000_000).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(b / 1024))} Ko`;
}

export function BackupManager({
  snapshots,
  config,
}: {
  snapshots: SnapshotInfo[];
  config: BackupConfig;
}) {
  const [pending, start] = useTransition();
  const [desktop, setDesktop] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState<string | null>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDesktop(Boolean(desktopApi()));
  }, []);

  function run(action: () => Promise<void>) {
    start(async () => {
      try {
        await action();
      } catch (e) {
        alert("Opération impossible : " + (e instanceof Error ? e.message : String(e)));
      }
    });
  }

  function snapshotNow() {
    run(() => manualSnapshotAction(new FormData()));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setFileContent(await f.text());
  }
  function doImport() {
    if (!fileContent) return;
    if (!confirm("Importer cette sauvegarde REMPLACE tout le portefeuille actuel. Une sauvegarde de sécurité est créée avant. Continuer ?")) return;
    const fd = new FormData();
    fd.set("content", fileContent);
    run(async () => {
      await importBackupAction(fd);
      setFileContent(null);
      setFileName("");
    });
  }

  function restore(name: string) {
    if (!confirm("Restaurer ce point de sauvegarde REMPLACE tout le portefeuille actuel. Une sauvegarde de sécurité est créée avant. Continuer ?")) return;
    const fd = new FormData();
    fd.set("name", name);
    run(() => restoreSnapshotAction(fd));
  }

  async function chooseFolderDesktop() {
    const api = desktopApi();
    if (!api) return;
    const folder = await api.chooseFolder();
    if (!folder) return;
    const fd = new FormData();
    fd.set("folder", folder);
    run(() => setExternalFolderAction(fd));
  }
  function saveFolderText() {
    const fd = new FormData();
    fd.set("folder", folderRef.current?.value ?? "");
    run(() => setExternalFolderAction(fd));
  }
  function clearFolder() {
    const fd = new FormData();
    fd.set("folder", "");
    run(() => setExternalFolderAction(fd));
  }
  function backupNow() {
    run(() => backupNowAction(new FormData()));
  }

  const autoCount = snapshots.filter((s) => s.kind === "auto").length;
  const last = snapshots[0];

  return (
    <div className="space-y-5" aria-busy={pending}>
      {/* 1 · Sauvegarde automatique */}
      <Panel
        title="Sauvegarde automatique sur ce poste"
        subtitle="Des copies horodatées sont créées à chaque enregistrement et à la fermeture. Si le fichier principal est corrompu (coupure de courant, arrêt brutal), le dernier bon état est restauré automatiquement au démarrage."
        accent="linear-gradient(90deg,#56a45b,#f4a321)"
        actions={
          <Button type="button" onClick={snapshotNow} disabled={pending}>
            Créer une sauvegarde maintenant
          </Button>
        }
      >
        <div className="flex flex-wrap gap-6 text-[13px] text-slate-600">
          <div>
            <div className="text-2xl font-black text-[#1a4a20]">{snapshots.length}</div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">points de sauvegarde</div>
          </div>
          <div>
            <div className="text-2xl font-black text-[#1a4a20]">{autoCount}</div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">automatiques (rotation 40)</div>
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">{last ? fmtDate(last.at) : "—"}</div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">dernière sauvegarde</div>
          </div>
        </div>
      </Panel>

      {/* 2 · Export / Import */}
      <Panel
        title="Export / Import d'une sauvegarde complète"
        subtitle="Enregistrez tout le portefeuille dans un fichier (archivage, envoi par mail) ou restaurez depuis un fichier."
        accent="#56a45b"
        bodyClassName="space-y-3"
      >
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/backup/export"
            download
            className="inline-flex items-center gap-2 rounded-lg bg-[#56a45b] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            ↓ Exporter la sauvegarde (.json)
          </a>
          <span className="text-[12px] text-slate-400">Télécharge un fichier daté contenant tous les projets.</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-black/5 bg-slate-50/60 p-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-[#56a45b]">
            Choisir un fichier…
            <input type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
          </label>
          <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">{fileName || "Aucun fichier sélectionné"}</span>
          <Button type="button" variant="outline" onClick={doImport} disabled={!fileContent || pending}>
            Importer / Restaurer
          </Button>
        </div>
      </Panel>

      {/* 3 · Dossier externe */}
      <Panel
        title="Dossier de sauvegarde externe (Drive / OneDrive / USB)"
        subtitle="Chaque sauvegarde est recopiée automatiquement dans le dossier choisi — une copie hors machine, sans cloud propriétaire."
        accent="#f4a321"
        bodyClassName="space-y-3"
      >
        <div className="rounded-xl border border-black/5 bg-slate-50/60 p-3">
          <div className="mb-2 text-[12px] text-slate-500">
            Dossier actuel :{" "}
            <span className="font-mono text-[12px] font-semibold text-slate-800">
              {config.externalFolder || "— aucun —"}
            </span>
          </div>
          {desktop ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={chooseFolderDesktop} disabled={pending}>
                Choisir un dossier…
              </Button>
              {config.externalFolder && (
                <>
                  <Button type="button" variant="outline" onClick={backupNow} disabled={pending}>
                    Sauvegarder maintenant dans le dossier
                  </Button>
                  <Button type="button" variant="outline" onClick={clearFolder} disabled={pending}>
                    Retirer le dossier
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={folderRef}
                defaultValue={config.externalFolder ?? ""}
                placeholder="Chemin du dossier (ex. C:\\Users\\...\\OneDrive\\Sauvegardes)"
                className="min-w-[260px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-[#56a45b]"
              />
              <Button type="button" onClick={saveFolderText} disabled={pending}>
                Enregistrer le dossier
              </Button>
              {config.externalFolder && (
                <Button type="button" variant="outline" onClick={backupNow} disabled={pending}>
                  Sauvegarder maintenant
                </Button>
              )}
              <p className="w-full text-[11px] text-slate-400">
                Le sélecteur de dossier natif est disponible dans l'application bureau. Ici, saisissez le chemin manuellement.
              </p>
            </div>
          )}
        </div>
      </Panel>

      {/* 4 · Historique des points de sauvegarde */}
      <Panel
        title="Points de sauvegarde"
        subtitle="Restaurez tout le portefeuille à un état antérieur. Une sauvegarde de sécurité de l'état courant est créée avant chaque restauration."
        accent="#56a45b"
      >
        {snapshots.length === 0 ? (
          <p className="text-[13px] text-slate-500">Aucun point de sauvegarde pour l'instant — il s'en créera automatiquement dès le prochain enregistrement.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-1">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  <th className="px-3 py-1.5">Date</th>
                  <th className="px-3 py-1.5">Type</th>
                  <th className="px-3 py-1.5">Taille</th>
                  <th className="px-3 py-1.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.name} className="rounded-xl" style={{ background: "rgba(15,23,42,0.025)" }}>
                    <td className="rounded-l-xl px-3 py-2.5 text-[13px] font-semibold text-slate-800">{fmtDate(s.at)}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
                        style={{ background: `${KIND_TONE[s.kind]}22`, color: KIND_TONE[s.kind] }}
                      >
                        {KIND_LABEL[s.kind]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-500">{fmtSize(s.sizeBytes)}</td>
                    <td className="rounded-r-xl px-3 py-2.5 text-right">
                      <Button type="button" variant="outline" size="sm" onClick={() => restore(s.name)} disabled={pending}>
                        Restaurer
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
