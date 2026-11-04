import { FgfCockpit } from "@/components/app/fgf-cockpit";
import { MetricCard } from "@/components/app/metric-card";
import {
  PriorityBadge,
  ProjectHealthBadge,
  TaskStatusBadge,
} from "@/components/app/status-badge";
import { Panel, StatGrid, StatTile } from "@/components/app/ui-kit";
import { formatDateLabel, formatPercent } from "@/lib/format/formatters";
import type { ProjectView } from "@/types/planning";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Tableau de bord — MAÎTRISE DES DÉLAIS uniquement.
 *
 * Cheetah Time ne parle QUE de délai : aucune notion de coût (le coût est traité
 * par Cheetah Cost). Cockpit délai, pilotage des délais, chemin critique, jalons
 * et écarts calendaires au référentiel.
 */
// Un KPI de coût ne doit JAMAIS apparaître dans Cheetah Time (label OU indice).
const COST_LABEL = /co[ûu]t|budget|\bEUR\b|€|dépense|depense|valeur acquise|\bVA\b|\bCPI\b|BàD|\bBaD\b|\bVP\b|\bCA\b|EAC|VAC/i;
const isCostMetric = (m: { label: string; hint?: string; value?: string }) =>
  COST_LABEL.test(m.label) || COST_LABEL.test(m.hint ?? "") || COST_LABEL.test(m.value ?? "");

export function ProjectDashboard({ view }: { view: ProjectView }) {
  const m = view.metrics;

  return (
    <div className="space-y-6">
      {/* ── Cockpit FGF — les deux lentilles au B2P courant (signature) ── */}
      <FgfCockpit view={view} />

      {/* ── Chiffres-clés (délai uniquement) ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {m.dashboardMetrics
          .filter((metric) => !isCostMetric(metric))
          .map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_420px]">
        <div className="space-y-6">
          {/* ══ PILOTAGE DES DÉLAIS (lentille primaire) ══════════════ */}
          <Panel
            title="Pilotage des délais"
            subtitle="Lentille délai — la signature de Cheetah Time"
            accent="#56a45b"
          >
            <StatGrid className="lg:grid-cols-3">
              <StatTile
                label="Avancement global"
                value={formatPercent(m.overallProgress)}
                sub={`${m.executableTaskCount} LT exécutables`}
                progress={m.overallProgress}
              />
              <StatTile
                label="Fin prévisionnelle"
                value={formatDateLabel(view.schedule.projectFinishDate)}
                sub={`Contractuelle : ${formatDateLabel(view.aggregate.project.targetFinishDate)}`}
              />
              <StatTile
                label="Chemin critique"
                value={`${m.criticalTaskCount} LT`}
                sub="Marge totale nulle ou négative"
                tone="#e2424a"
              />
              <StatTile
                label="Profil de nivellement"
                value={`${m.leveledTaskCount} LT`}
                sub={`Décalés par le nivellement (${m.totalLevelingDelayDays} j ouvrés cumulés)`}
                tone="#e0902a"
              />
              <StatTile
                label="Planning de référence (PàD)"
                value={view.activeBaseline?.name ?? "Aucun"}
                sub={
                  view.activeBaseline
                    ? `Capturé le ${new Date(view.activeBaseline.capturedAt).toLocaleDateString("fr-FR")}`
                    : "Figez le Planning Initial (PI) dans l'onglet Planning."
                }
              />
            </StatGrid>
          </Panel>

          {/* ══ CHEMIN CRITIQUE + JALONS ═════════════════════════════ */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Chemin critique" accent="#e2424a" bodyClassName="space-y-2.5">
              {m.criticalTasks.slice(0, 6).map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-black/5 bg-slate-50/70 p-3.5 transition-colors hover:border-rose-200/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: "#e2424a" }} />
                        <div className="truncate text-[13px] font-semibold text-slate-900">
                          {task.wbsCode} {task.name}
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {formatDateLabel(task.scheduledStartDate)} → {formatDateLabel(task.scheduledFinishDate)}
                      </div>
                    </div>
                    <TaskStatusBadge status={task.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <PriorityBadge priority={task.priority} />
                    <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
                      {(task.totalSlackDays ?? 0) < 0
                        ? `Marge négative : ${task.totalSlackDays} j`
                        : "Marge totale : 0"}
                    </span>
                    {task.levelingDelayDays > 0 && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                        +{task.levelingDelayDays} j (nivellement)
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {m.criticalTasks.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-400">Aucune tâche critique détectée.</p>
              )}
            </Panel>

            <Panel title="Jalons à venir" accent="#f4a321" bodyClassName="space-y-2.5">
              {m.nearMilestones.length ? (
                m.nearMilestones.map((task) => (
                  <div key={task.id} className="rounded-xl border border-black/5 bg-slate-50/70 p-3.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 block size-1.5 shrink-0 rounded-full" style={{ background: "#f4a321" }} />
                      <div>
                        <div className="text-[13px] font-semibold text-slate-900">
                          {task.wbsCode} {task.name}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Prévu le {formatDateLabel(task.scheduledFinishDate)}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          Critique&#160;: {task.isCritical ? "Oui" : "Non"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-slate-400">
                  Aucun jalon dans les 10 prochains jours ouvrés.
                </p>
              )}
            </Panel>
          </div>

          {/* ══ ÉCARTS AU RÉFÉRENTIEL ════════════════════════════════ */}
          <Panel
            title="Écarts au Planning Initial"
            subtitle="Par LT : écart de début, de fin et de charge par rapport au PI"
            accent="#4b6bdc"
            bodyClassName="space-y-3"
          >
            {view.tasks
              .filter((task) => !task.isSummary)
              .slice(0, 8)
              .map((task) => {
                const variance = view.baselineVarianceByTaskId[task.id];
                const hasVariance = variance?.startVarianceDays || variance?.finishVarianceDays;
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "rounded-xl border p-3.5",
                      hasVariance ? "border-amber-200/60 bg-amber-50/40" : "border-black/5 bg-slate-50/60",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {hasVariance && (
                            <span className="block size-1.5 shrink-0 rounded-full" style={{ background: "#e0902a" }} />
                          )}
                          <div className="text-[12px] font-semibold text-slate-900">
                            {task.wbsCode} {task.name}
                          </div>
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          PI&#160;: {variance?.snapshot ? "figé" : "non figé"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                      <span>Début <span className="font-semibold text-slate-800">{variance?.startVarianceDays ?? 0}j</span></span>
                      <span>Fin <span className="font-semibold text-slate-800">{variance?.finishVarianceDays ?? 0}j</span></span>
                      <span>Charge <span className="font-semibold text-slate-800">{variance?.workVarianceHours ?? 0}h</span></span>
                      <span>Indice délai <span className="font-semibold text-slate-800">{variance?.schedulePerformanceIndex != null ? variance.schedulePerformanceIndex.toFixed(2).replace(".", ",") : "—"}</span></span>
                      <span>Nivellement <span className="font-semibold text-slate-800">{task.levelingDelayDays ? `+${task.levelingDelayDays}j` : "aucun"}</span></span>
                    </div>
                  </div>
                );
              })}
          </Panel>

        </div>

        {/* ══ PANNEAU LATÉRAL — lecture seule (les réglages et la suppression sont dans Paramètres) ══ */}
        <aside className="space-y-5">
          <Panel title="Identité du projet" accent="#56a45b" bodyClassName="space-y-2 text-[12.5px]">
            {[
              ["Maître d'ouvrage", view.aggregate.project.clientName],
              ["Responsable", view.aggregate.project.ownerName],
              ["Phase", view.aggregate.project.phase ?? "—"],
              ["Début", formatDateLabel(view.aggregate.project.targetStartDate)],
              ["Fin contractuelle", formatDateLabel(view.aggregate.project.targetFinishDate)],
              ["Unité de temps", view.aggregate.project.timeUnit ?? "jours"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-black/[0.04] pb-1.5 last:border-0">
                <span className="text-slate-500">{k}</span>
                <span className="text-right font-semibold text-slate-800">{v}</span>
              </div>
            ))}
            <Link prefetch={false}
              href={`/projects/${view.aggregate.project.id}/settings`}
              className="mt-2 inline-flex text-[12px] font-bold text-[#3f8f48] underline-offset-2 hover:underline"
            >
              Modifier dans Paramètres →
            </Link>
          </Panel>
          <Panel title="Santé calculée" accent="#4b6bdc" bodyClassName="space-y-2">
            <ProjectHealthBadge health={m.derivedHealth} />
            <ul className="space-y-1.5 text-[12px] text-slate-600">
              {m.healthReasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2">
                  <span className="mt-1.5 block size-1.5 shrink-0 rounded-full" style={{ background: "#56a45b99" }} />
                  {reason}
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
