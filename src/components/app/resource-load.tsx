import { parseIsoDate } from "@/lib/planning/date-utils";
import type { ProjectView } from "@/types/planning";

/**
 * Diagrammes de charges par ressource, AVANT et APRÈS nivellement (spec FGF p.5/22).
 *  - avant nivellement = tâches à leurs dates au plus tôt (earliest) ;
 *  - après nivellement = tâches à leurs dates planifiées (scheduled, nivelées).
 * Intensité = somme des allocations des tâches actives dans le mois ; capacité = 1.
 * Surcharge (> 1) en rouge. Composant serveur, SVG pur, données réelles.
 */

const SURFACE = "#fbfaf6";
const OVER = "#e2424a";
const OK = "#56a45b";
const CAP = "#334155";
const MUT = "#94a3b8";

function msOf(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return parseIsoDate(iso).getTime();
}
function monthStart(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12);
}
function addMonth(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12);
}
function monthLabel(t: number): string {
  return new Date(t).toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
}
function monthKeyOf(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function profile(
  buckets: number[],
  tasks: { start: number | null; finish: number | null; intensity: number }[],
): number[] {
  return buckets.map((b) => {
    const next = addMonth(b);
    let load = 0;
    for (const t of tasks) {
      if (t.start == null || t.finish == null) continue;
      if (t.start < next && t.finish >= b) load += t.intensity;
    }
    return load;
  });
}

export function ResourceLoad({ view }: { view: ProjectView }) {
  const resources = view.aggregate.resources ?? [];
  const assignments = view.aggregate.assignments ?? [];
  const taskById = new Map(view.tasks.map((t) => [t.id, t]));

  const allDates: number[] = [];
  for (const t of view.tasks) {
    for (const d of [t.earliestStartDate, t.earliestFinishDate, t.scheduledStartDate, t.scheduledFinishDate]) {
      const m = msOf(d);
      if (m != null) allDates.push(m);
    }
  }
  if (!resources.length || allDates.length < 2) {
    return (
      <div className="rounded-2xl border border-white/70 bg-white/85 p-6 text-sm text-slate-500">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Diagrammes de charges</div>
        <p className="mt-2">Ajoutez des ressources et affectez-les aux LT (avec intensité) pour visualiser les charges avant/après nivellement.</p>
      </div>
    );
  }

  const min = monthStart(Math.min(...allDates));
  const max = Math.max(...allDates);
  const buckets: number[] = [];
  let cur = min;
  let guard = 0;
  while (cur <= max && guard < 240) { buckets.push(cur); cur = addMonth(cur); guard += 1; }

  const perResource = resources.map((r) => {
    const asg = assignments.filter((a) => a.resourceId === r.id);
    const before = asg.map((a) => {
      const t = taskById.get(a.taskId);
      return { start: msOf(t?.earliestStartDate), finish: msOf(t?.earliestFinishDate), intensity: (a.allocationPct ?? 0) / 100 };
    });
    const after = asg.map((a) => {
      const t = taskById.get(a.taskId);
      return { start: msOf(t?.scheduledStartDate), finish: msOf(t?.scheduledFinishDate), intensity: (a.allocationPct ?? 0) / 100 };
    });
    // Plafond de capacité par mois = disponibilité saisie (1 par défaut = pleine dispo).
    const cap = buckets.map((b) => {
      const v = r.availabilityByMonth?.[monthKeyOf(b)];
      return v == null ? 1 : v;
    });
    return { r, before: profile(buckets, before), after: profile(buckets, after), cap };
  }).filter((x) => x.before.some((v) => v > 0) || x.after.some((v) => v > 0));

  if (!perResource.length) {
    return (
      <div className="rounded-2xl border border-white/70 bg-white/85 p-6 text-sm text-slate-500">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Diagrammes de charges</div>
        <p className="mt-2">Aucune affectation ressource sur des LT planifiés.</p>
      </div>
    );
  }

  const maxLoad = Math.max(1.2, ...perResource.flatMap((x) => [...x.before, ...x.after, ...x.cap]));

  function Histogram({ data, cap, title }: { data: number[]; cap: number[]; title: string }) {
    const W = 440, H = 120, padL = 26, padB = 18, padT = 8;
    const colW = (W - padL - 6) / data.length;
    const bw = Math.max(2, colW - 1);
    const bx = (i: number) => padL + i * colW;
    const by = (v: number) => padT + (1 - v / maxLoad) * (H - padT - padB);
    return (
      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }}
          role="img" aria-label={`${title} : intensité par mois, plafond = disponibilité de la ressource.`}>
          <rect width={W} height={H} fill={SURFACE} rx="6" />
          {[0, 1, 2].filter((t) => t <= maxLoad).map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - 4} y1={by(t)} y2={by(t)} stroke="#e7e5df" strokeWidth={1} />
              <text x={padL - 4} y={by(t) + 3} fontSize="8.5" fill={MUT} textAnchor="end">{t}</text>
            </g>
          ))}
          {data.map((v, i) => {
            const h = Math.max(0, (v / maxLoad) * (H - padT - padB));
            const over = v > cap[i] + 0.001;
            return (
              <rect key={i} x={bx(i)} y={H - padB - h} width={bw} height={h} rx="1.5" fill={over ? OVER : OK} opacity="0.9">
                <title>{`${monthLabel(buckets[i])} — intensité ${v.toFixed(2)} / dispo ${cap[i].toFixed(2)}${over ? " (surcharge)" : ""}`}</title>
              </rect>
            );
          })}
          {/* Plafond de disponibilité, en escalier (suit le calendrier de dispo). */}
          {cap.map((c, i) => (
            <line key={`cap-${i}`} x1={bx(i)} x2={bx(i) + colW} y1={by(c)} y2={by(c)}
              stroke={CAP} strokeWidth={1.4} strokeDasharray="5 3" />
          ))}
          <text x={padL} y={H - 5} fontSize="8" fill={MUT}>{monthLabel(buckets[0])}</text>
          <text x={W - 6} y={H - 5} fontSize="8" fill={MUT} textAnchor="end">{monthLabel(buckets[buckets.length - 1])}</text>
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/70 bg-white/85 p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Charges ressources · méthode FGF</div>
        <h2 className="mt-1 text-xl font-black tracking-tight text-[#1a4a20]">Diagrammes de charges — avant / après nivellement</h2>
        <p className="mt-1 text-sm text-slate-500">
          Intensité mensuelle par ressource. La ligne pointillée <span className="font-semibold" style={{ color: CAP }}>en escalier</span> = disponibilité (calendrier ci-dessous) ; barres <span className="font-semibold" style={{ color: OVER }}>rouges</span> = surcharge à résorber.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {perResource.map(({ r, before, after, cap }) => (
          <div key={r.id} className="rounded-2xl border border-white/70 bg-white/90 p-4">
            <div className="mb-2 text-sm font-bold text-slate-800">{r.code} · {r.name}</div>
            <div className="grid gap-3">
              <Histogram data={before} cap={cap} title="Avant nivellement" />
              <Histogram data={after} cap={cap} title="Après nivellement" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
