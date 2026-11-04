import { buildOpenApiSpec } from "@/services/openapi";

export async function GET() {
  return Response.json(buildOpenApiSpec(), {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
}

