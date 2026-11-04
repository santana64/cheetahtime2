import { jsonErrorFromUnknown, jsonResponse } from "@/lib/api/route-utils";
import { requireApiPermission } from "@/services/auth";
import {
  createSmartAlertDigest,
  listWorkspaceSmartAlerts,
} from "@/services/smart-alerts";
import type { NotificationChannel } from "@/services/notifications";

export async function GET() {
  try {
    const session = await requireApiPermission("project:read");
    const alerts = await listWorkspaceSmartAlerts(session.workspaceId);
    return jsonResponse({
      generatedAt: new Date().toISOString(),
      workspaceId: session.workspaceId,
      counts: {
        critical: alerts.filter((alert) => alert.severity === "critical").length,
        warning: alerts.filter((alert) => alert.severity === "warning").length,
        info: alerts.filter((alert) => alert.severity === "info").length,
      },
      alerts,
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to load alerts.", 400);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiPermission("settings:update");
    const body = (await request.json().catch(() => ({}))) as { channel?: NotificationChannel };
    const digest = await createSmartAlertDigest({
      workspaceId: session.workspaceId,
      userId: session.userId,
      channel: body.channel ?? "IN_APP",
    });
    return jsonResponse({ ok: true, digest }, 201);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to create alert digest.", 400);
  }
}
