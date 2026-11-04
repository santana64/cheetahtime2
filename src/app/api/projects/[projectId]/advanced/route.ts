import { notFound } from "next/navigation";

import { jsonErrorFromUnknown, jsonResponse } from "@/lib/api/route-utils";
import { buildAdvancedPlanningSummary } from "@/services/advanced-planning";
import { getProjectView } from "@/services/projects";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const view = await getProjectView(projectId).catch(() => notFound());
    return jsonResponse(buildAdvancedPlanningSummary(view));
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to build advanced planning summary.", 400);
  }
}

