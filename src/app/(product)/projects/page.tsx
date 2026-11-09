import Link from "next/link";
import { Plus } from "lucide-react";

import { ProjectRowCard } from "@/components/app/project-row-card";
import { PageHeader } from "@/components/app/ui-kit";
import { Button } from "@/components/ui/button";
import { levelWorkspaceResourcesAction, setProjectDeclassedAction } from "@/features/projects/actions";
import { ProjectImportPanel } from "@/features/projects/project-import-panel";
import { computeDelayBanner } from "@/lib/fgf/delay-banner";
import { formatDateLabel } from "@/lib/format/formatters";
import { requireCurrentSession } from "@/services/auth";
import { getPersistenceInfo } from "@/services/project-store";
import { listProjectViews } from "@/services/projects";

/**
 * « Projets en cours » (par défaut) et « Tous les projets » (?vue=tous) — CdC p. 1.
 * Tous les projets : actifs + déclassés + archivés.
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const { vue } = await searchParams;
  const showAll = vue === "tous";
  const session = await requireCurrentSession();
  const views = await listProjectViews({ includeArchived: true, workspaceId: session.workspaceId });
  const persistence = getPersistenceInfo();
  const active = views.filter((v) => !v.aggregate.project.archivedAt && !v.aggregate.project.declassedAt);
  const declassed = views.filter((v) => v.aggregate.project.declassedAt && !v.aggregate.project.archivedAt);
  const archived = views.filter((v) => v.aggregate.project.archivedAt);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={showAll ? "Parcourir" : "Vos projets"}
        title={showAll ? "Tous les projets" : "Projets en cours"}
        description={
          showAll
            ? `${views.length} projet(s) sur ce poste : ${active.length} en cours, ${declassed.length} déclassé(s), ${archived.length} archivé(s).`
            : `${active.length} projet(s) actif(s). Les projets déclassés et archivés sont dans « Tous les projets ».`
        }
        actions={
          <>
            <Button asChild>
              <Link prefetch={false} href="/projects/new">
                <Plus className="size-4" aria-hidden="true" />
                Nouveau projet
              </Link>
            </Button>
            {showAll ? (
              <Button asChild variant="outline">
                <Link prefetch={false} href="/projects">Projets en cours</Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link prefetch={false} href="/projects?vue=tous">Tous les projets</Link>
              </Button>
            )}
            <form action={levelWorkspaceResourcesAction}>
              <Button type="submit" variant="outline" title="Nivelle les ressources partagées entre les projets">
                Niveler les ressources partagées
              </Button>
            </form>
          </>
        }
      />

      <section aria-labelledby="actifs" className="space-y-3">
        <h2 id="actifs" className="ct-title text-[17px]">Projets en cours</h2>
        {active.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((view) => (
              <ProjectRowCard key={view.aggregate.project.id} view={view} banner={computeDelayBanner(view)}>
                <form action={setProjectDeclassedAction} className="ml-auto">
                  <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                  <input type="hidden" name="declassed" value="true" />
                  <input type="hidden" name="actor" value={view.aggregate.project.ownerName} />
                  <button type="submit" className="text-[11.5px] font-semibold text-[#b45309] hover:underline" title="Sortir ce projet de « Projets en cours » sans l'archiver">
                    Déclasser
                  </button>
                </form>
              </ProjectRowCard>
            ))}
          </div>
        ) : (
          <div className="ct-card p-6 text-[13px] text-slate-600">
            Aucun projet en cours.{" "}
            <Link prefetch={false} href="/projects/new" className="font-bold text-[#3f8f48] underline">Créer un projet</Link>
          </div>
        )}
      </section>

      {showAll ? (
        <>
          <section aria-labelledby="declasses" className="space-y-3">
            <h2 id="declasses" className="ct-title text-[17px]">Projets déclassés ({declassed.length})</h2>
            {declassed.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {declassed.map((view) => (
                  <ProjectRowCard key={view.aggregate.project.id} view={view} banner={computeDelayBanner(view)}>
                    <form action={setProjectDeclassedAction} className="ml-auto">
                      <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                      <input type="hidden" name="declassed" value="false" />
                      <input type="hidden" name="actor" value={view.aggregate.project.ownerName} />
                      <button type="submit" className="text-[11.5px] font-semibold text-[#3f8f48] hover:underline">Reclasser</button>
                    </form>
                  </ProjectRowCard>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-slate-500">Aucun projet déclassé.</p>
            )}
          </section>
          <section aria-labelledby="archives" className="space-y-3">
            <h2 id="archives" className="ct-title text-[17px]">Projets archivés ({archived.length})</h2>
            {archived.length ? (
              <div className="ct-card divide-y divide-black/[0.05]">
                {archived.map((view) => (
                  <div key={view.aggregate.project.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
                    <span className="ct-num text-[11px] text-slate-500">{view.aggregate.project.code}</span>
                    <span className="font-bold text-slate-900">{view.aggregate.project.name}</span>
                    <span className="text-slate-500">Fin prévue {formatDateLabel(view.schedule.projectFinishDate)}</span>
                    <Link prefetch={false} href={`/projects/${view.aggregate.project.id}/dashboard`} className="ml-auto font-semibold text-[#3f8f48] hover:underline">
                      Consulter
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-slate-500">Aucun projet archivé.</p>
            )}
          </section>
        </>
      ) : null}

      <ProjectImportPanel />

      <p className="text-[11.5px] text-slate-500">
        Stockage : <strong>{persistence.mode === "prisma" ? "base de données PostgreSQL" : "fichier local sur ce poste"}</strong>
        {persistence.mode === "prisma" ? "" : " — sauvegarde automatique, voir la page Sauvegarde."}
      </p>
    </div>
  );
}
