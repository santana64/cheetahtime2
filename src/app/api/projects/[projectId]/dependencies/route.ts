import { deleteDependency, getProjectView, saveDependency } from "@/services/projects";
import { runWithCostBridgeWebhook } from "@/services/cost-bridge";
import {
  getNumber,
  getString,
  jsonErrorFromUnknown,
  jsonResponse,
  parseJsonBody,
} from "@/lib/api/route-utils";
import type { DependencyType } from "@/types/planning";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const view = await getProjectView(projectId);
    return jsonResponse({
      dependencies: view.dependencyNetwork,
      dependencyOptions: view.dependencyOptions,
      issues: view.schedule.issues,
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to load dependencies.", 404);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const successorTaskId = getString(body, "successorTaskId");
    await runWithCostBridgeWebhook(projectId, { kind: "dependency.create", taskId: successorTaskId }, () =>
      saveDependency({
        projectId,
        predecessorProjectId: getString(body, "predecessorProjectId", false) ?? undefined,
        predecessorTaskId: getString(body, "predecessorTaskId"),
        successorProjectId: getString(body, "successorProjectId", false) ?? undefined,
        successorTaskId,
        type: getString(body, "type") as DependencyType,
        lagDays: getNumber(body, "lagDays", 0),
      }),
    );
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to save dependency.", 400);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    await runWithCostBridgeWebhook(projectId, { kind: "dependency.delete" }, () =>
      deleteDependency(projectId, getString(body, "dependencyId")),
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to delete dependency.", 400);
  }
}
