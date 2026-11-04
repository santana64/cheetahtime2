import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateLabel } from "@/lib/format/formatters";
import { buildPortfolioRoadmap } from "@/services/advanced-planning";
import { requireCurrentSession } from "@/services/auth";

export default async function PortfolioPage() {
  
  const roadmap = await buildPortfolioRoadmap((await requireCurrentSession()).workspaceId);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/70 bg-white/85 p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
          Portfolio cross-projets
        </div>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-[#1a4a20]">
          Gantt portefeuille et ressources partagees
        </h1>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {roadmap.projects.map((entry) => (
          <Card key={entry.project.id}>
            <CardHeader>
              <CardTitle className="text-base">
                <Link href={`/projects/${entry.project.id}/dashboard`} className="hover:underline">
                  {entry.project.name}
                </Link>
              </CardTitle>
              <p className="text-xs text-slate-500">
                Fin {formatDateLabel(entry.finishDate)} - sante moteur {entry.health}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Jalons</div>
                <div className="mt-2 grid gap-2">
                  {entry.milestones.slice(0, 6).map((milestone) => (
                    <div key={milestone.taskId} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span>{milestone.name}</span>
                      <strong>{formatDateLabel(milestone.date)}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Conflits ressources</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {entry.resourceConflicts.map((conflict) => (
                    <span key={conflict.resourceId} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      {conflict.name} {Math.round(conflict.maxAllocationPct)}%
                    </span>
                  ))}
                  {!entry.resourceConflicts.length ? <span className="text-xs text-slate-500">Aucun conflit detecte</span> : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conflits cross-projets</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {roadmap.sharedResourceConflicts.map((conflict) => (
            <div key={conflict.key} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>{conflict.key}</strong> utilise sur {conflict.refs.length} projets la meme semaine.
            </div>
          ))}
          {!roadmap.sharedResourceConflicts.length ? (
            <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
              Aucun conflit cross-projets detecte.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

