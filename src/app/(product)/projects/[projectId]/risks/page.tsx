import { ControlRegister } from "@/features/projects/control-register";
import { RiskRegister } from "@/features/projects/risk-register";
import { listChangeRequests, listIssues } from "@/services/controls";
import { listRisks } from "@/services/risks";
import { getProjectView } from "@/services/projects";
import { notFound } from "next/navigation";
import { requireCurrentSession } from "@/services/auth";

export default async function ProjectRisksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  
  const { projectId } = await params;
  const view = await getProjectView(projectId, { workspaceId: (await requireCurrentSession()).workspaceId }).catch(() => notFound());
  const [risks, issues, changes] = await Promise.all([
    listRisks(projectId),
    listIssues(projectId),
    listChangeRequests(projectId),
  ]);
  return (
    <div className="space-y-6">
      <RiskRegister projectId={projectId} risks={risks} />
      <ControlRegister
        projectId={projectId}
        tasks={view.tasks}
        issues={issues}
        changes={changes}
      />
    </div>
  );
}
