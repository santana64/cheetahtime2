import {
  getString,
  jsonErrorFromUnknown,
  jsonResponse,
  parseJsonBody,
} from "@/lib/api/route-utils";
import { requireApiPermission } from "@/services/auth";
import {
  createProjectFromBtpTemplate,
  listBtpTemplates,
} from "@/services/btp-templates";

export async function GET() {
  return jsonResponse({
    generatedAt: new Date().toISOString(),
    templates: listBtpTemplates(),
  });
}

export async function POST(request: Request) {
  try {
    const session = await requireApiPermission("project:update");
    const body = await parseJsonBody(request);
    const projectId = await createProjectFromBtpTemplate({
      workspaceId: session.workspaceId,
      templateId: getString(body, "templateId"),
      name: getString(body, "name", false),
      targetStartDate: getString(body, "targetStartDate"),
      ownerName: getString(body, "ownerName", false) ?? "Invité",
      sponsorName: getString(body, "sponsorName", false) ?? "Invité",
      clientName: getString(body, "clientName", false) ?? "Client BTP",
    });
    return jsonResponse({ projectId }, 201);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to create BTP template project.", 400);
  }
}

