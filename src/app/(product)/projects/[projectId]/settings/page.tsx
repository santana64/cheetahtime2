import { notFound } from "next/navigation";

import { ProjectSettingsPage } from "@/features/projects/project-settings-page";
import { ProjectVersionHistory } from "@/features/backup/project-version-history";
import { getProjectView } from "@/services/projects";
import { listSnapshots } from "@/services/backup-store";
import { requireCurrentSession } from "@/services/auth";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsRoute({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {

  const { projectId } = await params;
  const view = await getProjectView(projectId, { workspaceId: (await requireCurrentSession()).workspaceId }).catch(() => notFound());
  const snapshots = await listSnapshots();
  return (
    <div className="space-y-6">
      <ProjectSettingsPage view={view} />
      <ProjectVersionHistory projectId={projectId} snapshots={snapshots} />
    </div>
  );
}
