import {
  deleteTimesheetEntry,
  getProjectView,
  saveTimesheetEntry,
} from "@/services/projects";
import {
  getNumber,
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
      timesheetEntries: view.aggregate.timesheetEntries,
      totals: {
        totalActualWorkHours: view.metrics.totalActualWorkHours,
        totalActualCost: view.metrics.totalActualCost,
      },
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to load timesheets.", 404);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    await saveTimesheetEntry({
      projectId,
      entryId: getString(body, "entryId", false) ?? undefined,
      taskId: getString(body, "taskId"),
      resourceId: getString(body, "resourceId", false),
      entryDate: getString(body, "entryDate"),
      workHours: getNumber(body, "workHours", 0),
      costAmount:
        body.costAmount === undefined || body.costAmount === null
          ? null
          : getNumber(body, "costAmount", 0),
      notes: getString(body, "notes", false) ?? "",
    });
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to save timesheet entry.", 400);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    await deleteTimesheetEntry(projectId, getString(body, "entryId"));
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to delete timesheet entry.", 400);
  }
}
