import Link from "next/link";
import { notFound } from "next/navigation";

import { fromWorkingDays, timeUnitShortLabel } from "@/lib/planning/time-unit";
import { getProjectView } from "@/services/projects";

/**
 * Onglet « Structure » — transposition délai de la « Structure budgétaire »
 * de Cheetah Cost (CdC p. 13) : « Données économiques » → « Unité de temps »,
 * colonne « Budget initial » → « Durées », total des durées, Provisions de
 * Temps PT1…PT9.
 */
export default async function ProjectStructurePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => notFound());
  const project = view.aggregate.project;
  const unit = project.timeUnit ?? "jours";
  const unitLabel = timeUnitShortLabel(unit);
  const byId = new Map(view.tasks.map((t) => [t.id, t]));
  const rows = view.tasks.filter((t) => !t.isSummary);
  const toUnit = (t: (typeof rows)[number]) =>
    t.type === "MILESTONE" ? 0 : (t.durationUnits ?? fromWorkingDays(t.durationDays, unit, view.aggregate.calendar.hoursPerDay));
  const isPT = (t: (typeof rows)[number]) => /^PT/i.test(t.code ?? "") || /provision de temps/i.test(t.name);
  const total = rows.reduce((sum, t) => sum + toUnit(t), 0);
  const ptCount = rows.filter(isPT).length;
  const fmt = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

  return (
    <div className="ct-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-bold text-slate-800">Structure des tâches</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {rows.length} lot{rows.length !== 1 ? "s" : ""} de tâches · {unit}
          </p>
        </div>
        <Link prefetch={false} href={`/projects/${projectId}/planning`} className="toolbar-btn">
          Modifier les LT
        </Link>
      </div>

      <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
        <div className="section-label mb-2.5">Unité de temps</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-[10px] font-semibold text-slate-500">Unité</div>
            <div className="text-[13px] font-bold capitalize text-slate-900">{unit}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-500">Provisions de Temps</div>
            <div className="text-[13px] font-bold text-slate-900">{ptCount} / 9 au maximum</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-500">Tâches hamac</div>
            <div className="text-[13px] font-bold text-slate-900">{view.tasks.filter((t) => t.isSummary).length}</div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Libellé</th>
              <th className="px-3 py-2">Tâche hamac</th>
              <th className="px-3 py-2 text-right">Durée ({unitLabel})</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-slate-100">
                <td className="ct-num px-3 py-2 text-slate-600">{t.code ?? t.wbsCode}</td>
                <td className="px-3 py-2 font-semibold text-slate-900">
                  {t.name}
                  {t.type === "MILESTONE" ? <span className="ml-2 text-[10px] font-bold text-[#c2710c]">jalon</span> : null}
                  {isPT(t) ? <span className="ml-2 text-[10px] font-bold text-[#3f8f48]">provision</span> : null}
                </td>
                <td className="px-3 py-2 text-slate-500">{t.parentId ? byId.get(t.parentId)?.name ?? "—" : "—"}</td>
                <td className="ct-num px-3 py-2 text-right font-bold">{fmt(toUnit(t))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300">
              <td className="px-3 py-2 font-black text-[#1a4a20]" colSpan={3}>
                Total des durées
              </td>
              <td className="ct-num px-3 py-2 text-right font-black text-[#1a4a20]">
                {fmt(total)} {unitLabel}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
