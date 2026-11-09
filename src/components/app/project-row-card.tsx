import Link from "next/link";

import { formatDateLabel } from "@/lib/format/formatters";
import { formatGap, type DelayBanner } from "@/lib/fgf/delay-banner";
import type { ProjectView } from "@/types/planning";

/** Carte projet (liste et PMO) : identité + bandeau délai condensé + accès. */
export function ProjectRowCard({
  view,
  banner,
  children,
}: {
  view: ProjectView;
  banner: DelayBanner;
  children?: React.ReactNode;
}) {
  const p = view.aggregate.project;
  const late = (banner.ecart ?? 0) > 0;
  return (
    <article className="ct-card flex flex-col overflow-hidden">
      <div className="h-[2px] w-full" style={{ background: late ? "#e2424a" : "linear-gradient(90deg,#56a45b,#f4a321)" }} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="section-label truncate">
              {p.code} · {p.phase ?? "—"} · {p.clientName}
            </div>
            <h3 className="mt-0.5 truncate text-[15px] font-black text-[#0d1f10]" title={p.name}>
              <Link prefetch={false} href={`/projects/${p.id}/dashboard`} className="hover:underline">
                {p.name}
              </Link>
            </h3>
          </div>
          {banner.hasPI ? (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
              style={banner.actionRequise ? { background: "rgba(226,66,74,0.10)", color: "#be123c" } : { background: "rgba(86,164,91,0.12)", color: "#1a7f37" }}
            >
              {banner.actionRequise ? "Action requise" : "Sous contrôle"}
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">Planification</span>
          )}
        </div>
        <dl className="grid grid-cols-4 gap-2">
          {[
            ["PàD", formatDateLabel(banner.finADate)],
            ["FP", formatDateLabel(banner.finPrevisionnelle)],
            ["Écart", formatGap(banner.ecart, banner.unitLabel)],
            ["Avanc.", `${banner.avancement} %`],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="section-label">{k}</dt>
              <dd className={`ct-num whitespace-nowrap text-[12px] font-bold ${k === "Écart" && late ? "text-[#be123c]" : "text-slate-900"}`}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-black/[0.05] pt-3">
          <Link prefetch={false} href={`/projects/${p.id}/planning`} className="toolbar-btn toolbar-btn-primary">Planning</Link>
          <Link prefetch={false} href={`/projects/${p.id}/b2p`} className="toolbar-btn">Tableaux B2P</Link>
          <Link prefetch={false} href={`/projects/${p.id}/dashboard`} className="toolbar-btn">Alerte</Link>
          {children}
        </div>
      </div>
    </article>
  );
}
