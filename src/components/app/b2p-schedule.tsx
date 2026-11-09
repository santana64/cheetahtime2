import { getProjectB2PDates, getB2PCadenceRule } from "@/lib/fgf/b2p";
import { formatDateLabel } from "@/lib/format/formatters";
import type { ProjectView } from "@/types/planning";

/**
 * Calendrier des bilans B2P — points d'étape FGF (coût & durée passés en revue
 * à chaque B2P). Dates issues du projet si saisies, sinon calculées par la règle
 * FGF (identique à Cheetah Cost).
 */
export function B2PSchedule({ view }: { view: ProjectView }) {
  const project = view.aggregate.project;
  const dateDebut = project.targetStartDate;
  const dateFin = project.targetFinishDate ?? view.schedule.projectFinishDate ?? null;
  if (!dateFin) return null;

  const dates = getProjectB2PDates(project, view.schedule.projectFinishDate);
  if (!dates.length) return null;

  const cadence = getB2PCadenceRule(dateDebut, dateFin);
  const today = new Date().toISOString().slice(0, 10);
  const nextIndex = dates.findIndex((d) => d >= today);

  return (
    <div className="rounded-2xl border border-white/60 bg-white/90 p-5 animate-velocity-enter">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
            Méthode FGF · points d'étape
          </div>
          <div className="mt-0.5 text-base font-black text-[#1a4a20]">Bilans B2P</div>
        </div>
        <span
          className="rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{ background: "rgba(86,164,91,0.10)", border: "1px solid rgba(86,164,91,0.25)", color: "#2a6b30" }}
        >
          {cadence?.label ?? "—"} · {Math.max(0, dates.length - 1)} B2P + B2P0
        </span>
      </div>

      <p className="mb-4 text-[11.5px] leading-relaxed text-slate-500">
        À chaque B2P, on fait le point sur toutes les composantes du projet — coût et durée
        en particulier. Ces dates sont communes à la coûtenance FGF.
      </p>

      <div className="flex flex-wrap gap-2">
        {dates.map((date, i) => {
          const isPast = date < today;
          const isNext = i === nextIndex;
          return (
            <div
              key={`${i}-${date}`}
              className="flex min-w-[112px] flex-col rounded-xl px-3 py-2"
              style={
                isNext
                  ? { background: "linear-gradient(135deg, rgba(244,163,33,0.16), rgba(244,163,33,0.06))", border: "1px solid rgba(244,163,33,0.45)" }
                  : isPast
                    ? { background: "rgba(86,164,91,0.08)", border: "1px solid rgba(86,164,91,0.22)" }
                    : { background: "rgba(15,23,42,0.03)", border: "1px solid rgba(0,0,0,0.07)" }
              }
            >
              <span
                className="text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: isNext ? "#b45309" : isPast ? "#2a6b30" : "rgba(15,23,42,0.45)" }}
              >
                {i === 0 ? "B2P0" : `B2P${i}`}
                {isNext && " · à venir"}
                {isPast && " · ✓"}
              </span>
              <span className="mt-0.5 text-[13px] font-bold text-slate-900">{formatDateLabel(date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
