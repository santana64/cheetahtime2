import { jsonErrorFromUnknown, jsonResponse, parseJsonBody } from "@/lib/api/route-utils";
import { simulateWhatIf, type WhatIfInput } from "@/services/advanced-planning";
import { getProjectView } from "@/services/projects";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const view = await getProjectView(projectId);
    return jsonResponse(simulateWhatIf(view, body as unknown as WhatIfInput));
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to run what-if simulation.", 400);
  }
}

