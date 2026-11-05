import { redirect } from "next/navigation";

import { getProjectAggregate } from "@/services/projects";

/**
 * Comme Cheetah Cost, un projet s'ouvre sur « Tableaux B2P » — une fois le
 * Planning Initial figé. Avant, il s'ouvre sur le Planning (le pilotage n'a
 * pas encore commencé).
 */
export default async function ProjectIndexPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const aggregate = await getProjectAggregate(projectId).catch(() => null);
  const piFige = Boolean(aggregate?.baselines.some((b) => b.isActive));
  redirect(`/projects/${projectId}/${piFige ? "b2p" : "planning"}`);
}
