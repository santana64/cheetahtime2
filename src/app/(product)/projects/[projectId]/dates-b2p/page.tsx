import { notFound } from "next/navigation";

import { B2PDatesEditor } from "@/features/projects/b2p-dates-editor";
import { buildRecommendedB2PDates, getB2PCadenceRule, getB2PPlanWarnings, getProjectB2PDates } from "@/lib/fgf/b2p";
import { getProjectView } from "@/services/projects";

/** Onglet « Dates des B2P » — aligné sur Cheetah Cost. */
export default async function ProjectB2PDatesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => notFound());
  const project = view.aggregate.project;
  const dateFin =
    [project.targetFinishDate ?? null, view.schedule.projectFinishDate ?? null]
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? project.targetStartDate;
  const dates = getProjectB2PDates(project, view.schedule.projectFinishDate);
  const recommended = buildRecommendedB2PDates({ dateDebut: project.targetStartDate, dateFin });
  const cadence = getB2PCadenceRule(project.targetStartDate, dateFin);
  const warnings = getB2PPlanWarnings({ dateDebut: project.targetStartDate, dateFin }, dates);
  return (
    <B2PDatesEditor
      projectId={projectId}
      dates={dates}
      recommended={recommended}
      cadenceLabel={cadence?.label ?? "—"}
      cadenceExplanation={cadence?.explanation}
      warnings={warnings}
      startedDates={Object.keys(project.b2pSnapshots ?? {})}
      projectStart={project.targetStartDate}
    />
  );
}
