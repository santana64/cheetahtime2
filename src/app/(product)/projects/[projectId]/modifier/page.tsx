import { notFound } from "next/navigation";

import { ProjectCreationWizard } from "@/features/projects/project-creation-wizard";
import { requireCurrentSession } from "@/services/auth";
import { getProjectEditData } from "@/services/projects";

/** Correction de la saisie : l'assistant de création, pré-rempli avec le projet. */
export default async function ProjectEditPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const session = await requireCurrentSession();
  const data = await getProjectEditData(projectId, { workspaceId: session.workspaceId }).catch(() => notFound());
  return <ProjectCreationWizard edit={{ projectId, data }} />;
}
