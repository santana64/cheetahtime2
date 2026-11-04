import { deleteAssignment, saveAssignment } from "@/services/projects";
import { runWithCostBridgeWebhook } from "@/services/cost-bridge";
import {
  getNumber,
  getString,
  jsonErrorFromUnknown,
  jsonResponse,
  parseJsonBody,
} from "@/lib/api/route-utils";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const taskId = getString(body, "taskId");
    const resourceId = getString(body, "resourceId");
    await runWithCostBridgeWebhook(projectId, { kind: "assignment.save", taskId, resourceId }, () =>
      saveAssignment({
        projectId,
        taskId,
        resourceId,
        allocationPct: getNumber(body, "allocationPct", 100),
        notes: getString(body, "notes", false) ?? undefined,
      }),
    );
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to save assignment.", 400);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const taskId = getString(body, "taskId");
    const resourceId = getString(body, "resourceId");
    await runWithCostBridgeWebhook(projectId, { kind: "assignment.save", taskId, resourceId }, () =>
      saveAssignment({
        projectId,
        taskId,
        resourceId,
        allocationPct: getNumber(body, "allocationPct", 100),
        notes: getString(body, "notes", false) ?? undefined,
      }),
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to update assignment.", 400);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    await runWithCostBridgeWebhook(projectId, { kind: "assignment.delete" }, () =>
      deleteAssignment(projectId, getString(body, "assignmentId")),
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to delete assignment.", 400);
  }
}
