import {
  createTask,
  deleteTask,
  getProjectView,
  moveTask,
  saveTask,
} from "@/services/projects";
import { runWithCostBridgeWebhook } from "@/services/cost-bridge";
import {
  getNumber,
  getString,
  jsonErrorFromUnknown,
  jsonResponse,
  parseJsonBody,
} from "@/lib/api/route-utils";
import type {
  TaskConstraintType,
  TaskMoveDirection,
  TaskPriority,
  TaskSchedulingMode,
  TaskStatus,
  TaskType,
  TaskWorkFormula,
} from "@/types/planning";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const view = await getProjectView(projectId);
    return jsonResponse({
      tasks: view.tasks,
      issues: view.schedule.issues,
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to load tasks.", 404);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const eventHint = { kind: "task.create" as const, taskId: null as string | null };
    const taskId = await runWithCostBridgeWebhook(projectId, eventHint, async () => {
      const createdTaskId = await createTask({
        projectId,
        parentId: getString(body, "parentId", false),
        sortOrder: body.sortOrder !== undefined ? getNumber(body, "sortOrder", 10) : undefined,
        name: getString(body, "name", false) ?? "New task",
        type: (getString(body, "type", false) as TaskType | null) ?? "TASK",
      });
      eventHint.taskId = createdTaskId;
      return createdTaskId;
    });
    return jsonResponse({ taskId }, 201);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to create task.", 400);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const taskId = getString(body, "taskId");
    await runWithCostBridgeWebhook(projectId, { kind: "task.update", taskId }, () =>
      saveTask({
        projectId,
        taskId,
        name: getString(body, "name"),
        description: getString(body, "description", false) ?? "",
        notes: getString(body, "notes", false) ?? "",
        parentId: getString(body, "parentId", false),
        sortOrder: getNumber(body, "sortOrder", 10),
        type: getString(body, "type") as TaskType,
        status: getString(body, "status") as TaskStatus,
        priority: getString(body, "priority") as TaskPriority,
        progressPercent: getNumber(body, "progressPercent", 0),
        durationDays: getNumber(body, "durationDays", 1),
        schedulingMode: getString(body, "schedulingMode") as TaskSchedulingMode,
        workFormula: getString(body, "workFormula") as TaskWorkFormula,
        effortHours:
          body.effortHours === undefined || body.effortHours === null
            ? null
            : getNumber(body, "effortHours", 0),
        calendarMode:
          (getString(body, "calendarMode", false) as "PROJECT" | "CUSTOM" | null) ??
          "PROJECT",
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
        levelingPriority: getNumber(body, "levelingPriority", 500),
        constraintType: getString(body, "constraintType") as TaskConstraintType,
        constraintDate: getString(body, "constraintDate", false),
        deadlineDate: getString(body, "deadlineDate", false),
        manualStartDate: getString(body, "manualStartDate", false),
        manualFinishDate: getString(body, "manualFinishDate", false),
        actualStartDate: getString(body, "actualStartDate", false),
        actualFinishDate: getString(body, "actualFinishDate", false),
        actualWorkHours:
          body.actualWorkHours === undefined || body.actualWorkHours === null
            ? null
            : getNumber(body, "actualWorkHours", 0),
        remainingWorkHours:
          body.remainingWorkHours === undefined || body.remainingWorkHours === null
            ? null
            : getNumber(body, "remainingWorkHours", 0),
      }),
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to update task.", 400);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const taskId = getString(body, "taskId");
    await runWithCostBridgeWebhook(projectId, { kind: "task.delete", taskId }, () =>
      deleteTask(projectId, taskId),
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to delete task.", 400);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const taskId = getString(body, "taskId");
    await runWithCostBridgeWebhook(projectId, { kind: "task.move", taskId }, () =>
      moveTask({
        projectId,
        taskId,
        direction: getString(body, "direction") as TaskMoveDirection,
      }),
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to move task.", 400);
  }
}
