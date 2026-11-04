import { PlanningWorkspace } from "@/features/projects/planning-workspace";
import { PlanningVariants } from "@/features/projects/planning-variants";
import { LevelingGantt } from "@/components/app/leveling-gantt";
import { getProjectView } from "@/services/projects";
import { notFound } from "next/navigation";

export default async function ProjectPlanningPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => notFound());

  return (
    <div className="space-y-6">
      {/* Planning Initial & variantes P01→P99 — la variante active = le PI retenu. */}
      <PlanningVariants view={view} />

      <PlanningWorkspace view={view} />
      <LevelingGantt view={view} />
    </div>
  );
}
