import { parseIsoDate } from "@/lib/planning/date-utils";
import { formatDateLabel } from "@/lib/format/formatters";
import type { ProjectView } from "@/types/planning";

/**
 * Deux plannings de Gantt AVANT / APRÈS nivellement (spec FGF p.5) :
 *  - avant = dates au plus tôt (earliest, sans décalage de charge) ;
 *  - après = dates planifiées (scheduled, nivelées).
 * Les LT décalés par le nivellement sont mis en évidence (orange).
 * Composant serveur, SVG pur, lecture seule.
 */

const SURFACE = "#fbfaf6";
const GRID = "#e7e5df";
const MUT = "#94a3b8";
const BEFORE = "#94a3b8";
const AFTER = "#3f8f48";
const SHIFTED = "#e0902a";

function ms(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return parseIsoDate(iso).getTime();
}
const DAY = 86_400_000;

export function LevelingGantt({ view }: { view: ProjectView }) {
  const tasks = view.tasks.filter((t) => !t.isSummary);
  const rows = tasks
    .map((t) => ({
      code: t.wbsCode || t.code,
      name: t.name,
      milestone: t.type === "MILESTONE",
      shifted: (t.levelingDelayDays ?? 0) > 0,
      bStart: ms(t.earliestStartDate) ?? ms(t.scheduledStartDate),
      bEnd: ms(t.earliestFinishDate) ?? ms(t.scheduledFinishDate),
      aStart: ms(t.scheduledStartDate),
      aEnd: ms(t.scheduledFinishDate),
    }))
    .filter((r) => r.aStart != null && r.aEnd != null);

  if (rows.length < 1) {
    return (
      <div className="rounded-2xl border border-white/70 bg-white/85 p-6 text-sm text-slate-500">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Nivellement</div>
        <p className="mt-2">Aucune tâche planifiée à comparer.</p>
      </div>
    );
  }

  const vals: number[] = [];
  for (const r of rows) for (const v of [r.bStart, r.bEnd, r.aStart, r.aEnd]) if (v != null) vals.push(v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const totalShift = rows.filter((r) => r.shifted).length;

  const LABEL_W = 128;
  const rowH = 16;
  const H = rows.length * rowH + 30;
  const W = 460;
  const x = (t: number) => LABEL_W + ((t - min) / Math.max(DAY, max - min)) * (W - LABEL_W - 12);

  function Panel({ title, kind }: { title: string; kind: "before" | "after" }) {
    return (
      <div className="rounded-2xl border border-white/70 bg-white/90 p-3">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 380, height: H }}
            role="img" aria-label={`Planning ${title}.`}>
            <rect width={W} height={H} fill={SURFACE} rx="6" />
            {/* ticks (début / milieu / fin) */}
            {[0, 0.5, 1].map((f) => {
              const t = min + f * (max - min);
              const xx = x(t);
              return (
                <g key={f}>
                  <line x1={xx} x2={xx} y1={16} y2={H - 14} stroke={GRID} />
                  <text x={xx} y={H - 4} fontSize="8.5" fill={MUT} textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}>{formatDateLabel(new Date(t).toISOString().slice(0, 10))}</text>
                </g>
              );
            })}
            {rows.map((r, i) => {
              const y = 16 + i * rowH + 3;
              const s = kind === "before" ? r.bStart : r.aStart;
              const e = kind === "before" ? r.bEnd : r.aEnd;
              if (s == null || e == null) return null;
              const color = kind === "before" ? BEFORE : r.shifted ? SHIFTED : AFTER;
              const bx = x(s);
              const bw = Math.max(r.milestone ? 8 : 4, x(e) - bx);
              return (
                <g key={r.code}>
                  <text x={4} y={y + 8} fontSize="8.5" fill="#334155">{(r.code + " " + r.name).slice(0, 22)}</text>
                  {r.milestone ? (
                    <rect x={bx - 4} y={y + 1} width={9} height={9} rx="1.5" transform={`rotate(45 ${bx} ${y + 5})`} fill={color} />
                  ) : (
                    <rect x={bx} y={y} width={bw} height={10} rx="3" fill={color} opacity={kind === "before" ? 0.6 : 0.95} />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/70 bg-white/85 p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Nivellement · méthode FGF</div>
        <h2 className="mt-1 text-xl font-black tracking-tight text-[#1a4a20]">Planning avant / après nivellement</h2>
        <p className="mt-1 text-sm text-slate-500">
          « Avant » = dates au plus tôt ; « après » = dates nivelées. <strong style={{ color: SHIFTED }}>{totalShift}</strong> LT décalé·s (orange) pour résorber les surcharges.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Avant nivellement (au plus tôt)" kind="before" />
        <Panel title="Après nivellement (planifié)" kind="after" />
      </div>
    </div>
  );
}
