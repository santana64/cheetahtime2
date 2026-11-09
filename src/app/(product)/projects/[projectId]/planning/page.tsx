import { notFound } from "next/navigation";

import { PlanningWorkspace } from "@/features/projects/planning-workspace";
import { PlanningVariants } from "@/features/projects/planning-variants";
import { LevelingGantt } from "@/components/app/leveling-gantt";
import { LevelingDialog } from "@/components/app/leveling-dialog";
import { getProjectView, toClientPlanningView } from "@/services/projects";

export default async function ProjectPlanningPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const fullView = await getProjectView(projectId).catch(() => notFound());
  // Une seule instance allégée partagée par les composants client.
  const view = toClientPlanningView(fullView);
  const shiftedCount = view.tasks.filter(
    (t) =>
      !t.isSummary &&
      ((t.levelingDelayDays ?? 0) > 0 ||
        Boolean(t.earliestStartDate && t.scheduledStartDate && t.scheduledStartDate > t.earliestStartDate)),
  ).length;

  return (
    <div className="space-y-6">
      {/* Comparatif avant / après nivellement : une fenêtre s'ouvre par-dessus le planning. */}
      <div className="ct-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="text-[12.5px] text-slate-600">
          <span className="font-bold text-[#1a4a20]">Nivellement</span> ·{" "}
          {shiftedCount > 0
            ? `${shiftedCount} LT décalé${shiftedCount > 1 ? "s" : ""} pour résorber les surcharges`
            : "aucun LT décalé"}
        </div>
        <LevelingDialog shiftedCount={shiftedCount}>
          <LevelingGantt view={view} />
        </LevelingDialog>
      </div>

      {/* Planning Initial & variantes P01→P99 — la variante active = le PI retenu. */}
      <PlanningVariants view={view} />
      <PlanningWorkspace view={view} />
    </div>
  );
}
