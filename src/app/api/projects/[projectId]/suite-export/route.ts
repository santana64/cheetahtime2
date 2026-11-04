import { jsonErrorFromUnknown, jsonResponse } from "@/lib/api/route-utils";
import { buildSuiteExport } from "@/services/projects";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const file = await buildSuiteExport(projectId);
    return jsonResponse(file);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to export suite project file.", 404);
  }
}
