import {
  clearProjectLeveling,
  getProjectView,
  levelProjectResources,
} from "@/services/projects";
import { runWithCostBridgeWebhook } from "@/services/cost-bridge";
import { jsonErrorFromUnknown, jsonResponse } from "@/lib/api/route-utils";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const view = await getProjectView(projectId);
    return jsonResponse({
      leveledTaskCount: view.metrics.leveledTaskCount,
      totalLevelingDelayDays: view.metrics.totalLevelingDelayDays,
      overloadedResourceCount: view.metrics.overloadedResourceCount,
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to load leveling state.", 404);
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    await runWithCostBridgeWebhook(projectId, { kind: "leveling.apply" }, () =>
      levelProjectResources(projectId),
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to level project resources.", 400);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    await runWithCostBridgeWebhook(projectId, { kind: "leveling.clear" }, () =>
      clearProjectLeveling(projectId),
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to clear leveling delay.", 400);
  }
}
