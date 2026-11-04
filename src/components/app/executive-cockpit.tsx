import { parseIsoDate } from "@/lib/planning/date-utils";
import { formatCurrency, formatDateLabel, formatPercent } from "@/lib/format/formatters";
import { computeFgfSyntheseFromView } from "@/services/cost-bridge";
import type { ProjectHealth, ProjectView } from "@/types/planning";

/**
 * Vue Direction — bandeau exécutif lu en 10 secondes.
 * Verdict de santé, fin prévue vs contractuelle, écart FGF, chemin critique,
 * prochain jalon et points d'attention. Aucune dépendance à un module tiers.
 */

const HEALTH: Record<
  ProjectHealth,
  { label: string; dot: string; ring: string }
> = {
  ON_TRACK: { label: "Sur les rails", dot: "#56a45b", ring: "rgba(86,164,91,0.55)" },
  WATCH: { label: "À surveiller", dot: "#f4a321", ring: "rgba(244,163,33,0.55)" },
  AT_RISK: { label: "Sous tension", dot: "#e8842f", ring: "rgba(232,132,47,0.55)" },
  OFF_TRACK: { label: "Critique", dot: "#e2424a", ring: "rgba(226,66,74,0.55)" },
};

function dayDelta(from: string, to: string) {
  return Math.round(
    (parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) /
      (24 * 60 * 60 * 1000),
  );
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
      <div
        className="mt-1 truncate text-[17px] font-black leading-none"
        style={{ color: tone ?? "rgba(255,255,255,0.95)" }}
      >
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-[10.5px] text-white/45">{sub}</div>}
    </div>
  );
}

export function ExecutiveCockpit({ view }: { view: ProjectView }) {
  const project = view.aggregate.project;
  const metrics = view.metrics;
  const fgf = computeFgfSyntheseFromView(view);
  const currency = project.currencyCode;

  const health = HEALTH[metrics.derivedHealth ?? project.health] ?? HEALTH.WATCH;

  // Fin prévue vs contractuelle.
  const finish = view.schedule.projectFinishDate ?? null;
  const target = project.targetFinishDate ?? null;
  const finishDelta = finish && target ? dayDelta(target, finish) : null;
  const finishTone =
    finishDelta == null
      ? undefined
      : finishDelta > 0
        ? "#f7b3b6"
        : "#bfe6c4";

  // Écart FGF (positif = dépassement / défavorable).
  const ecart = fgf.ecartFinal;
  const ecartTone =
    Math.abs(ecart) < 1 ? "rgba(255,255,255,0.95)" : ecart > 0 ? "#f7b3b6" : "#bfe6c4";

  // Prochain jalon.
  const milestone = metrics.nearMilestones?.[0] ?? null;

  // Points d'attention.
  const chips: { label: string; n: number }[] = [
    { label: "chemin critique", n: metrics.criticalTaskCount },
    { label: "en retard", n: metrics.delayedTaskCount },
    { label: "échéance manquée", n: metrics.deadlineMissCount },
    { label: "ressource surchargée", n: metrics.overloadedResourceCount },
  ].filter((c) => c.n > 0);

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-5 py-4 animate-velocity-enter"
      style={{
        background: "linear-gradient(135deg, #1a4a20 0%, #0e2714 55%, #0d1f10 100%)",
        border: "1px solid rgba(86,164,91,0.20)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(86,164,91,0.16)",
      }}
    >
      {/* Speed lines */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-62deg, transparent, transparent 40px, rgba(255,255,255,0.015) 40px, rgba(255,255,255,0.015) 41px)",
        }}
      />

      <div className="relative flex flex-wrap items-center justify-between gap-4">
        {/* Verdict */}
        <div className="flex items-center gap-3">
          <span
            className="flex size-2.5 flex-shrink-0 rounded-full"
            style={{ background: health.dot, boxShadow: `0 0 12px ${health.ring}` }}
          />
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-[0.20em] text-white/40">
              Vue Direction
            </div>
            <div className="text-[19px] font-black leading-tight text-white">
              {project.name} —{" "}
              <span style={{ color: health.dot }}>{health.label}</span>
            </div>
          </div>
        </div>

        {/* Avancement */}
        <Stat
          label="Avancement"
          value={formatPercent(metrics.overallProgress)}
          sub={`${metrics.executableTaskCount} tâche(s) au réseau`}
        />
      </div>

      {/* Brand separator */}
      <div className="relative my-3 flex items-center gap-1.5 opacity-50">
        <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(86,164,91,0.5), rgba(244,163,33,0.4), transparent)" }} />
      </div>

      <div className="relative grid grid-cols-2 gap-x-5 gap-y-4 md:grid-cols-4 lg:grid-cols-5">
        <Stat
          label="Fin prévue"
          value={formatDateLabel(finish)}
          tone={finishTone}
          sub={
            finishDelta == null
              ? "—"
              : finishDelta > 0
                ? `+${finishDelta} j vs contractuel`
                : finishDelta < 0
                  ? `${finishDelta} j vs contractuel`
                  : "dans les délais"
          }
        />
        <Stat
          label="Écart FGF"
          value={`${ecart > 0 ? "+" : ""}${formatCurrency(ecart, currency)}`}
          tone={ecartTone}
          sub={`${ecart > 0 ? "+" : ""}${formatPercent(fgf.ecartSurBad * 100)} / BàD`}
        />
        <Stat
          label="Coût prévisionnel"
          value={formatCurrency(fgf.coutPrevisionnelTerminaison, currency)}
          sub={`BàD ${formatCurrency(fgf.budgetADate, currency)}`}
        />
        <Stat
          label="Prochain jalon"
          value={milestone ? milestone.name : "—"}
          sub={milestone ? formatDateLabel(milestone.scheduledFinishDate) : "aucun à venir"}
        />
        <Stat
          label="Chemin critique"
          value={`${metrics.criticalTaskCount} tâche(s)`}
          tone={metrics.criticalTaskCount > 0 ? "#f4a321" : undefined}
          sub={
            metrics.scheduleSlipDays
              ? `glissement ${metrics.scheduleSlipDays} j`
              : "stable"
          }
        />
      </div>

      {/* Points d'attention */}
      {chips.length > 0 && (
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/35">
            Attention
          </span>
          {chips.map((c) => (
            <span
              key={c.label}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{
                background: "rgba(232,66,74,0.16)",
                border: "1px solid rgba(232,66,74,0.30)",
                color: "#f7b3b6",
              }}
            >
              {c.n} {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
