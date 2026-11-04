import { jsonError, jsonErrorFromUnknown } from "@/lib/api/route-utils";
import { getTaskAttachmentFile } from "@/services/attachments";
import { requireApiPermission } from "@/services/auth";
import { getProjectAggregate } from "@/services/projects";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; attachmentId: string }> },
) {
  try {
    const session = await requireApiPermission("project:read");
    const { projectId, attachmentId } = await context.params;
    await getProjectAggregate(projectId, { workspaceId: session.workspaceId });
    const file = await getTaskAttachmentFile(projectId, attachmentId);

    if (!file) {
      return jsonError("Piece jointe introuvable.", 404);
    }

    const encodedName = encodeURIComponent(file.attachment.fileName);
    return new Response(file.bytes, {
      status: 200,
      headers: {
        "content-type": file.contentType,
        "content-length": String(file.sizeBytes),
        "content-disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "x-cheetah-time-checksum-sha256": file.attachment.checksumSha256 ?? "",
      },
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Impossible de télécharger la piece jointe.", 400);
  }
}
