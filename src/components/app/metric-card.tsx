import type { DashboardMetric } from "@/types/planning";

/**
 * Tuile KPI — style CheetahCost : carte blanche plate, barre d'accent gauche,
 * intitulé section-label, valeur tabulaire. Aucune animation décorative.
 */
const TONE_CONFIG = {
  positive: { accent: "#56a45b", value: "#1a7f37" },
  watch: { accent: "#f4a321", value: "#b45309" },
  danger: { accent: "#e2424a", value: "#be123c" },
  neutral: { accent: "#56a45b", value: "#0d1f10" },
} as const;

type ToneKey = keyof typeof TONE_CONFIG;

export function MetricCard({ metric }: { metric: DashboardMetric }) {
  const key: ToneKey =
    metric.tone === "positive"
      ? "positive"
      : metric.tone === "watch"
        ? "watch"
        : metric.tone === "danger"
          ? "danger"
          : "neutral";

  const t = TONE_CONFIG[key];

  return (
    <div className="panel rounded-2xl p-4" style={{ borderLeft: `3px solid ${t.accent}` }}>
      <div className="flex min-h-[96px] flex-col justify-between gap-1.5">
        <div className="section-label">{metric.label}</div>
        <div
          className="text-[30px] font-black leading-none tabular-nums tracking-[-0.02em]"
          style={{ color: t.value }}
        >
          {metric.value}
        </div>
        {metric.hint ? (
          <div className="text-[11px] leading-4 text-slate-500">{metric.hint}</div>
        ) : null}
      </div>
    </div>
  );
}
