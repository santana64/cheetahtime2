import { ResourceView } from "@/features/projects/resource-view";
import { ResourceLoad } from "@/components/app/resource-load";
import { ResourceAvailabilityCalendar } from "@/features/projects/resource-availability-calendar";
import { getProjectView } from "@/services/projects";
import { notFound } from "next/navigation";

export default async function ProjectResourcesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => notFound());
  return (
    <div className="space-y-6">
      <ResourceLoad view={view} />
      <ResourceAvailabilityCalendar view={view} />
      <ResourceView view={view} />
    </div>
  );
}
