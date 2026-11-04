import {
  deleteActualCostEntry,
  getProjectView,
  saveActualCostEntry,
} from "@/services/projects";
import {
  getNumber,
  getString,
  jsonError,
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
      project: view.aggregate.project,
      metrics: {
        totalActualCost: view.metrics.totalActualCost,
        totalLaborActualCost: view.metrics.totalLaborActualCost,
        totalNonLaborActualCost: view.metrics.totalNonLaborActualCost,
        actualCostEntryCount: view.metrics.actualCostEntryCount,
      },
      actualCostEntries: view.aggregate.actualCostEntries,
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to load actual cost ledger.", 400);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);

    await saveActualCostEntry({
      projectId,
      entryId: getString(body, "entryId", false) ?? undefined,
      taskId: getString(body, "taskId", false),
      resourceId: getString(body, "resourceId", false),
      entryDate: getString(body, "entryDate"),
      category: getString(body, "category") as
        | "LABOR"
        | "MATERIAL"
        | "EQUIPMENT"
        | "SUBCONTRACT"
        | "TRAVEL"
        | "OVERHEAD"
        | "OTHER",
      vendorName: getString(body, "vendorName", false),
      referenceCode: getString(body, "referenceCode", false),
      description: getString(body, "description", false),
      quantity:
        body["quantity"] === undefined ? null : getNumber(body, "quantity", 0),
      unitCost:
        body["unitCost"] === undefined ? null : getNumber(body, "unitCost", 0),
      amount: body["amount"] === undefined ? null : getNumber(body, "amount", 0),
      currencyCode: getString(body, "currencyCode", false),
    });

    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to save actual cost.", 400);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = await parseJsonBody(request);
    const entryId = getString(body, "entryId", false);
    if (!entryId) {
      return jsonError("Missing required field: entryId", 400);
    }

    await deleteActualCostEntry(projectId, entryId);
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to delete actual cost.", 400);
  }
}
