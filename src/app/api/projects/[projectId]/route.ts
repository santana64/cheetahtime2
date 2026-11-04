import {
  deleteProject,
  getProjectView,
  setProjectArchived,
  updateProjectMetadata,
} from "@/services/projects";
import {
  getNumber,
  getString,
  jsonErrorFromUnknown,
  jsonResponse,
  parseJsonBody,
} from "@/lib/api/route-utils";
import type { ProjectHealth, ProjectStatus } from "@/types/planning";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const view = await getProjectView(projectId);
    return jsonResponse(view);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Project not found.", 404);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    await updateProjectMetadata({
      projectId,
      name: getString(body, "name"),
      clientName: getString(body, "clientName"),
      ownerName: getString(body, "ownerName"),
      sponsorName: getString(body, "sponsorName"),
      portfolio: getString(body, "portfolio"),
      description: getString(body, "description"),
      status: getString(body, "status") as ProjectStatus,
      health: getString(body, "health") as ProjectHealth,
      targetStartDate: getString(body, "targetStartDate"),
      targetFinishDate: getString(body, "targetFinishDate", false),
      budgetAmount: getNumber(body, "budgetAmount", 0),
      currencyCode: getString(body, "currencyCode"),
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to update project.", 400);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const archivedValue = body.archived;
    await setProjectArchived(
      projectId,
      archivedValue === true ||
        (typeof archivedValue === "string" && archivedValue === "true"),
      getString(body, "actor"),
    );

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(
      error,
      "Unable to update project lifecycle.",
      400,
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    await deleteProject(projectId, getString(body, "confirmationName"));

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to delete project.", 400);
  }
}
