import { createResource, deleteResource, getProjectView, updateResource } from "@/services/projects";
import { runWithCostBridgeWebhook } from "@/services/cost-bridge";
import {
  getNumber,
  getString,
  jsonErrorFromUnknown,
  jsonResponse,
  parseJsonBody,
} from "@/lib/api/route-utils";
import type { ResourceType } from "@/types/planning";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const view = await getProjectView(projectId);
    return jsonResponse({
      resources: view.aggregate.resources,
      assignments: view.aggregate.assignments,
      timesheetEntries: view.aggregate.timesheetEntries,
      resourceSummaries: view.resourceSummaries,
      leveling: {
        leveledTaskCount: view.metrics.leveledTaskCount,
        totalLevelingDelayDays: view.metrics.totalLevelingDelayDays,
        overloadedResourceCount: view.metrics.overloadedResourceCount,
      },
      actuals: {
        totalActualWorkHours: view.metrics.totalActualWorkHours,
        totalActualCost: view.metrics.totalActualCost,
      },
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to load resources.", 404);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const eventHint = { kind: "resource.create" as const, resourceId: null as string | null };
    const resourceId = await runWithCostBridgeWebhook(projectId, eventHint, async () => {
      const createdResourceId = await createResource({
        projectId,
        name: getString(body, "name"),
        role: getString(body, "role"),
        type: getString(body, "type") as ResourceType,
        location: getString(body, "location", false) ?? "Unassigned",
        availabilityPct: getNumber(body, "availabilityPct", 100),
        capacityHoursPerDay: getNumber(body, "capacityHoursPerDay", 8),
        calendarWorkingDays: Array.isArray(body.calendarWorkingDays)
          ? body.calendarWorkingDays
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value))
          : [],
        calendarHoursPerDay:
          body.calendarHoursPerDay === undefined || body.calendarHoursPerDay === null
            ? null
            : getNumber(body, "calendarHoursPerDay", 8),
        calendarExceptions: Array.isArray(body.calendarExceptions)
          ? body.calendarExceptions.map((exception) => ({
              id:
                typeof exception?.id === "string" && exception.id.trim()
                  ? exception.id
                  : undefined,
              date:
                typeof exception?.date === "string" ? exception.date : "",
              label:
                typeof exception?.label === "string" ? exception.label : "",
              isWorkingDay: Boolean(exception?.isWorkingDay),
            }))
          : [],
        costRate: body.costRate !== undefined ? getNumber(body, "costRate", 0) : null,
        color: getString(body, "color", false),
      });
      eventHint.resourceId = createdResourceId;
      return createdResourceId;
    });
    return jsonResponse({ resourceId }, 201);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to create resource.", 400);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const resourceId = getString(body, "resourceId");
    await runWithCostBridgeWebhook(projectId, { kind: "resource.update", resourceId }, () =>
      updateResource({
        projectId,
        resourceId,
        name: getString(body, "name"),
        role: getString(body, "role"),
        type: getString(body, "type") as ResourceType,
        location: getString(body, "location", false) ?? "Unassigned",
        availabilityPct: getNumber(body, "availabilityPct", 100),
        capacityHoursPerDay: getNumber(body, "capacityHoursPerDay", 8),
        calendarWorkingDays: Array.isArray(body.calendarWorkingDays)
          ? body.calendarWorkingDays
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value))
          : [],
        calendarHoursPerDay:
          body.calendarHoursPerDay === undefined || body.calendarHoursPerDay === null
            ? null
            : getNumber(body, "calendarHoursPerDay", 8),
        calendarExceptions: Array.isArray(body.calendarExceptions)
          ? body.calendarExceptions.map((exception) => ({
              id:
                typeof exception?.id === "string" && exception.id.trim()
                  ? exception.id
                  : undefined,
              date:
                typeof exception?.date === "string" ? exception.date : "",
              label:
                typeof exception?.label === "string" ? exception.label : "",
              isWorkingDay: Boolean(exception?.isWorkingDay),
            }))
          : [],
        costRate: body.costRate !== undefined ? getNumber(body, "costRate", 0) : null,
        color: getString(body, "color", false),
      }),
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to update resource.", 400);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const resourceId = getString(body, "resourceId");
    await runWithCostBridgeWebhook(projectId, { kind: "resource.delete", resourceId }, () =>
      deleteResource(projectId, resourceId),
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to delete resource.", 400);
  }
}
