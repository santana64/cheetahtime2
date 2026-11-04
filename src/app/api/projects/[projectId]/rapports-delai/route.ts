import { notFound } from "next/navigation";

import { getRapportDelaiLabel } from "@/lib/fgf/rapports-delai";
import { buildRapportDelaiPdf } from "@/services/rapport-delai-pdf";
import { getProjectView } from "@/services/projects";

/** PDF d'un rapport de délai (?id=…) ou du modèle vierge (?modele=1). */
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const view = await getProjectView(projectId).catch(() => notFound());
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const rapport = id ? (view.aggregate.project.rapportsDelai ?? []).find((r) => r.id === id) ?? null : null;
  if (id && !rapport) return new Response("Rapport introuvable.", { status: 404 });
  const name = rapport ? getRapportDelaiLabel(rapport.numero) : "modele_R2P";
  return new Response(new Uint8Array(buildRapportDelaiPdf(view, rapport)), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${view.aggregate.project.slug}_${name}_delai.pdf"`,
    },
  });
}
