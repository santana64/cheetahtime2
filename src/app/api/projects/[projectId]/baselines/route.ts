import { captureBaseline, getProjectView, setActiveBaseline } from "@/services/projects";
import { runWithCostBridgeWebhook } from "@/services/cost-bridge";
import {
  getString,
  jsonErrorFromUnknown,
  jsonResponse,
  parseJsonBody,
} from "@/lib/api/route-utils";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const view = await getProjectView(projectId);
    return jsonResponse({
      activeBaseline: view.activeBaseline ?? null,
      baselines: view.aggregate.baselines,
      variance: view.baselineVarianceByTaskId,
      summary: {
        baselineWorkVarianceHours: view.metrics.baselineWorkVarianceHours,
        baselineCostVariance: view.metrics.baselineCostVariance,
        plannedValue: view.metrics.plannedValue,
        earnedValue: view.metrics.earnedValue,
        totalActualCost: view.metrics.totalActualCost,
        earnedValueScheduleVariance: view.metrics.earnedValueScheduleVariance,
        earnedValueCostVariance: view.metrics.earnedValueCostVariance,
        schedulePerformanceIndex: view.metrics.schedulePerformanceIndex,
        costPerformanceIndex: view.metrics.costPerformanceIndex,
      },
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to load baselines.", 404);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    await runWithCostBridgeWebhook(
      projectId,
      { kind: "baseline.capture" },
      () =>
        captureBaseline(
          projectId,
          getString(body, "name"),
          getString(body, "capturedBy"),
        ),
    );
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to capture baseline.", 400);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const baselineId = getString(body, "baselineId");
    await runWithCostBridgeWebhook(projectId, { kind: "baseline.activate", baselineId }, () =>
      setActiveBaseline(projectId, baselineId),
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to activate baseline.", 400);
  }
}
