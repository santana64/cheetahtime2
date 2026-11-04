import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateLabel, formatPercent } from "@/lib/format/formatters";
import {
  buildProgressTrend,
  calculateEarnedSchedule,
  runMonteCarloSchedule,
} from "@/services/advanced-planning";
import { getProjectView } from "@/services/projects";
import { WhatIfSimulator } from "@/features/projects/what-if-simulator";
import { MonteCarloHistogram, SCurve } from "@/components/app/analytics-charts";
import { PageHeader, StatGrid, StatTile } from "@/components/app/ui-kit";

export default async function ProjectAnalyticsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => notFound());
  const earnedSchedule = calculateEarnedSchedule(view);
  const monteCarlo = runMonteCarloSchedule(view, undefined, 120);
  const trends = buildProgressTrend(view);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Ordonnancement avancé"
        title="Earned Schedule, Monte Carlo et courbe en S"
        description="Prévision de la date de fin réelle (lentille délai) et distribution probabiliste des scénarios."
      />

      <StatGrid>
        <StatTile label="SPI_t" value={earnedSchedule.SPI_t?.toFixed(2) ?? "n/a"} sub="Perf. temporelle" />
        <StatTile label="IEAC_t" value={formatDateLabel(earnedSchedule.IEAC_t)} sub="Fin prévue (ES)" />
        <StatTile label="P80 client" value={formatDateLabel(monteCarlo.p80)} sub="À promettre" tone="#e0902a" />
        <StatTile
          label="Glissement prédit"
          value={`${earnedSchedule.predictedSlip} j`}
          sub="vs référentiel"
          tone={earnedSchedule.predictedSlip > 0 ? "#be123c" : "#1a7f37"}
        />
      </StatGrid>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Courbe S interactive</CardTitle>
            <p className="mt-1 text-xs text-slate-500">Survolez les points pour lire prévu / réalisé / prévision.</p>
          </div>
          <a className="rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700" href={`/api/projects/${projectId}/reports?format=s-curve-svg`}>
            Export SVG
          </a>
        </CardHeader>
        <CardContent>
          <SCurve trends={trends} />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monte Carlo — {monteCarlo.iterations.toLocaleString("fr-FR")} simulations</CardTitle>
            <p className="text-xs text-slate-500">
              Distribution des dates de fin projet. <span className="font-semibold text-amber-600">Jaune = zone P50→P80</span> &nbsp;·&nbsp; <span className="font-semibold text-rose-500">Rouge = zone P80+</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <MonteCarloHistogram
              histogram={monteCarlo.histogram}
              p10={monteCarlo.p10}
              p50={monteCarlo.p50}
              p80={monteCarlo.p80}
              p90={monteCarlo.p90}
            />
            <div className="grid grid-cols-4 gap-2 text-sm">
              {[
                ["P10", monteCarlo.p10, "text-emerald-700 bg-emerald-50"],
                ["P50", monteCarlo.p50, "text-amber-700 bg-amber-50"],
                ["P80", monteCarlo.p80, "text-rose-600 bg-rose-50"],
                ["P90", monteCarlo.p90, "text-rose-800 bg-rose-100"],
              ].map(([label, date, cls]) => (
                <div key={label} className={`rounded-lg p-3 ${cls}`}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">{label}</div>
                  <div className="mt-1 font-semibold">{formatDateLabel(date as string | null)}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Tâches les plus souvent sur le chemin critique</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {monteCarlo.criticalTasks.slice(0, 12).map((taskId) => {
                  const task = view.tasks.find((entry) => entry.id === taskId);
                  return (
                    <span key={taskId} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                      {task ? `${task.wbsCode} ${task.name}` : taskId}
                    </span>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Earned Schedule</CardTitle>
            <p className="text-xs text-slate-500">Métrique temporelle complémentaire à l'EVM — prédit la date de fin réelle.</p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ["ES (Earned Schedule)", `${earnedSchedule.ES} sem.`, earnedSchedule.ES > 0 ? "text-emerald-700" : "text-slate-600"],
              ["AT (Actual Time)", `${earnedSchedule.AT} sem.`, "text-slate-700"],
              ["SPI_t (perf. temporelle)", earnedSchedule.SPI_t != null ? earnedSchedule.SPI_t.toFixed(3) : "n/a", (earnedSchedule.SPI_t ?? 1) >= 1 ? "text-emerald-700 font-bold" : (earnedSchedule.SPI_t ?? 1) >= 0.9 ? "text-amber-700 font-bold" : "text-rose-600 font-bold"],
              ["IEAC_t (fin prévue ES)", formatDateLabel(earnedSchedule.IEAC_t), (earnedSchedule.predictedSlip ?? 0) === 0 ? "text-emerald-700" : "text-rose-600"],
              ["Glissement prédit", `${earnedSchedule.predictedSlip} j.`, earnedSchedule.predictedSlip === 0 ? "text-emerald-700" : "text-rose-600"],
              ["Avancement global", formatPercent(view.metrics.overallProgress), "text-slate-700"],
            ].map(([label, value, cls]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-500">{label}</span>
                <strong className={cls as string}>{value}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <WhatIfSimulator
        projectId={projectId}
        tasks={view.tasks
          .filter((task) => !task.isSummary)
          .map((task) => ({ id: task.id, label: `${task.wbsCode} ${task.name}` }))}
      />
    </div>
  );
}
