import { notFound } from "next/navigation";

import { ProjectSettingsPage } from "@/features/projects/project-settings-page";
import { PilotageSettingsForm } from "@/features/projects/pilotage-settings-form";
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
      <PilotageSettingsForm
        projectId={projectId}
        statusDate={view.aggregate.project.statusDate ?? null}
        effectiveStatusDate={view.schedule.statusDate ?? null}
        coefficient={view.aggregate.project.pseudoCriticalCoefficient ?? null}
      />
      <ProjectSettingsPage view={view} />
      <ProjectVersionHistory projectId={projectId} snapshots={snapshots} />
    </div>
  );
}
