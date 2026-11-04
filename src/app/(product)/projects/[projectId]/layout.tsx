import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import {
  ProjectHealthBadge,
  ProjectStatusBadge,
} from "@/components/app/status-badge";
import { DelayBannerStrip } from "@/components/app/delay-banner-strip";
import { computeDelayBanner } from "@/lib/fgf/delay-banner";
import { ProjectTabs } from "@/components/app/project-tabs";
import { AiAssistant } from "@/components/app/ai-assistant";
import { getProjectView } from "@/services/projects";
import { notFound } from "next/navigation";
import { requireCurrentSession } from "@/services/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => null);
  if (!view) return { title: "Projet" };
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

  const banner = computeDelayBanner(view);
  const project = view.aggregate.project;
  const exports = [
    { label: "Rapport PDF (commission)", href: `/api/projects/${project.id}/reports?format=pdf` },
    { label: "Classeur Excel (.xlsx)", href: `/api/projects/${project.id}/reports?format=excel` },
    { label: "Tableau CSV", href: `/api/projects/${project.id}/reports?format=csv` },
    { label: "Gantt (image SVG)", href: `/api/projects/${project.id}/reports?format=gantt-svg` },
    { label: "MS Project (.xml — à ouvrir dans MS Project)", href: `/api/projects/${project.id}/export?format=mspdi` },
    { label: "Fichier commun Cheetah Cost (.cheetahcost.json)", href: `/api/projects/${project.id}/suite-export?download=1` },
    { label: "Sauvegarde du projet (JSON)", href: `/api/projects/${project.id}/export` },
  ];

  return (
    <div className="space-y-5">
      {/* En-tête projet — compact, non collant (seuls les onglets restent visibles au défilement). */}
      <header className="ct-card overflow-hidden">
        <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg, #56a45b, #f4a321)" }} />
        <div className="flex flex-col gap-3 px-4 pt-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/projects"
              aria-label="Retour aux projets"
              className="flex size-7 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="ct-title min-w-0 truncate text-[19px]" title={project.description || project.name}>
              {project.name}
            </h1>
            <span className="ct-num flex-shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {project.code}
            </span>
            <ProjectStatusBadge status={project.status} />
            <ProjectHealthBadge health={project.health} />
            {project.phase ? (
              <span className="rounded-full border border-[#56a45b]/30 bg-[#56a45b]/10 px-2 py-0.5 text-[10px] font-bold text-[#1a4a20]">
                {project.phase}
              </span>
            ) : null}
            {isArchived && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Archivé
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-[11px] text-slate-500 lg:inline">
                Responsable : <strong className="text-slate-700">{project.ownerName}</strong>
              </span>
              {/* Comme Cheetah Cost : « Nouveau B2P » en action principale, puis « Fichier ». */}
              <Link href={`/projects/${project.id}/b2p#saisie-b2p`} className="toolbar-btn toolbar-btn-primary">
                Nouveau B2P
              </Link>
              <details className="relative">
                <summary className="toolbar-btn list-none [&::-webkit-details-marker]:hidden">Fichier ▾</summary>
                <div className="absolute right-0 z-50 mt-1 w-60 rounded-xl border border-black/[0.08] bg-white p-1 shadow-lg">
                  {exports.map(({ label, href }) => (
                    <a key={label} href={href} download className="block rounded-lg px-3 py-2 text-[12.5px] font-semibold text-slate-700 hover:bg-[#56a45b]/10">
                      {label}
                    </a>
                  ))}
                </div>
              </details>
            </div>
          </div>

          <DelayBannerStrip banner={banner} compact />
        </div>
        <div className="h-3" />
      </header>
      {/* Onglets : seule partie collante (≈ 42 px au lieu de 30 à 45 % de l'écran). */}
      <div className="ct-card sticky top-0 z-30 -mt-2 px-2 sm:px-3" style={{ borderRadius: 12 }}>
        <ProjectTabs projectId={project.id} />
      </div>

      {children}

      {/* Assistant (flottant) */}
      <AiAssistant projectId={project.id} />
    </div>
  );
}
