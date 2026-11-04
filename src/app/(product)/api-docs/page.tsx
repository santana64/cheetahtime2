import type { Metadata } from "next";

import { buildOpenApiSpec } from "@/services/openapi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "API Reference — CheetahSoft",
  description: "Documentation publique de l'API REST Cheetah Time.",
};

export default function ApiDocsPage() {
  const spec = buildOpenApiSpec();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/70 bg-white/85 p-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">CheetahSoft</div>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-[#1a4a20]">API Reference</h1>
        <p className="mt-2 text-sm text-slate-500">
          API REST de Cheetah Time — intégration avec Jira, Primavera P6 et tout système tiers.
          Authentification par session cookie ou token Bearer.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-[#1a4a20]/20 bg-[#1a4a20]/5 px-4 py-2 text-sm font-semibold text-[#1a4a20] hover:bg-[#1a4a20]/10 transition-colors"
          >
            Télécharger OpenAPI JSON
          </a>
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500">
            v{(spec as { info?: { version?: string } }).info?.version ?? "1.0"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Projets & Tâches",
            color: "#1a4a20",
            endpoints: [
              "GET /api/projects — Liste des projets",
              "POST /api/projects — Créer un projet",
              "GET /api/projects/:id — Détail projet",
              "GET /api/projects/:id/tasks — Tâches",
              "POST /api/projects/:id/tasks — Créer tâche",
            ],
          },
          {
            title: "Planning avancé",
            color: "#7c3aed",
            endpoints: [
              "GET /api/projects/:id/advanced — ES, Monte Carlo",
              "POST /api/projects/:id/what-if — Simulation",
              "GET /api/projects/:id/baselines — Baselines",
              "POST /api/projects/:id/leveling — Nivellement",
              "GET /api/projects/:id/network — Réseau PERT",
            ],
          },
          {
            title: "Exports & Intégrations",
            color: "#d97706",
            endpoints: [
              "GET /api/projects/:id/reports?format=pdf",
              "GET /api/projects/:id/reports?format=excel",
              "GET /api/projects/:id/reports?format=gantt-svg",
              "GET /api/projects/:id/bridge-export — Cost bridge",
              "POST /api/projects/:id/ai-assist — Assistant IA",
            ],
          },
        ].map(({ title, color, endpoints }) => (
          <Card key={title}>
            <CardHeader className="pb-2">
              <div className="h-[3px] w-8 rounded-full mb-2" style={{ background: color }} />
              <CardTitle className="text-sm font-bold" style={{ color }}>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {endpoints.map((ep) => (
                  <li key={ep} className="rounded-lg bg-slate-50 px-3 py-1.5 font-mono text-[11px] text-slate-600">
                    {ep}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authentification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>
            Cheetah Time utilise des sessions HTTP sécurisées. Pour les intégrations serveur-à-serveur,
            passez votre token dans le header <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">Authorization: Bearer &lt;token&gt;</code>.
          </p>
          <div className="rounded-xl bg-slate-900 px-4 py-3 font-mono text-[12px] text-emerald-400">
            <div className="text-slate-500"># Exemple cURL</div>
            <div>curl -H &quot;Authorization: Bearer $TOKEN&quot; \</div>
            <div className="pl-4">https://votre-instance.com/api/projects</div>
          </div>
          <p className="text-xs text-slate-400">
            L&apos;API est documentée au format OpenAPI 3.0 — importez <code>/api/docs</code> dans Postman, Insomnia ou Swagger UI.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
