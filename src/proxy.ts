import { NextResponse, type NextRequest } from "next/server";

import { resolveSessionFromCookies, roleCan } from "@/services/auth";

// Central guard for every request except the login flow and static assets.
// Layout-level checks are NOT enough: Next renders layouts and pages in
// parallel, so a page's data can be streamed before the layout redirects.
// The (product) layout check stays as defense in depth.
const PUBLIC_PATHS = new Set(["/login", "/logout", "/icon"]);

function requiredApiPermission(request: NextRequest): string {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (pathname.startsWith("/api/backup")) {
    return "project:*";
  }
  if (pathname === "/api/alerts" && method !== "GET") {
    return "settings:update";
  }
  if (method === "GET" || method === "HEAD") {
    return "project:read";
  }
  if (method === "DELETE" && /^\/api\/projects\/[^/]+\/?$/.test(pathname)) {
    return "project:*";
  }
  return "project:update";
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  const session = await resolveSessionFromCookies((name) => request.cookies.get(name)?.value);

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (isApi && !roleCan(session.role, requiredApiPermission(request))) {
    return NextResponse.json({ error: "Droits insuffisants pour cette operation." }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and files with an extension (public/ assets).
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
