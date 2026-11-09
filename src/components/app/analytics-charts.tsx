import { formatDateLabel } from "@/lib/format/formatters";

/**
 * Graphiques de l'onglet Analyse — craft data-viz (skill dataviz) :
 * axes lisibles, grille discrète, légende toujours présente, étiquettes directes,
 * marqueurs de percentiles, survol natif <title>. Couleurs validées CVD.
 * Composants serveur (SVG pur, aucun JS requis).
 */

const MUT = "#94a3b8"; // texte discret
const GRID = "#e7e5df"; // grille sur crème
const SURFACE = "#fbfaf6";

// Courbe S — 3 séries (palette validée en clair).
const PLANNED = "#64748b"; // Prévu — neutre de référence (pointillé)
const ACTUAL = "#2f7d38"; // Réalisé — vert Cheetah
const FORECAST = "#c2710c"; // Prévision — orange foncé (contraste OK)

// Zones de probabilité Monte Carlo (statut).
const Z_SAFE = "#56a45b";
const Z_WATCH = "#e0902a";
const Z_RISK = "#e2424a";

function niceTicks(n: number, count = 5) {
  const step = Math.max(1, Math.ceil(n / count));
  const out: number[] = [];
  for (let i = 0; i <= n; i += step) out.push(i);
  return out;
}

export function SCurve({
  trends,
}: {
  trends: { date: string; plannedProgress: number; actualProgress: number; forecastProgress: number }[];
}) {
  const W = 900, H = 320;
  const padL = 40, padR = 120, padT = 22, padB = 34;
  if (trends.length < 2) {
    return <div className="py-10 text-center text-sm text-slate-400">Pas assez de points pour tracer la courbe.</div>;
  }
  const x = (i: number) => padL + (i / (trends.length - 1)) * (W - padL - padR);
  const y = (v: number) => H - padB - (Math.max(0, Math.min(100, v)) / 100) * (H - padT - padB);
  const line = (key: "plannedProgress" | "actualProgress" | "forecastProgress") =>
    trends.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");

  const last = trends[trends.length - 1];
  const series = [
    { key: "plannedProgress" as const, label: "Prévu", color: PLANNED, dash: "5 4", width: 2, value: last.plannedProgress },
    { key: "forecastProgress" as const, label: "Prévision", color: FORECAST, dash: "7 5", width: 2.5, value: last.forecastProgress },
    { key: "actualProgress" as const, label: "Réalisé", color: ACTUAL, dash: "0", width: 3.2, value: last.actualProgress },
  ];
  // Étiquettes de fin espacées verticalement pour éviter le chevauchement.
  const endLabels = [...series].sort((a, b) => b.value - a.value).map((s, idx) => ({ ...s, ly: padT + 6 + idx * 15 }));

  const dateTickIdx = Array.from(new Set([0, Math.floor((trends.length - 1) / 3), Math.floor((2 * (trends.length - 1)) / 3), trends.length - 1]));

  return (
    <figure className="m-0">
      {/* Légende */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-slate-500">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true"><line x1="0" y1="4" x2="18" y2="4" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="round" /></svg>
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[300px] w-full" role="img"
        aria-label={`Courbe en S : avancement prévu ${Math.round(last.plannedProgress)}%, réalisé ${Math.round(last.actualProgress)}%, prévision ${Math.round(last.forecastProgress)}% à ${formatDateLabel(last.date)}.`}>
        <rect width={W} height={H} fill={SURFACE} rx="8" />
        {/* Grille + axe Y */}
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3.5} fontSize="10" fill={MUT} textAnchor="end">{t}%</text>
          </g>
        ))}
        {/* Axe X (dates) */}
        {dateTickIdx.map((i) => (
          <text key={i} x={x(i)} y={H - padB + 16} fontSize="10" fill={MUT} textAnchor={i === 0 ? "start" : i === trends.length - 1 ? "end" : "middle"}>
            {formatDateLabel(trends[i].date)}
          </text>
        ))}
        {/* Séries (réalisé dessiné en dernier = au-dessus) */}
        {series.map((s) => (
          <path key={s.key} d={line(s.key)} fill="none" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {/* Points réalisé avec survol */}
        {trends.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.actualProgress)} r="3.4" fill={ACTUAL} stroke={SURFACE} strokeWidth="1.5">
            <title>{`${formatDateLabel(p.date)}\nprévu ${Math.round(p.plannedProgress)}% · réalisé ${Math.round(p.actualProgress)}% · prévision ${Math.round(p.forecastProgress)}%`}</title>
          </circle>
        ))}
        {/* Étiquettes directes de fin */}
        {endLabels.map((s) => (
          <g key={s.key}>
            <line x1={x(trends.length - 1) + 4} y1={y(s.value)} x2={W - padR + 12} y2={s.ly - 3} stroke={s.color} strokeWidth="1" opacity="0.4" />
            <text x={W - padR + 15} y={s.ly} fontSize="10.5" fontWeight="700" fill={s.color}>{s.label} {Math.round(s.value)}%</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

export function MonteCarloHistogram({
  histogram,
  p10,
  p50,
  p80,
  p90,
}: {
  histogram: { date: string; probability: number }[];
  p10: string | null;
  p50: string | null;
  p80: string | null;
  p90: string | null;
}) {
  const W = 900, H = 240;
  const padL = 42, padR = 16, padT = 18, padB = 40;
  if (!histogram.length) {
    return <div className="py-10 text-center text-sm text-slate-400">Données insuffisantes pour l'histogramme.</div>;
  }
  const maxP = Math.max(...histogram.map((b) => b.probability), 0.01);
  const slot = (W - padL - padR) / histogram.length;
  const barW = Math.max(2, slot - 2); // 2px de gap entre barres
  const bx = (i: number) => padL + i * slot;
  const by = (p: number) => padT + (1 - p / maxP) * (H - padT - padB);
  const findX = (d: string | null) => (d ? bx(Math.max(0, histogram.findIndex((b) => b.date >= d))) : null);

  const zoneOf = (date: string): string => {
    if (p80 && date >= p80) return Z_RISK;
    if (p50 && date >= p50) return Z_WATCH;
    return Z_SAFE;
  };

  const markers = [
    { p: p10, label: "P10", color: MUT },
    { p: p50, label: "P50", color: "#b45309" },
    { p: p80, label: "P80", color: Z_RISK },
    { p: p90, label: "P90", color: "#9f1239" },
  ].filter((m) => m.p);

  const yTicks = niceTicks(Math.ceil(maxP * 100), 4);
  const dateTicks = [0, Math.floor(histogram.length / 2), histogram.length - 1];

  return (
    <figure className="m-0">
      {/* Légende de zones */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-slate-500">
        {[["Confortable", Z_SAFE], ["Zone P50→P80", Z_WATCH], ["À risque (P80+)", Z_RISK]].map(([label, c]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[3px]" style={{ background: c as string }} />{label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[240px] w-full" role="img"
        aria-label={`Distribution Monte Carlo des dates de fin. P50 ${formatDateLabel(p50)}, P80 ${formatDateLabel(p80)}.`}>
        <rect width={W} height={H} fill={SURFACE} rx="8" />
        {/* Grille + axe Y (%) */}
        {yTicks.map((t) => {
          const yy = by(t / 100);
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke={GRID} strokeWidth="1" />
              <text x={padL - 6} y={yy + 3.5} fontSize="10" fill={MUT} textAnchor="end">{t}%</text>
            </g>
          );
        })}
        {/* Barres */}
        {histogram.map((b, i) => {
          const h = Math.max(1.5, (b.probability / maxP) * (H - padT - padB));
          return (
            <rect key={b.date} x={bx(i)} y={H - padB - h} width={barW} height={h} rx="2" fill={zoneOf(b.date)} opacity="0.9">
              <title>{`${formatDateLabel(b.date)} — ${(b.probability * 100).toFixed(1)}%`}</title>
            </rect>
          );
        })}
        {/* Axe X (dates) */}
        {dateTicks.map((i) => (
          <text key={i} x={bx(i) + barW / 2} y={H - padB + 15} fontSize="10" fill={MUT}
            textAnchor={i === 0 ? "start" : i === histogram.length - 1 ? "end" : "middle"}>
            {formatDateLabel(histogram[i].date)}
          </text>
        ))}
        {/* Marqueurs de percentiles */}
        {markers.map((m) => {
          const mx = findX(m.p);
          if (mx == null || mx < 0) return null;
          return (
            <g key={m.label}>
              <line x1={mx} x2={mx} y1={padT - 2} y2={H - padB} stroke={m.color} strokeWidth="1.5" strokeDasharray="4 3" />
              <rect x={mx + 2} y={padT - 4} width={26} height={13} rx="3" fill={m.color} />
              <text x={mx + 15} y={padT + 5.5} fontSize="9" fontWeight="700" fill="#fff" textAnchor="middle">{m.label}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
