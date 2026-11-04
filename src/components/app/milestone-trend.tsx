import { parseIsoDate } from "@/lib/planning/date-utils";
import { formatDateLabel } from "@/lib/format/formatters";
import type { ProjectView } from "@/types/planning";

/**
 * Graphiques FGF de suivi des jalons (spec François, pages 8-9) :
 *  - Temps/Temps : pour chaque jalon, sa date prévue (Y) à chaque mesure (X) ;
 *    la diagonale = jalon franchi (prévu = date de mesure).
 *  - Jalons-Jalons : par jalon, date de référence (PI) vs prévision courante.
 * Les « mesures » sont les référentiels capturés (un par B2P) + l'état courant.
 * Composant serveur, SVG pur. Données réelles ; état vide géré.
 */

const SURFACE = "#fbfaf6";
const GRID = "#e7e5df";
const MUT = "#94a3b8";
const REF = "#64748b"; // diagonale / référence
// Palette catégorielle par jalon (ordre fixe).
const SERIES = ["#1a4a20", "#c2710c", "#3730a3", "#be123c", "#0ea5a4", "#9333ea", "#0369a1", "#4d7c0f"];

type Pt = { measure: number; forecast: number; measureISO: string; forecastISO: string };
type Series = { code: string; name: string; color: string; points: Pt[]; ref: number | null; current: number | null };

function ms(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return parseIsoDate(iso).getTime();
}

function build(view: ProjectView) {
  const milestones = view.tasks.filter((t) => t.type === "MILESTONE");
  // Mesures = référentiels triés par date de capture, puis « Actuel ».
  const baselines = [...(view.aggregate.baselines ?? [])].sort(
    (a, b) => a.capturedAt.localeCompare(b.capturedAt),
  );
  const today = new Date().toISOString().slice(0, 10);
  const measures: { iso: string; label: string; snapById: Map<string, string | null> }[] = [];
  baselines.forEach((b, i) => {
    const snapById = new Map<string, string | null>();
    for (const s of b.snapshots) snapById.set(s.taskId, s.finishDate ?? null);
    measures.push({ iso: b.capturedAt.slice(0, 10), label: `B2P${i}`, snapById });
  });
  // État courant (dernière mesure).
  const currentSnap = new Map<string, string | null>();
  for (const t of milestones) currentSnap.set(t.id, t.scheduledFinishDate ?? null);
  measures.push({ iso: today, label: "Actuel", snapById: currentSnap });

  const series: Series[] = milestones.map((m, i) => {
    const points: Pt[] = [];
    for (const meas of measures) {
      const fIso = meas.snapById.get(m.id);
      const measure = ms(meas.iso);
      const forecast = ms(fIso ?? null);
      if (measure != null && forecast != null) {
        points.push({ measure, forecast, measureISO: meas.iso, forecastISO: fIso as string });
      }
    }
    const ref = points.length ? points[0].forecast : null;
    const current = ms(m.scheduledFinishDate ?? null);
    return { code: m.wbsCode || m.code || `J${i + 1}`, name: m.name, color: SERIES[i % SERIES.length], points, ref, current };
  });

  const allVals: number[] = [];
  for (const s of series) for (const p of s.points) { allVals.push(p.measure, p.forecast); }
  return { series, measures, hasHistory: baselines.length > 0, min: allVals.length ? Math.min(...allVals) : 0, max: allVals.length ? Math.max(...allVals) : 0 };
}

function fmtMs(v: number): string {
  return formatDateLabel(new Date(v).toISOString().slice(0, 10));
}

export function MilestoneTrend({ view }: { view: ProjectView }) {
  const { series, hasHistory, min, max } = build(view);

  if (!series.length) {
    return (
      <div className="rounded-2xl border border-white/70 bg-white/85 p-6 text-sm text-slate-500">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Suivi des jalons (FGF)</div>
        <p className="mt-2">Aucun jalon dans ce projet. Ajoutez des jalons (J1…J9) pour activer les diagrammes Temps/Temps et Jalons-Jalons.</p>
      </div>
    );
  }

  const span = Math.max(1, max - min);
  const pad = span * 0.08;
  const dmin = min - pad, dmax = max + pad;
  const W = 900, H = 340, padL = 66, padR = 130, padT = 20, padB = 40;
  const x = (v: number) => padL + ((v - dmin) / (dmax - dmin)) * (W - padL - padR);
  const y = (v: number) => H - padB - ((v - dmin) / (dmax - dmin)) * (H - padT - padB);
  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => dmin + (i / ticks) * (dmax - dmin));

  // Jalons-Jalons : lanes ref vs courant.
  const laneH = 26;
  const JW = 900, Jpad = 66, JpadR = 130;
  const jx = (v: number) => Jpad + ((v - dmin) / (dmax - dmin)) * (JW - Jpad - JpadR);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/70 bg-white/85 p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Suivi des jalons · méthode FGF</div>
        <h2 className="mt-1 text-xl font-black tracking-tight text-[#1a4a20]">Temps/Temps &amp; Jalons-Jalons</h2>
        <p className="mt-1 text-sm text-slate-500">
          {series.length} jalon·s · {hasHistory ? "mesures = référentiels B2P + état courant" : "capturez un référentiel à chaque B2P pour bâtir la tendance"}.
        </p>
      </div>

      {/* Temps/Temps */}
      <div className="rounded-2xl border border-white/70 bg-white/90 p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <div className="text-sm font-bold text-slate-800">Diagramme Temps/Temps</div>
          <div className="text-[11px] text-slate-400">X = date de mesure · Y = date prévue du jalon · diagonale = jalon franchi</div>
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-[320px] w-full" role="img" aria-label="Diagramme Temps/Temps : évolution de la date prévue de chaque jalon à chaque mesure.">
            <rect width={W} height={H} fill={SURFACE} rx="8" />
            {tickVals.map((tv, i) => (
              <g key={i}>
                <line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} stroke={GRID} />
                <text x={padL - 6} y={y(tv) + 3} fontSize="9.5" fill={MUT} textAnchor="end">{fmtMs(tv)}</text>
                <text x={x(tv)} y={H - padB + 15} fontSize="9.5" fill={MUT} textAnchor="middle">{fmtMs(tv)}</text>
              </g>
            ))}
            {/* Diagonale jalon franchi */}
            <line x1={x(dmin)} y1={y(dmin)} x2={x(dmax)} y2={y(dmax)} stroke={REF} strokeWidth="1.5" strokeDasharray="6 4" />
            <text x={x(dmax) - 4} y={y(dmax) + 14} fontSize="9" fill={REF} textAnchor="end">jalon franchi</text>
            {/* Séries jalon */}
            {series.map((s) => {
              if (!s.points.length) return null;
              const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.measure).toFixed(1)} ${y(p.forecast).toFixed(1)}`).join(" ");
              const last = s.points[s.points.length - 1];
              return (
                <g key={s.code}>
                  {s.points.length > 1 && <path d={d} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
                  {s.points.map((p, i) => (
                    <circle key={i} cx={x(p.measure)} cy={y(p.forecast)} r="3.4" fill={s.color} stroke={SURFACE} strokeWidth="1.3">
                      <title>{`${s.code} ${s.name}\nmesure ${fmtMs(p.measure)} → prévu ${fmtMs(p.forecast)}`}</title>
                    </circle>
                  ))}
                  <text x={x(last.measure) + 6} y={y(last.forecast) + 3} fontSize="9.5" fontWeight="700" fill={s.color}>{s.code}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Jalons-Jalons */}
      <div className="rounded-2xl border border-white/70 bg-white/90 p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-bold text-slate-800">Diagramme Jalons-Jalons</div>
          <div className="text-[11px] text-slate-400">
            <span className="mr-3"><span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: REF }} />référence (PI)</span>
            <span><span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: "#e2424a" }} />prévision</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${JW} ${series.length * laneH + 40}`} className="w-full" style={{ height: series.length * laneH + 40 }}
            role="img" aria-label="Diagramme Jalons-Jalons : date de référence vs prévision courante par jalon.">
            <rect width={JW} height={series.length * laneH + 40} fill={SURFACE} rx="8" />
            {tickVals.map((tv, i) => (
              <g key={i}>
                <line x1={jx(tv)} x2={jx(tv)} y1={18} y2={series.length * laneH + 18} stroke={GRID} />
                <text x={jx(tv)} y={series.length * laneH + 32} fontSize="9.5" fill={MUT} textAnchor="middle">{fmtMs(tv)}</text>
              </g>
            ))}
            {series.map((s, i) => {
              const cy = 18 + i * laneH + laneH / 2;
              const late = s.ref != null && s.current != null && s.current > s.ref;
              return (
                <g key={s.code}>
                  <text x={Jpad - 8} y={cy + 3} fontSize="10" fontWeight="700" fill="#334155" textAnchor="end">{s.code}</text>
                  {s.ref != null && s.current != null && (
                    <line x1={jx(s.ref)} y1={cy} x2={jx(s.current)} y2={cy} stroke={late ? "#e2424a" : "#56a45b"} strokeWidth="2" />
                  )}
                  {s.ref != null && <circle cx={jx(s.ref)} cy={cy} r="4" fill={REF} />}
                  {s.current != null && (
                    <circle cx={jx(s.current)} cy={cy} r="4.5" fill={late ? "#e2424a" : "#56a45b"}>
                      <title>{`${s.code} ${s.name}\nréférence ${s.ref != null ? fmtMs(s.ref) : "—"} · prévu ${fmtMs(s.current)}`}</title>
                    </circle>
                  )}
                  <text x={jx(s.current ?? s.ref ?? dmin) + 8} y={cy + 3} fontSize="9" fill={late ? "#b91c1c" : "#3f8f48"}>
                    {s.name.slice(0, 18)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
