import { readMainRaw } from "@/services/backup-store";

/**
 * Export d'une sauvegarde complète du portefeuille (téléchargement d'un fichier
 * JSON). Fonctionne dans l'app bureau ET dans le navigateur.
 */
export async function GET() {
  const raw = await readMainRaw();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(raw, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cheetah-time-sauvegarde-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
