import { jsonErrorFromUnknown, jsonResponse } from "@/lib/api/route-utils";
import { buildPortfolioRoadmap } from "@/services/advanced-planning";
import { requireApiPermission } from "@/services/auth";

export async function GET() {
  try {
    const session = await requireApiPermission("project:read");
    return jsonResponse(await buildPortfolioRoadmap(session.workspaceId));
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to load portfolio roadmap.", 400);
  }
}

