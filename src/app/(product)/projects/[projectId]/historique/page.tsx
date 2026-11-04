import { notFound } from "next/navigation";

import { ProjectHistory } from "@/features/projects/project-history";
import { requireCurrentSession } from "@/services/auth";
import { getProjectHistory } from "@/services/projects";

/** Historique du projet (menu Fichier) — journal d'audit et versions, comme Cheetah Cost. */
export default async function ProjectHistoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const session = await requireCurrentSession();
  const history = await getProjectHistory(projectId, { workspaceId: session.workspaceId }).catch(() => notFound());
  return <ProjectHistory projectId={projectId} auditTrail={history.auditTrail} snapshots={history.snapshots} />;
}
