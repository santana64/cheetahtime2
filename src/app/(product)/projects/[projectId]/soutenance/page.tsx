import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateLabel, formatPercent } from "@/lib/format/formatters";
import { calculateEarnedSchedule } from "@/services/advanced-planning";
import { getProjectView } from "@/services/projects";
import { PageHeader } from "@/components/app/ui-kit";

export default async function ProjectSoutenancePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => notFound());
  const earnedSchedule = calculateEarnedSchedule(view);
  const sections = [
    "Tableau de bord projet",
    "Planning de référence vs actuel",
    "Courbe en S",
    "Tableau des écarts (FGF)",
    "Points d'alerte et actions",
    "Ressources",
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Mode soutenance"
        title="Rapport marché public"
        description="PDF A4 en 6 pages avec jalons contractuels, chemin critique, courbe en S et ressources — format de soutenance FGF."
        actions={
          <>
            <Button asChild>
              <a href={`/api/projects/${projectId}/reports?format=soutenance`}>Générer le PDF soutenance</a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/projects/${projectId}/reports?format=gantt-svg`}>Export Gantt SVG</a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/projects/${projectId}/reports?format=excel`}>Export Excel</a>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sommaire PDF</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {sections.map((section, index) => (
              <div key={section} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Page {index + 1}
                </div>
                <div className="mt-1 font-semibold text-slate-950">{section}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Données courantes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex justify-between gap-3"><span>Avancement</span><strong>{formatPercent(view.metrics.overallProgress)}</strong></div>
            <div className="flex justify-between gap-3"><span>Fin prévisionnelle</span><strong>{formatDateLabel(view.schedule.projectFinishDate)}</strong></div>
            <div className="flex justify-between gap-3"><span>Fin contractuelle</span><strong>{formatDateLabel(view.aggregate.project.targetFinishDate)}</strong></div>
            <div className="flex justify-between gap-3"><span>Indice délai</span><strong>{earnedSchedule.SPI_t?.toFixed(2) ?? "n/a"}</strong></div>
            <div className="flex justify-between gap-3"><span>Chemin critique</span><strong>{view.metrics.criticalTaskCount}</strong></div>
            <div className="flex justify-between gap-3"><span>Surcharges</span><strong>{view.metrics.overloadedResourceCount}</strong></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

