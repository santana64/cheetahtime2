import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createRapportDelaiAction } from "@/features/projects/actions";
import { RapportDelaiEditor } from "@/features/projects/rapport-delai-editor";
import { getRapportDelaiLabel, getRapportStatutLabel, getRepresentativeTables, sortRapportsDelai } from "@/lib/fgf/rapports-delai";
import { getT2PDescriptor, getT2PLabel } from "@/lib/fgf/t2p";
import { formatDateLabel } from "@/lib/format/formatters";
import { getProjectView } from "@/services/projects";

/**
 * Onglet « Rapports de délais » (CdC p. 12 : « Rapports de coûts » → « Rapports
 * de délais ») — même écran que Cheetah Cost : rapports à rédiger (un par B2P),
 * archive consultable, éditeur, PDF et modèle vierge.
 */
export default async function RapportsDelaiPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ r?: string; q?: string }>;
}) {
  const { projectId } = await params;
  const { r, q } = await searchParams;
  const view = await getProjectView(projectId).catch(() => notFound());
  const project = view.aggregate.project;
  const rapports = sortRapportsDelai(project.rapportsDelai ?? []);
  const reps = getRepresentativeTables(project.t2pTables ?? []);
  const aRediger = reps.filter((t) => !rapports.some((rp) => rp.numero === t.numero));
  const query = (q ?? "").trim().toLowerCase();
  const archive = query
    ? rapports.filter((rp) =>
        [getRapportDelaiLabel(rp.numero), getRapportStatutLabel(rp.statut), rp.reference, rp.auteur, ...rp.sections.map((s) => s.contenu)]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : rapports;
  const selected = rapports.find((rp) => rp.id === r) ?? null;

  return (
    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="ct-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-slate-800">Rapports de délais</h2>
            <a href={`/api/projects/${projectId}/rapports-delai?modele=1`} className="toolbar-btn" download title="Télécharger le modèle vierge du rapport de délai">
              ↓ Modèle vierge
            </a>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">À la fin de chaque B2P, on rédige le R2Pi ; sa partie délai est archivée ici.</p>
        </section>

        <section className="ct-card p-4">
          <div className="section-label">À rédiger ({aRediger.length})</div>
          {aRediger.length ? (
            <ul className="mt-2 space-y-2">
              {aRediger.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div>
                    <div className="text-[12.5px] font-bold text-slate-900">{getRapportDelaiLabel(t.numero)}</div>
                    <div className="text-[10.5px] text-slate-500">
                      {getT2PLabel(t)} · {getT2PDescriptor(t.tableKind)} · {formatDateLabel(t.date)}
                    </div>
                  </div>
                  <form action={createRapportDelaiAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="t2pId" value={t.id} />
                    <Button size="sm" type="submit">Rédiger</Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-slate-500">
              {reps.length ? "Tous les B2P ont leur rapport." : "Aucun tableau B2P : créez d'abord le B2P0 dans « Tableaux B2P »."}
            </p>
          )}
        </section>

        <section className="ct-card p-4">
          <div className="section-label">Archive ({rapports.length})</div>
          <form className="mt-2">
            <input name="q" defaultValue={q ?? ""} placeholder="Rechercher dans les rapports…" className="input-base h-8 text-[12px]" aria-label="Rechercher dans les rapports" />
          </form>
          <ul className="mt-2 space-y-1.5">
            {archive.map((rp) => (
              <li key={rp.id}>
                <Link
                  href={`/projects/${projectId}/rapports?r=${rp.id}`}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-[12.5px] ${rp.id === selected?.id ? "bg-[#56a45b]/10 font-bold text-[#1a4a20]" : "hover:bg-slate-50"}`}
                >
                  <span>{getRapportDelaiLabel(rp.numero)}{rp.reference ? ` · ${rp.reference}` : ""}</span>
                  <span className={`text-[10.5px] font-bold ${rp.statut === "diffuse" ? "text-emerald-700" : "text-slate-500"}`}>{getRapportStatutLabel(rp.statut)}</span>
                </Link>
              </li>
            ))}
            {!archive.length ? <li className="text-[12px] text-slate-500">{query ? "Aucun résultat." : "Aucun rapport rédigé."}</li> : null}
          </ul>
        </section>

        <Link href={`/projects/${projectId}/analytics`} className="block text-[12px] font-semibold text-[#3f8f48] hover:underline">
          Analyse détaillée des délais (indicateurs, Monte Carlo) →
        </Link>
      </aside>

      <div>
        {selected ? (
          <RapportDelaiEditor key={selected.id} projectId={projectId} rapport={selected} label={getRapportDelaiLabel(selected.numero)} />
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-8 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">Sélectionnez un rapport ou rédigez celui d&apos;un B2P</p>
            <p className="mt-1 text-[11px] text-slate-400">Le §3 « Situation à Date – Prévision à Terminaison » est pré-rempli depuis le tableau B2P.</p>
          </div>
        )}
      </div>
    </div>
  );
}
