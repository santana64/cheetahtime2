import { PlanningWorkspace } from "@/features/projects/planning-workspace";
import { PlanningVariants } from "@/features/projects/planning-variants";
import { LevelingGantt } from "@/components/app/leveling-gantt";
import { getProjectView, toClientPlanningView } from "@/services/projects";
import { notFound } from "next/navigation";

export default async function ProjectPlanningPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const fullView = await getProjectView(projectId).catch(() => notFound());
  // Une seule instance allégée partagée par les trois composants client.
  const view = toClientPlanningView(fullView);

  return (
    <div className="space-y-6">
      {/* Planning Initial & variantes P01→P99 — la variante active = le PI retenu. */}
      <PlanningVariants view={view} />

      <PlanningWorkspace view={view} />
      <LevelingGantt view={view} />
    </div>
  );
}
