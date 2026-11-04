"use client";

import { useState } from "react";

import { setResourceAvailabilityAction } from "@/features/projects/actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/app/ui-kit";
import type { ProjectView, Resource } from "@/types/planning";

/** Liste des mois "YYYY-MM" couverts par le projet (bornés pour éviter les projets géants). */
function monthKeysBetween(startIso: string, endIso: string): string[] {
  const s = /^\d{4}-\d{2}/.test(startIso) ? startIso : null;
  const e = /^\d{4}-\d{2}/.test(endIso) ? endIso : null;
  if (!s || !e) return [];
  let y = Number(s.slice(0, 4));
  let m = Number(s.slice(5, 7));
  const ey = Number(e.slice(0, 4));
  const em = Number(e.slice(5, 7));
  const out: string[] = [];
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 180) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    guard += 1;
  }
  return out;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1, 12)).toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function ResourceRow({
  projectId,
  resource,
  monthKeys,
}: {
  projectId: string;
  resource: Resource;
  monthKeys: string[];
}) {
  const [avail, setAvail] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const key of monthKeys) {
      const v = resource.availabilityByMonth?.[key];
      init[key] = v == null ? "1" : String(v);
    }
    return init;
  });

  const json = JSON.stringify(
    Object.fromEntries(monthKeys.map((k) => [k, Number((avail[k] ?? "1").replace(",", ".")) || 0])),
  );

  return (
    <form action={setResourceAvailabilityAction} className="rounded-xl border border-black/5 bg-slate-50/60 p-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="resourceId" value={resource.id} />
      <input type="hidden" name="availability" value={json} />
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-bold text-slate-800">
          {resource.code ? `${resource.code} · ` : ""}
          {resource.name}
        </div>
        <Button type="submit" size="sm" variant="outline">
          Enregistrer
        </Button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {monthKeys.map((key) => {
          const val = Number((avail[key] ?? "1").replace(",", ".")) || 0;
          const tone = val <= 0 ? "#e2424a" : val < 1 ? "#b45309" : "#3f8f48";
          return (
            <label key={key} className="flex shrink-0 flex-col items-center gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">{monthLabel(key)}</span>
              <input
                value={avail[key] ?? "1"}
                inputMode="decimal"
                onChange={(e) => setAvail((a) => ({ ...a, [key]: e.target.value }))}
                className="w-12 rounded-md border border-slate-200 bg-white px-1 py-1 text-center text-[12px] tabular-nums outline-none focus:border-[#56a45b]"
                style={{ color: tone, fontWeight: 700 }}
                title={`Disponibilité de ${resource.name} sur ${monthLabel(key)} (1 = pleine, 0 = indispo)`}
              />
            </label>
          );
        })}
      </div>
    </form>
  );
}

/**
 * Calendrier de disponibilité des ressources (intensité par mois) — demande François 23/08.
 * 1 = pleine dispo · 0,5 = mi-temps · 0 = indisponible. Sert de plafond dans les diagrammes
 * de charges (une charge au-dessus de la dispo = surcharge).
 */
export function ResourceAvailabilityCalendar({ view }: { view: ProjectView }) {
  const projectId = view.aggregate.project.id;
  const start = view.aggregate.project.targetStartDate;
  const end =
    view.schedule.projectFinishDate ?? view.aggregate.project.targetFinishDate ?? start;
  const monthKeys = monthKeysBetween(start, end);
  const resources = view.aggregate.resources ?? [];

  if (!resources.length || !monthKeys.length) return null;

  return (
    <Panel
      title="Disponibilité des ressources — calendrier"
      subtitle="Intensité par mois : 1 = pleine dispo · 0,5 = mi-temps · 0 = indisponible. Sert de plafond dans les diagrammes de charges."
      accent="#56a45b"
      bodyClassName="space-y-3"
    >
      {resources.map((r) => (
        <ResourceRow key={r.id} projectId={projectId} resource={r} monthKeys={monthKeys} />
      ))}
    </Panel>
  );
}
