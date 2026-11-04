import { BaselineView } from "@/features/projects/baseline-view";
import { getProjectView } from "@/services/projects";
import { notFound } from "next/navigation";

export default async function ProjectBaselinesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => notFound());
  return <BaselineView view={view} />;
}
