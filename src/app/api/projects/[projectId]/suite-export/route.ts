import { jsonErrorFromUnknown, jsonResponse } from "@/lib/api/route-utils";
import { buildSuiteExport } from "@/services/projects";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const file = await buildSuiteExport(projectId);
    const download = new URL(_request.url).searchParams.get("download");
    if (download) {
      const slug = String(file.project.nom).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "projet";
      return new Response(JSON.stringify(file, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${slug}.cheetahcost.json"`,
        },
      });
    }
    return jsonResponse(file);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Impossible d'exporter le fichier commun de la suite.", 404);
  }
}
