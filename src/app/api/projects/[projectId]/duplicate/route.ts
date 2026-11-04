import { duplicateProject } from "@/services/projects";
import {
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
    const duplicatedProjectId = await duplicateProject({
      projectId,
      name: getString(body, "name", false) ?? undefined,
      duplicatedBy: getString(body, "duplicatedBy"),
    });

    return jsonResponse({ projectId: duplicatedProjectId }, 201);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to duplicate project.", 400);
  }
}
