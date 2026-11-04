import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

import { AppShell } from "@/components/app/app-shell";
import { requireCurrentSession } from "@/services/auth";
import { listProjectSummaries } from "@/services/projects";

export default async function ProductLayout({ children }: { children: ReactNode }) {
  const session = await requireCurrentSession();
  const projects = await listProjectSummaries().catch(() => []);
  return (
    <AppShell session={session} projects={projects}>
      {children}
    </AppShell>
  );
}
