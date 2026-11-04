import { formatDateLabel } from "@/lib/format/formatters";
import { formatGap, type DelayBanner } from "@/lib/fgf/delay-banner";

/**
 * Bandeau de pilotage du temps (CdC p. 12) : Fi · PàD · Date actuelle · FP ·
 * Écart (unité du projet) · Avancement + statut « action de pilotage ».
 * Une seule place pour la Fin Prévisionnelle, un seul format de date.
 */
export function DelayBannerStrip({ banner, compact = false }: { banner: DelayBanner; compact?: boolean }) {
  const late = (banner.ecart ?? 0) > 0;
  const cells: { label: string; title: string; value: string; tone?: string; strong?: boolean }[] = [
    { label: "Fi", title: "Fin Initiale — fin du Planning Initial (PI = B2P0)", value: formatDateLabel(banner.finInitiale) },
    { label: "PàD", title: "Fin à Date — fin du Planning à Date (référence en vigueur)", value: formatDateLabel(banner.finADate) },
    { label: "Date actuelle", title: "Date d'état : le reste à faire est replanifié à partir de cette date", value: formatDateLabel(banner.dateActuelle) },
    { label: "FP", title: "Fin Prévisionnelle calculée par le moteur", value: formatDateLabel(banner.finPrevisionnelle), strong: true, tone: late ? "#be123c" : "#1a4a20" },
    {
      label: "Écart",
      title: `Écart FP − PàD, en ${banner.unit} (positif = retard)`,
      value: formatGap(banner.ecart, banner.unitLabel),
      tone: banner.ecart == null ? undefined : late ? "#be123c" : "#047857",
      strong: true,
    },
    { label: "Avancement", title: "Avancement physique global", value: `${banner.avancement} %` },
  ];

  return (
    <div className={compact ? "flex flex-wrap items-stretch gap-2" : "flex flex-wrap items-stretch gap-2.5"}>
      <dl className="grid flex-1 grid-cols-2 gap-px overflow-hidden rounded-xl border border-black/[0.08] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-6">
        {cells.map((cell) => (
          <div key={cell.label} className="bg-white px-3 py-2" title={cell.title}>
            <dt className="section-label">{cell.label}</dt>
            <dd
              className={`ct-num mt-0.5 ${cell.strong ? "text-[14px] font-black" : "text-[13px] font-bold"}`}
              style={{ color: cell.tone ?? "#0d1f10" }}
            >
              {cell.value}
            </dd>
          </div>
        ))}
      </dl>
      {banner.hasPI ? (
        <div
          role="status"
          className="flex min-w-[170px] flex-col justify-center rounded-xl border px-3 py-2"
          style={
            banner.actionRequise
              ? { borderColor: "rgba(226,66,74,0.35)", background: "rgba(226,66,74,0.07)" }
              : { borderColor: "rgba(86,164,91,0.35)", background: "rgba(86,164,91,0.08)" }
          }
        >
          <div className="section-label">Pilotage</div>
          <div className="mt-0.5 text-[12.5px] font-black" style={{ color: banner.actionRequise ? "#be123c" : "#1a7f37" }}>
            {banner.actionRequise ? "Action de pilotage requise" : "Action de pilotage non requise"}
          </div>
        </div>
      ) : (
        <div className="flex min-w-[170px] flex-col justify-center rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2">
          <div className="section-label">Pilotage</div>
          <div className="mt-0.5 text-[12px] font-semibold text-slate-600">PI non figé — planification</div>
        </div>
      )}
    </div>
  );
}
