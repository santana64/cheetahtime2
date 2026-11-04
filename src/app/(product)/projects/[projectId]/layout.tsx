import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import {
  ProjectHealthBadge,
  ProjectOriginBadge,
  ProjectStatusBadge,
} from "@/components/app/status-badge";
import { ProjectTabs } from "@/components/app/project-tabs";
import { AiAssistant } from "@/components/app/ai-assistant";
import { formatDateLabel } from "@/lib/format/formatters";
import { getProjectView } from "@/services/projects";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { requireCurrentSession } from "@/services/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => null);
  if (!view) return { title: "Project" };
  return {
    title: view.aggregate.project.name,
    description: `${view.aggregate.project.clientName} — ${view.aggregate.project.description}`,
  };
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  
  const view = await getProjectView(projectId, { workspaceId: (await requireCurrentSession()).workspaceId }).catch(() => notFound());
  const isArchived = Boolean(view.aggregate.project.archivedAt);

  return (
    <div className="space-y-5">
      {/* Project header — style CheetahCost : blanc, dense, collant */}
      <div
        className="sticky top-0 z-20 overflow-hidden rounded-2xl panel-solid"
        style={{ backdropFilter: "saturate(1.1)" }}
      >
        <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg, #56a45b, #f4a321)" }} />
        <div className="flex flex-col gap-3 px-5 pt-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            {/* Identity */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/projects"
                  aria-label="Retour au portefeuille"
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </Link>
                <h1 className="truncate text-[19px] font-bold tracking-tight text-slate-900">
                  {view.aggregate.project.name}
                </h1>
                <span className="flex-shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
                  {view.aggregate.project.code}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <ProjectStatusBadge status={view.aggregate.project.status} />
                <ProjectHealthBadge health={view.aggregate.project.health} />
                <ProjectOriginBadge origin={view.aggregate.project.origin} />
                {isArchived && (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Archivé
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-2xl text-[12px] leading-5 text-slate-500">
                {view.aggregate.project.description}
              </p>
            </div>

            {/* Schedule meta */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 xl:shrink-0 xl:pt-1">
              {[
                { label: "Début", value: formatDateLabel(view.aggregate.project.targetStartDate) },
                { label: "Fin prévisionnelle", value: formatDateLabel(view.schedule.projectFinishDate), emphasis: true },
                { label: "Responsable", value: view.aggregate.project.ownerName },
              ].map(({ label, value, emphasis }) => (
                <div key={label} className="min-w-[92px]">
                  <div className="section-label">{label}</div>
                  <div className={cn("mt-1 text-[13px] font-bold", emphasis ? "text-[#3f8f48]" : "text-slate-800")}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs + exports */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
            <ProjectTabs projectId={view.aggregate.project.id} />
            <div className="flex flex-wrap items-center gap-1.5 py-2">
              {[
                { label: "PDF", href: `/api/projects/${view.aggregate.project.id}/reports?format=pdf` },
                { label: "Excel", href: `/api/projects/${view.aggregate.project.id}/reports?format=excel` },
                { label: "CSV", href: `/api/projects/${view.aggregate.project.id}/reports?format=csv` },
                { label: "SVG Gantt", href: `/api/projects/${view.aggregate.project.id}/reports?format=gantt-svg` },
                { label: "JSON", href: `/api/projects/${view.aggregate.project.id}/export` },
              ].map(({ label, href }) => (
                <a key={label} href={href} download className="toolbar-btn">
                  ↓ {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {children}

      {/* Floating AI assistant */}
      <AiAssistant projectId={view.aggregate.project.id} />
    </div>
  );
}
