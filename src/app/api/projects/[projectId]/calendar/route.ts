import {
  getProjectView,
  updateProjectCalendar,
} from "@/services/projects";
import { runWithCostBridgeWebhook } from "@/services/cost-bridge";
import {
  getNumber,
  getString,
  jsonErrorFromUnknown,
  jsonResponse,
  parseJsonBody,
} from "@/lib/api/route-utils";
import { validationError } from "@/lib/planning/errors";

function ensureObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const view = await getProjectView(projectId);
    return jsonResponse({
      calendar: view.aggregate.calendar,
      leveling: {
        strategy: view.aggregate.project.levelingStrategy,
        maxDelayDays: view.aggregate.project.levelingMaxDelayDays,
      },
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to load project calendar.", 404);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const workingDays = body.workingDays;
    const exceptions = body.exceptions ?? [];

    if (!Array.isArray(workingDays)) {
      throw validationError("workingDays must be an array.");
    }

    if (!Array.isArray(exceptions)) {
      throw validationError("exceptions must be an array.");
    }

    await runWithCostBridgeWebhook(projectId, { kind: "calendar.update" }, () =>
      updateProjectCalendar({
        projectId,
        name: getString(body, "name"),
        timezone: getString(body, "timezone"),
        workingDays: workingDays.map((value, index) => {
          if (typeof value !== "number" || !Number.isFinite(value)) {
            throw validationError(`workingDays[${index}] must be a number.`);
          }

          return Math.round(value);
        }),
        hoursPerDay: getNumber(body, "hoursPerDay", 8),
        exceptions: exceptions.map((value, index) => {
          const exception = ensureObject(value, `exceptions[${index}]`);

          return {
            id:
              typeof exception.id === "string" && exception.id.trim()
                ? exception.id.trim()
                : undefined,
            date: getString(exception, "date"),
            label: getString(exception, "label"),
            isWorkingDay: Boolean(exception.isWorkingDay),
          };
        }),
        levelingStrategy:
          (getString(body, "levelingStrategy", false) as
            | "PRIORITY_THEN_SLACK"
            | "SLACK_THEN_PRIORITY"
            | "MIN_DELAY"
            | null) ?? "PRIORITY_THEN_SLACK",
        levelingMaxDelayDays: getNumber(body, "levelingMaxDelayDays", 30),
      }),
    );

    const view = await getProjectView(projectId);
    return jsonResponse({
      ok: true,
      calendar: view.aggregate.calendar,
      leveling: {
        strategy: view.aggregate.project.levelingStrategy,
        maxDelayDays: view.aggregate.project.levelingMaxDelayDays,
      },
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to update project calendar.", 400);
  }
}
