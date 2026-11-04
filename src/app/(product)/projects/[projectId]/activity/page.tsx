import { notFound } from "next/navigation";

import { ActivityFeed } from "@/features/projects/activity-feed";
import { TaskCollaborationPanel } from "@/features/projects/task-collaboration-panel";
import { listProjectAttachments } from "@/services/attachments";
import { listActivity } from "@/services/activity";
import { listProjectComments } from "@/services/comments";
import { getProjectView } from "@/services/projects";
import { requireCurrentSession } from "@/services/auth";

export default async function ProjectActivityPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  
  const { projectId } = await params;
  const view = await getProjectView(projectId, { workspaceId: (await requireCurrentSession()).workspaceId }).catch(() => notFound());
  const [events, comments, attachments] = await Promise.all([
    listActivity(projectId, 250),
    listProjectComments(projectId),
    listProjectAttachments(projectId),
  ]);
  return (
    <div className="space-y-6">
      <TaskCollaborationPanel
        projectId={projectId}
        tasks={view.tasks}
        comments={comments}
        attachments={attachments}
      />
      <ActivityFeed events={events} />
    </div>
  );
}
