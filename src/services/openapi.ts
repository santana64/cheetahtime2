export function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Cheetah Time API",
      version: "2026.05.18",
      description:
        "API publique Cheetah Time: planning, pont Time-Cost, alertes, simulations et exports.",
    },
    servers: [{ url: "/api" }],
    security: [{ sessionCookie: [] }, { apiKey: [] }],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "cheetah_session",
        },
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "x-cheetah-api-key",
        },
      },
    },
    paths: {
      "/projects": {
        get: {
          summary: "Lister les projets du portefeuille",
          tags: ["Projects"],
          responses: { "200": { description: "Portefeuille courant" } },
        },
        post: {
          summary: "Creer un projet vierge",
          tags: ["Projects"],
          responses: { "201": { description: "Projet cree" } },
        },
      },
      "/projects/{projectId}": {
        get: {
          summary: "Charger un projet planifie",
          tags: ["Projects"],
          parameters: [{ name: "projectId", in: "path", required: true }],
          responses: { "200": { description: "ProjectView complet" } },
        },
      },
      "/projects/{projectId}/bridge-export": {
        get: {
          summary: "Exporter le contrat Time-Cost",
          tags: ["Cost Bridge"],
          parameters: [{ name: "projectId", in: "path", required: true }],
          responses: {
            "200": {
              description:
                "WBS, référentiels, jalons, écarts, signaux et impact coût exportables au format FGF de coûtenance",
            },
          },
        },
      },
      "/projects/{projectId}/advanced": {
        get: {
          summary: "Calculs scheduling avances",
          tags: ["Scheduling"],
          parameters: [{ name: "projectId", in: "path", required: true }],
          responses: {
            "200": {
              description:
                "Earned Schedule, Monte Carlo, tendances, look-ahead, reseau PERT et impact cout",
            },
          },
        },
      },
      "/projects/{projectId}/what-if": {
        post: {
          summary: "Simulation what-if en lecture seule",
          tags: ["Scheduling"],
          parameters: [{ name: "projectId", in: "path", required: true }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    shiftTask: {
                      type: "object",
                      properties: { taskId: { type: "string" }, days: { type: "number" } },
                    },
                    addResource: {
                      type: "object",
                      properties: {
                        taskId: { type: "string" },
                        dailyRate: { type: "number" },
                        compressionPercent: { type: "number" },
                      },
                    },
                    removeLot: {
                      type: "object",
                      properties: { taskId: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Impact delai/cout de la simulation" } },
        },
      },
      "/alerts": {
        get: {
          summary: "Lister les alertes intelligentes actives",
          tags: ["Alerts"],
          responses: { "200": { description: "Alertes workspace courant" } },
        },
      },
      "/portfolio": {
        get: {
          summary: "Vue portfolio cross-projets",
          tags: ["Portfolio"],
          responses: { "200": { description: "Jalons et conflits cross-projets" } },
        },
      },
      "/templates/btp": {
        get: {
          summary: "Lister les templates BTP/infra embarques",
          tags: ["Templates"],
          responses: { "200": { description: "Templates sectoriels" } },
        },
        post: {
          summary: "Creer un projet depuis un template BTP",
          tags: ["Templates"],
          responses: { "201": { description: "Projet cree depuis template" } },
        },
      },
      "/projects/{projectId}/reports": {
        get: {
          summary: "Exporter rapports et fichiers projet",
          tags: ["Exports"],
          parameters: [
            { name: "projectId", in: "path", required: true },
            {
              name: "format",
              in: "query",
              schema: {
                enum: ["json", "csv", "excel", "pdf", "soutenance", "svg", "json-full"],
              },
            },
          ],
          responses: { "200": { description: "Rapport ou export demande" } },
        },
      },
    },
  };
}

