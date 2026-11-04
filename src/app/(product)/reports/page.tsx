import Link from "next/link";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateLabel, formatPercent } from "@/lib/format/formatters";
import { listProjectViews } from "@/services/projects";
import { requireCurrentSession } from "@/services/auth";

export const metadata: Metadata = {
  title: "Rapports",
  description: "Exports et rapports portefeuille Cheetah Time.",
};

export default async function ReportsPage() {
  
  const views = await listProjectViews({ includeArchived: false, workspaceId: (await requireCurrentSession()).workspaceId });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/70 bg-white/80 p-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
          Reporting
        </div>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-[#1a4a20]">
          Rapports portefeuille
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Exports CSV, Excel-compatible, PDF et JSON issus du moteur de planning : tâches, ressources, burndown, chemin critique et écarts.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {views.map((view) => (
          <Card key={view.aggregate.project.id}>
            <CardHeader>
              <CardTitle className="text-base">{view.aggregate.project.name}</CardTitle>
              <p className="text-xs text-slate-500">
                {view.aggregate.project.clientName} — fin prévisionnelle {formatDateLabel(view.schedule.projectFinishDate)}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-slate-400">Avancement</div>
                  <div className="mt-1 text-lg font-black text-[#1a4a20]">{formatPercent(view.metrics.overallProgress)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-slate-400">Critique</div>
                  <div className="mt-1 text-lg font-black text-rose-700">{view.metrics.criticalTaskCount}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-slate-400">Surcharge</div>
                  <div className="mt-1 text-lg font-black text-amber-700">{view.metrics.overloadedResourceCount}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a href={`/api/projects/${view.aggregate.project.id}/reports?format=pdf`}>
                    PDF
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/projects/${view.aggregate.project.id}/reports?format=excel`}>
                    Excel
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/projects/${view.aggregate.project.id}/reports?format=csv&section=tasks`}>
                    CSV tâches
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/projects/${view.aggregate.project.id}/reports?format=csv&section=burndown`}>
                    Burndown CSV
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link prefetch={false} href={`/projects/${view.aggregate.project.id}/dashboard`}>
                    Ouvrir
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
