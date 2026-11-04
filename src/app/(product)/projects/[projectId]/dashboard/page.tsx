import { ProjectDashboard } from "@/features/projects/project-dashboard";
import { getProjectView } from "@/services/projects";
import { notFound } from "next/navigation";

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => notFound());
  return <ProjectDashboard view={view} />;
}
