import { parseIsoDate } from "@/lib/planning/date-utils";
import { formatDateLabel, formatPercent } from "@/lib/format/formatters";
import { buildRecommendedB2PDates, getB2PCadenceRule } from "@/lib/fgf/b2p";
import { classifyIndex, levelLabel, type LensLevel } from "@/lib/fgf/two-lens";
import { calculateEarnedSchedule } from "@/services/advanced-planning";
import type { ProjectView } from "@/types/planning";

/**
 * Cockpit DÉLAI FGF — au B2P courant.
 * Cheetah Time est un outil de MAÎTRISE DES DÉLAIS : aucune notion de coût ici
 * (le coût est traité par Cheetah Cost). Le projet est jugé sous la seule
 * lentille délai (SPI_t / Earned Schedule) sur le rythme des B2P.
 * Aucune donnée factice : tout vient du moteur de planification.
 */

const LEVEL: Record<LensLevel, { dot: string; soft: string; ring: string; text: string }> = {
  favorable: { dot: "#56a45b", soft: "rgba(86,164,91,0.12)", ring: "rgba(86,164,91,0.40)", text: "#1a7f37" },
  vigilance: { dot: "#f4a321", soft: "rgba(244,163,33,0.14)", ring: "rgba(244,163,33,0.42)", text: "#b45309" },
  tension:   { dot: "#e8842f", soft: "rgba(232,132,47,0.14)", ring: "rgba(232,132,47,0.42)", text: "#c2410c" },
  critique:  { dot: "#e2424a", soft: "rgba(226,66,74,0.12)",  ring: "rgba(226,66,74,0.42)",  text: "#be123c" },
};

const PHRASE: Record<LensLevel, string> = {
  favorable: "maîtrisé",
  vigilance: "à surveiller",
  tension: "sous tension",
  critique: "critique",
};

const POS = "#1a7f37";
const NEG = "#be123c";

function msFrac(start: string, end: string, at: string): number {
  const s = parseIsoDate(start).getTime();
  const e = parseIsoDate(end).getTime();
  const a = parseIsoDate(at).getTime();
  if (!(e > s)) return 0;
  return Math.max(0, Math.min(1, (a - s) / (e - s)));
}

/** Jauge d'indice de performance délai centrée sur 1.00 (au plan). */
function IndexGauge({ index, dot }: { index: number | null; dot: string }) {
  const has = index != null && Number.isFinite(index);
  const clamped = Math.max(0.7, Math.min(1.2, has ? (index as number) : 1));
  const pos = ((clamped - 0.7) / 0.5) * 100;
  const center = 60;
  return (
    <div
      role="img"
      aria-label={`Indice délai ${has ? (index as number).toFixed(2) : "indisponible"} (1,00 = au plan)`}
      className="relative mt-2 h-6"
    >
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ background: "rgba(15,23,42,0.10)" }} />
      <div className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ left: `${center}%`, right: 0, background: "rgba(86,164,91,0.30)" }} />
      <div className="absolute top-1/2 h-3 w-px -translate-y-1/2" style={{ left: `${center}%`, background: "rgba(15,23,42,0.35)" }} />
      <div className="absolute top-full mt-[1px] -translate-x-1/2 text-[8.5px] font-semibold text-slate-400" style={{ left: `${center}%` }}>1,00</div>
      {has && (
        <div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${pos}%`, background: dot, boxShadow: `0 0 0 3px rgba(255,255,255,0.9), 0 0 8px ${dot}` }}
        />
      )}
    </div>
  );
}

export function FgfCockpit({ view }: { view: ProjectView }) {
  const project = view.aggregate.project;
  const metrics = view.metrics;

  const es = calculateEarnedSchedule(view);
  const spi = es.SPI_t ?? metrics.schedulePerformanceIndex ?? null;
  const slip = metrics.scheduleSlipDays ?? 0;
  const level = classifyIndex(spi, slip > 0);
  const lv = LEVEL[level];

  // Rythme B2P — calé sur la fin RÉELLE (la plus tardive entre contractuelle et
  // calculée par le moteur), pour que l'estimation affiche bien ses B2P.
  const dateDebut = project.targetStartDate;
  const dateFin =
    [project.targetFinishDate ?? null, view.schedule.projectFinishDate ?? null]
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;
  const b2pDates = dateFin ? buildRecommendedB2PDates({ dateDebut, dateFin }) : [];
  const cadence = dateFin ? getB2PCadenceRule(dateDebut, dateFin) : null;
  const today = new Date().toISOString().slice(0, 10);
  const nextIndex = b2pDates.findIndex((d) => d >= today);
  const currentB2P = nextIndex >= 0 ? nextIndex : Math.max(0, b2pDates.length - 1);
  const railStart = b2pDates[0] ?? dateDebut;
  const railEnd = b2pDates[b2pDates.length - 1] ?? dateFin ?? dateDebut;
  const sparse = b2pDates.length > 11;

  // Fin prévue vs contractuelle.
  const finish = view.schedule.projectFinishDate ?? null;
  const target = project.targetFinishDate ?? null;
  const finishDelta =
    finish && target
      ? Math.round((parseIsoDate(finish).getTime() - parseIsoDate(target).getTime()) / 86_400_000)
      : null;

  const verdict =
    slip > 0
      ? `Délai ${PHRASE[level]} — glissement de ${slip} j sur le chemin critique (${metrics.criticalTaskCount} tâche·s).`
      : level === "favorable"
        ? "Délai maîtrisé — la fin au plus tôt tient le référentiel."
        : `Délai ${PHRASE[level]} — à surveiller sur le chemin critique.`;

  const rows: { label: string; value: React.ReactNode; tone?: string }[] = [
    { label: "Glissement", value: slip > 0 ? `+${slip} j` : "0 j", tone: slip > 0 ? NEG : POS },
    {
      label: "Fin prévue",
      value: formatDateLabel(finish),
      tone: finishDelta == null ? undefined : finishDelta > 0 ? NEG : POS,
    },
    { label: "Fin contractuelle", value: formatDateLabel(target) },
    { label: "Fin prévue (Earned Schedule)", value: formatDateLabel(es.IEAC_t), tone: "#b45309" },
    { label: "Avancement", value: formatPercent(metrics.overallProgress) },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl panel-solid">
      <div className="relative h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${lv.dot}, rgba(244,163,33,0.7), ${lv.dot})` }} />

      <div className="relative p-5">
        {/* Verdict délai */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-slate-400">
              Cockpit délai FGF · pilotage du temps
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-[19px] font-black leading-tight text-slate-900">
              <span className="inline-flex size-2.5 flex-shrink-0 rounded-full" style={{ background: lv.dot, boxShadow: `0 0 10px ${lv.ring}` }} aria-hidden="true" />
              <span className="truncate">{verdict}</span>
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              {project.name} · avancement {formatPercent(metrics.overallProgress)} · {metrics.executableTaskCount} tâche·s au réseau
            </p>
          </div>
          {b2pDates.length > 0 && (
            <div className="rounded-xl px-3 py-2 text-right" style={{ background: "rgba(244,163,33,0.10)", border: "1px solid rgba(244,163,33,0.30)" }}>
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#b45309]">B2P courant</div>
              <div className="mt-0.5 text-[15px] font-black text-slate-900">
                {currentB2P === 0 ? "B2P0" : `B2P${currentB2P}`}
              </div>
              <div className="text-[10px] text-slate-500">{formatDateLabel(b2pDates[currentB2P])}</div>
            </div>
          )}
        </div>

        {/* Rail de rythme B2P — signature */}
        {b2pDates.length > 1 && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <span>Rythme B2P {cadence ? `· ${cadence.label.toLowerCase()}` : ""}</span>
              <span>{Math.max(0, b2pDates.length - 1)} B2P + B2P0</span>
            </div>
            <div className="overflow-x-auto pb-1">
              <div className="relative mx-1" style={{ minWidth: Math.max(320, b2pDates.length * 46), height: 46 }}>
                <div className="absolute left-0 right-0 top-[14px] h-[2px] rounded-full" style={{ background: "rgba(15,23,42,0.12)" }} />
                <div
                  className="absolute left-0 top-[14px] h-[2px] rounded-full"
                  style={{ width: `${msFrac(railStart, railEnd, today > railEnd ? railEnd : today < railStart ? railStart : today) * 100}%`, background: "linear-gradient(90deg, #56a45b, #f4a321)" }}
                />
                {today >= railStart && today <= railEnd && (
                  <div className="absolute top-0" style={{ left: `${msFrac(railStart, railEnd, today) * 100}%` }}>
                    <div className="h-[26px] w-px -translate-x-1/2" style={{ background: "rgba(15,23,42,0.45)" }} />
                    <div className="mt-0.5 -translate-x-1/2 whitespace-nowrap text-[8.5px] font-semibold text-slate-500">aujourd’hui</div>
                  </div>
                )}
                {b2pDates.map((d, i) => {
                  const frac = msFrac(railStart, railEnd, d);
                  const isPast = d < today;
                  const isCurrent = i === currentB2P;
                  const showLabel = !sparse || i === 0 || i === currentB2P || i === b2pDates.length - 1;
                  return (
                    <div key={`${i}-${d}`} className="absolute top-0 -translate-x-1/2" style={{ left: `${frac * 100}%` }}>
                      <div className="flex h-[28px] items-center justify-center">
                        {isCurrent ? (
                          <span className="relative flex size-3.5 items-center justify-center">
                            <span className="absolute inline-flex size-3.5 rounded-full animate-paw-ripple" style={{ background: "rgba(244,163,33,0.45)" }} />
                            <span className="relative inline-flex size-3 rounded-full" style={{ background: "#f4a321", boxShadow: "0 0 0 2px rgba(255,255,255,0.9)" }} />
                          </span>
                        ) : isPast ? (
                          <span className="inline-flex size-2.5 rounded-full" style={{ background: "#56a45b", boxShadow: "0 0 0 2px rgba(255,255,255,0.9)" }} />
                        ) : (
                          <span className="inline-flex size-2 rounded-full" style={{ background: "rgba(15,23,42,0.18)", border: "1px solid rgba(15,23,42,0.28)" }} />
                        )}
                      </div>
                      {showLabel && (
                        <div
                          className="-translate-x-1/2 whitespace-nowrap text-center text-[8.5px] font-bold"
                          style={{ color: isCurrent ? "#b45309" : isPast ? "#1a7f37" : "rgba(15,23,42,0.40)", marginLeft: "50%" }}
                        >
                          {i === 0 ? "B2P0" : `B2P${i}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Lentille délai (unique) */}
        <section
          className="relative mt-4 overflow-hidden rounded-xl p-4"
          style={{ background: "rgba(15,23,42,0.02)", border: "1px solid rgba(0,0,0,0.08)" }}
          aria-label={`Lentille Délai — ${levelLabel(level)}`}
        >
          <div className="h-[2.5px] w-9 rounded-full" style={{ background: lv.dot }} aria-hidden="true" />
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Lentille Délai</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{ background: lv.soft, border: `1px solid ${lv.ring}`, color: lv.text }}
            >
              {levelLabel(level)}
            </span>
          </div>

          <div className="mt-1.5 flex items-end gap-2">
            <div className="font-mono text-[26px] font-black leading-none tabular-nums text-slate-900">
              {spi != null ? spi.toFixed(2) : "n/a"}
            </div>
            <div className="pb-0.5 text-[10.5px] font-semibold text-slate-400">SPI_t · perf. délai</div>
          </div>
          <IndexGauge index={spi} dot={lv.dot} />

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {rows.map((r) => (
              <div key={r.label} className="min-w-0">
                <dt className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{r.label}</dt>
                <dd className="mt-0.5 truncate font-mono text-[12.5px] font-bold tabular-nums" style={{ color: r.tone ?? "#1e293b" }}>
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
