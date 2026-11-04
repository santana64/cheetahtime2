import { formatDateLabel } from "@/lib/format/formatters";
import { formatGap, type DelayBanner } from "@/lib/fgf/delay-banner";
import type { Project } from "@/types/planning";

/**
 * « Tableaux B2P » (CdC p. 12), transposés en délai : carte de référence
 * initiale B2P0, puis une carte « Prévision avant pilotage T2Pi-1 » par B2P
 * franchi, avec le statut « action de pilotage requise / non requise ».
 */
export function B2PTables({
  dates,
  banner,
  snapshots,
  unitLabel,
}: {
  dates: string[];
  banner: DelayBanner;
  snapshots: NonNullable<Project["b2pSnapshots"]>;
  unitLabel: string;
}) {
  const cards: {
    key: string;
    title: string;
    subtitle: string;
    fp: string | null;
    ecart: number | null;
    avancement: number;
    action: boolean | null;
    live?: boolean;
  }[] = [
    {
      key: "b2p0",
      title: "Référence initiale : B2P0",
      subtitle: dates[0] ? `Planning Initial — ${formatDateLabel(dates[0])}` : "Planning Initial",
      fp: banner.finInitiale,
      ecart: 0,
      avancement: 0,
      action: null,
    },
  ];
  dates.slice(1).forEach((date, i) => {
    const snap = snapshots[date];
    if (!snap) return;
    cards.push({
      key: date,
      title: `Prévision avant pilotage : T2P${i + 1}-1`,
      subtitle: `B2P${i + 1} — ${formatDateLabel(date)}`,
      fp: snap.finPrevisionnelle,
      ecart: snap.ecart,
      avancement: snap.avancement,
      action: snap.actionRequise,
    });
  });
  // Instantanés saisis à une date hors calendrier B2P (B2P exceptionnel).
  for (const [date, snap] of Object.entries(snapshots)) {
    if (dates.includes(date)) continue;
    cards.push({
      key: date,
      title: "Prévision avant pilotage (B2P exceptionnel)",
      subtitle: formatDateLabel(date),
      fp: snap.finPrevisionnelle,
      ecart: snap.ecart,
      avancement: snap.avancement,
      action: snap.actionRequise,
    });
  }
  cards.push({
    key: "live",
    title: "Situation à la date actuelle",
    subtitle: `Date d'état ${formatDateLabel(banner.dateActuelle)}`,
    fp: banner.finPrevisionnelle,
    ecart: banner.ecart,
    avancement: banner.avancement,
    action: banner.hasPI ? banner.actionRequise : null,
    live: true,
  });

  return (
    <section aria-labelledby="b2p-tables-title">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="b2p-tables-title" className="ct-title text-[17px]">Tableaux B2P</h2>
        <span className="text-[11.5px] text-slate-500">Écarts en {unitLabel} (FP − PàD)</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <article
            key={c.key}
            className="ct-card p-4"
            style={c.live ? { borderColor: "rgba(244,163,33,0.45)" } : undefined}
          >
            <div className="section-label">{c.subtitle}</div>
            <h3 className="mt-0.5 text-[13.5px] font-black text-[#0d1f10]">{c.title}</h3>
            {c.action != null ? (
              <div
                className="mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                style={
                  c.action
                    ? { background: "rgba(226,66,74,0.10)", color: "#be123c" }
                    : { background: "rgba(86,164,91,0.12)", color: "#1a7f37" }
                }
              >
                {c.action ? "Action de pilotage requise" : "Action de pilotage non requise"}
              </div>
            ) : null}
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <dt className="section-label">FP</dt>
                <dd className="ct-num text-[12.5px] font-bold text-slate-900">{formatDateLabel(c.fp)}</dd>
              </div>
              <div>
                <dt className="section-label">Écart</dt>
                <dd
                  className="ct-num text-[12.5px] font-black"
                  style={{ color: (c.ecart ?? 0) > 0 ? "#be123c" : "#047857" }}
                >
                  {formatGap(c.ecart, unitLabel)}
                </dd>
              </div>
              <div>
                <dt className="section-label">Avancement</dt>
                <dd className="ct-num text-[12.5px] font-bold text-slate-900">{c.avancement} %</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
