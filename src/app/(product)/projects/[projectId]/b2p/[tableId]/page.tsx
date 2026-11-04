import Link from "next/link";
import { notFound } from "next/navigation";

import { T2PTimeline } from "@/components/app/t2p-timeline";
import { Button } from "@/components/ui/button";
import {
  createT2PScenarioAction,
  deleteT2PTableAction,
  promoteT2PAction,
  toggleT2PLockAction,
} from "@/features/projects/actions";
import { T2PTableEditor } from "@/features/projects/t2p-table-editor";
import { formatGap } from "@/lib/fgf/delay-banner";
import {
  aggregateT2P,
  getT2PDescriptor,
  getT2PEcartReference,
  getT2PLabel,
  getT2PStatus,
  lineEcart,
  sortT2PTables,
  t2pUnitLabel,
} from "@/lib/fgf/t2p";
import { formatDateLabel } from "@/lib/format/formatters";
import { getProjectView } from "@/services/projects";

/** Détail d'un tableau B2P (délai) — équivalent de /projets/[id]/b2p/[b2pId] dans Cheetah Cost. */
export default async function T2PTablePage({ params }: { params: Promise<{ projectId: string; tableId: string }> }) {
  const { projectId, tableId } = await params;
  const view = await getProjectView(projectId).catch(() => notFound());
  const project = view.aggregate.project;
  const tables = sortT2PTables(project.t2pTables ?? []);
  const table = tables.find((t) => t.id === tableId);
  if (!table) notFound();
  const calendar = view.aggregate.calendar;
  const locked = (project.lockedT2PIds ?? []).includes(table.id);
  const agg = aggregateT2P(table, calendar);
  const ref = getT2PEcartReference(tables, table);
  const prevEcart = ref ? (ref.tableKind === "b2p0" ? 0 : aggregateT2P(ref, calendar).ecart) : 0;
  const derive = Math.round((agg.ecart - prevEcart) * 100) / 100;
  const status = getT2PStatus(table, agg);
  const unit = t2pUnitLabel(table.unit);
  const ecarts = Object.fromEntries(table.lignes.map((l) => [l.lotId, table.tableKind === "b2p0" ? 0 : lineEcart(l, table.unit, calendar)]));

  return (
    <div className="space-y-5">
      <section className="ct-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link prefetch={false} href={`/projects/${projectId}/b2p`} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800">
              ← Tableaux B2P
            </Link>
            <h1 className="ct-title mt-1 text-[22px]">
              {getT2PLabel(table)} <span className="text-[14px] font-semibold text-slate-500">· {getT2PDescriptor(table.tableKind)}</span>
            </h1>
            <p className="mt-1 text-[12px] text-slate-500">
              Déclenché le {formatDateLabel(table.date)}
              {ref ? ` · écart précédent : ${getT2PLabel(ref)}` : ""} · {status.label}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {table.numero > 0 && !locked ? (
              <form action={createT2PScenarioAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="numero" value={table.numero} />
                <Button variant="outline" size="sm" type="submit">+ Nouveau scénario (i-2j)</Button>
              </form>
            ) : null}
            {table.tableKind === "i-2j" ? (
              <form action={promoteT2PAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="tableId" value={table.id} />
                <Button size="sm" type="submit" title="Duplique ce scénario en prévision corrigée T2Pi-2 (le scénario est conservé)">
                  Retenir i-2
                </Button>
              </form>
            ) : null}
            <form action={toggleT2PLockAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="tableId" value={table.id} />
              <input type="hidden" name="locked" value={locked ? "false" : "true"} />
              <Button variant="outline" size="sm" type="submit">{locked ? "Déverrouiller" : "Verrouiller"}</Button>
            </form>
            {table.tableKind !== "b2p0" && !locked ? (
              <form action={deleteT2PTableAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="tableId" value={table.id} />
                <Button variant="ghost" size="sm" type="submit" className="text-rose-700 hover:bg-rose-50">Supprimer</Button>
              </form>
            ) : null}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          {[
            ["Fi", formatDateLabel(agg.finInitiale)],
            ["PàD", formatDateLabel(agg.finADate)],
            ["FP", formatDateLabel(agg.finPrevue)],
            ["Écart E", formatGap(agg.ecart, unit)],
            ["Écart précédent", formatGap(prevEcart, unit)],
            ["Dérive D = E − éPrec", formatGap(derive, unit)],
            ["Avancement", `${agg.avancement} %`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <dt className="section-label">{k}</dt>
              <dd
                className={`ct-num mt-1 text-[13px] font-bold ${
                  (k === "Écart E" && agg.ecart > 0) || (k.startsWith("Dérive") && derive > 0) ? "text-[#be123c]" : "text-slate-900"
                }`}
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <T2PTableEditor
        key={table.id}
        projectId={projectId}
        tableId={table.id}
        lines={table.lignes}
        editablePlan={table.tableKind === "i-2j" || table.tableKind === "i-2"}
        locked={locked}
        unitLabel={unit}
        ecarts={ecarts}
      />

      <section>
        <h2 className="ct-title mb-2 text-[15px]">Tous les tableaux</h2>
        <T2PTimeline view={view} activeId={table.id} />
      </section>
    </div>
  );
}
