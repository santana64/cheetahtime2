import { jsonErrorFromUnknown, jsonResponse } from "@/lib/api/route-utils";
import { getCheetahProjectBridgeExport } from "@/services/cost-bridge";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const bridge = await getCheetahProjectBridgeExport(projectId);
    return jsonResponse(bridge);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to export Cost bridge payload.", 404);
  }
}

