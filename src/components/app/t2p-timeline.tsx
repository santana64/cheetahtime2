import Link from "next/link";

import { formatGap } from "@/lib/fgf/delay-banner";
import {
  aggregateT2P,
  getT2PDescriptor,
  getT2PEcartReference,
  getT2PLabel,
  getT2PStatus,
  sortT2PTables,
  t2pUnitLabel,
  type T2PStatus,
} from "@/lib/fgf/t2p";
import { formatDateLabel } from "@/lib/format/formatters";
import type { ProjectView, T2PTable } from "@/types/planning";

/** Couleurs des statuts — mêmes teintes que B2PTimeline (Cheetah Cost). */
const STATUS_STYLE: Record<T2PStatus, { accent: string; pill: string }> = {
  reference: { accent: "#3b82f6", pill: "border-blue-200 bg-blue-50 text-blue-800" },
  "non-requise": { accent: "#56a45b", pill: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  requise: { accent: "#ef4444", pill: "border-red-200 bg-red-50 text-red-700" },
  envisagee: { accent: "#f4a321", pill: "border-amber-200 bg-amber-50 text-amber-800" },
  choisie: { accent: "#6366f1", pill: "border-indigo-200 bg-indigo-50 text-indigo-800" },
};

/**
 * Liste des tableaux B2P (délai) — transposition de B2PTimeline (Cheetah Cost) :
 * un bloc par tableau, liseré de statut, code T2P, descripteur, date, FP,
 * écart E, écart précédent, dérive D et avancement.
 */
export function T2PTimeline({ view, activeId }: { view: ProjectView; activeId?: string }) {
  const project = view.aggregate.project;
  const tables = sortT2PTables(project.t2pTables ?? []);
  const locked = new Set(project.lockedT2PIds ?? []);
  const calendar = view.aggregate.calendar;

  if (!tables.length) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-8 py-12 text-center">
        <p className="text-[13px] font-semibold text-slate-600">Aucun tableau B2P</p>
        <p className="mt-1 text-[11px] text-slate-400">Commencez par créer le tableau B2P0 (situation initiale).</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {tables.map((table) => {
        const agg = aggregateT2P(table, calendar);
        const ref = getT2PEcartReference(tables, table);
        const prevEcart = ref ? (ref.tableKind === "b2p0" ? 0 : aggregateT2P(ref, calendar).ecart) : 0;
        const derive = Math.round((agg.ecart - prevEcart) * 100) / 100;
        const status = getT2PStatus(table, agg);
        const style = STATUS_STYLE[status.status];
        const unit = t2pUnitLabel(table.unit);
        const active = table.id === activeId;
        return (
          <Link
            key={table.id}
            href={`/projects/${project.id}/b2p/${table.id}`}
            className="group relative block overflow-hidden rounded-2xl bg-white transition-shadow hover:shadow-[0_6px_24px_rgba(0,0,0,0.09)]"
            style={{
              border: active ? `1px solid ${style.accent}66` : "1px solid rgba(0,0,0,0.07)",
              boxShadow: active ? `0 0 0 1px ${style.accent}33` : "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <span className="absolute left-0 top-0 h-full w-1" style={{ background: style.accent }} aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3.5 pl-5 pr-4">
              <div className="min-w-[180px]">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-black text-[#0d1f10]">{getT2PLabel(table)}</span>
                  {locked.has(table.id) ? <span className="text-[10px] font-bold text-slate-500">🔒 verrouillé</span> : null}
                </div>
                <div className="text-[11px] text-slate-500">
                  {getT2PDescriptor(table.tableKind)} · {formatDateLabel(table.date)}
                </div>
              </div>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${style.pill}`}>{status.label}</span>
              <dl className="ml-auto grid grid-cols-5 gap-4 text-right">
                {[
                  ["FP", formatDateLabel(agg.finPrevue)],
                  ["Écart E", formatGap(agg.ecart, unit)],
                  ["Écart préc.", formatGap(prevEcart, unit)],
                  ["Dérive D", formatGap(derive, unit)],
                  ["Avanc.", `${agg.avancement} %`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="section-label">{k}</dt>
                    <dd
                      className={`ct-num text-[12.5px] font-bold ${
                        (k === "Écart E" && agg.ecart > 0) || (k === "Dérive D" && derive > 0) ? "text-[#be123c]" : "text-slate-900"
                      }`}
                    >
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export type { T2PTable };
