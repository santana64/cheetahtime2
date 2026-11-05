import Link from "next/link";

import { PageHeader, StatGrid, StatTile } from "@/components/app/ui-kit";
import { getProjectB2PDates } from "@/lib/fgf/b2p";
import { computeDelayBanner, formatGap } from "@/lib/fgf/delay-banner";
import { formatDateLabel } from "@/lib/format/formatters";
import { requireCurrentSession } from "@/services/auth";
import { listProjectViews } from "@/services/projects";

/**
 * Tableau de bord PMO (CdC p. 1) — vue portefeuille : santé, écarts, échéances.
 * « Qui doit faire son B2P, qui a dérivé » : une ligne par projet en cours,
 * triée par urgence (action de pilotage requise, puis écart).
 */
function isoInDays(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function PmoDashboardPage() {
  const session = await requireCurrentSession();
  const views = (await listProjectViews({ includeArchived: false, workspaceId: session.workspaceId })).filter(
    (v) => !v.aggregate.project.declassedAt,
  );
  const today = isoInDays(0);
  const in30 = isoInDays(30);

  const rows = views
    .map((view) => {
      const p = view.aggregate.project;
      const banner = computeDelayBanner(view);
      const fin = [p.targetFinishDate, view.schedule.projectFinishDate].filter(Boolean).sort().at(-1) ?? null;
      const b2pDates = fin ? getProjectB2PDates(p, view.schedule.projectFinishDate) : [];
      const nextB2P = b2pDates.find((d) => d >= today) ?? null;
      const nextIndex = nextB2P ? b2pDates.indexOf(nextB2P) : -1;
      const lastSnapshot = Object.keys(p.b2pSnapshots ?? {}).sort().at(-1) ?? null;
      const overdueB2P = b2pDates.filter((d) => d < today && d > (lastSnapshot ?? p.targetStartDate)).length;
      return { view, banner, nextB2P, nextIndex, overdueB2P };
    })
    .sort((a, b) => {
      const ra = a.banner.actionRequise ? 0 : 1;
      const rb = b.banner.actionRequise ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return (b.banner.ecartJours ?? 0) - (a.banner.ecartJours ?? 0);
    });

  const actionCount = rows.filter((r) => r.banner.hasPI && r.banner.actionRequise).length;
  const upcoming = rows.filter((r) => r.nextB2P && r.nextB2P <= in30).length;
  const overdue = rows.filter((r) => r.overdueB2P > 0 && r.banner.hasPI).length;
  const planning = rows.filter((r) => !r.banner.hasPI).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Portefeuille"
        title="Tableau de bord PMO"
        description="Santé, écarts et échéances de tous les projets en cours. Les projets nécessitant une action de pilotage sont en tête."
      />
      <StatGrid>
        <StatTile label="Projets en cours" value={rows.length} tone="#56a45b" />
        <StatTile label="Action de pilotage requise" value={actionCount} tone={actionCount ? "#e2424a" : "#94a3b8"} sub="Fin prévisionnelle au-delà du PàD" />
        <StatTile label="B2P en retard de saisie" value={overdue} tone={overdue ? "#e8842f" : "#94a3b8"} sub="B2P échu sans saisie d'avancement" />
        <StatTile label="B2P dans les 30 jours" value={upcoming} tone="#f4a321" />
        <StatTile label="En planification" value={planning} tone="#94a3b8" sub="PI non encore figé" />
      </StatGrid>

      <section className="ct-card overflow-hidden" aria-labelledby="pmo-table">
        <h2 id="pmo-table" className="sr-only">Projets du portefeuille</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
            <thead className="bg-[#f6f4ee]">
              <tr className="text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5">Projet</th>
                <th className="px-3 py-2.5">Phase</th>
                <th className="px-3 py-2.5">Fi</th>
                <th className="px-3 py-2.5">PàD</th>
                <th className="px-3 py-2.5">FP</th>
                <th className="px-3 py-2.5 text-right">Écart</th>
                <th className="px-3 py-2.5 text-right">Avanc.</th>
                <th className="px-3 py-2.5">Pilotage</th>
                <th className="px-3 py-2.5">Prochain B2P</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ view, banner, nextB2P, nextIndex, overdueB2P }) => {
                const p = view.aggregate.project;
                const late = (banner.ecart ?? 0) > 0;
                return (
                  <tr key={p.id} className="border-t border-black/[0.05] hover:bg-[#56a45b]/[0.04]">
                    <td className="px-4 py-2.5">
                      <Link prefetch={false} href={`/projects/${p.id}/dashboard`} className="font-bold text-slate-900 hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-[11px] text-slate-500">{p.clientName}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{p.phase ?? "—"}</td>
                    <td className="ct-num whitespace-nowrap px-3 py-2.5">{formatDateLabel(banner.finInitiale)}</td>
                    <td className="ct-num whitespace-nowrap px-3 py-2.5">{formatDateLabel(banner.finADate)}</td>
                    <td className={`ct-num whitespace-nowrap px-3 py-2.5 font-bold ${late ? "text-[#be123c]" : "text-slate-900"}`}>{formatDateLabel(banner.finPrevisionnelle)}</td>
                    <td className={`ct-num whitespace-nowrap px-3 py-2.5 text-right font-black ${late ? "text-[#be123c]" : "text-[#047857]"}`}>{formatGap(banner.ecart, banner.unitLabel)}</td>
                    <td className="ct-num px-3 py-2.5 text-right">{banner.avancement} %</td>
                    <td className="px-3 py-2.5">
                      {banner.hasPI ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={banner.actionRequise ? { background: "rgba(226,66,74,0.10)", color: "#be123c" } : { background: "rgba(86,164,91,0.12)", color: "#1a7f37" }}
                        >
                          {banner.actionRequise ? "Requise" : "Non requise"}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">PI non figé</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {nextB2P ? (
                        <Link prefetch={false} href={`/projects/${p.id}/b2p`} className="font-semibold text-[#3f8f48] hover:underline">
                          B2P{nextIndex} · {formatDateLabel(nextB2P)}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {overdueB2P > 0 && banner.hasPI ? (
                        <div className="text-[10.5px] font-bold text-[#c2410c]">{overdueB2P} B2P échu(s) non saisi(s)</div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? <p className="p-6 text-[13px] text-slate-500">Aucun projet en cours.</p> : null}
      </section>
    </div>
  );
}
