import Link from "next/link";
import { Plus } from "lucide-react";

import {
  ProjectHealthBadge,
  ProjectOriginBadge,
  ProjectStatusBadge,
} from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { levelWorkspaceResourcesAction, setProjectDeclassedAction } from "@/features/projects/actions";
import { ProjectImportPanel } from "@/features/projects/project-import-panel";
import { formatDateLabel, formatPercent } from "@/lib/format/formatters";
import { getPersistenceInfo } from "@/services/project-store";
import { listProjectViews } from "@/services/projects";
import { PageHeader, StatGrid, StatTile } from "@/components/app/ui-kit";
import { cn } from "@/lib/utils";
import { requireCurrentSession } from "@/services/auth";

export default async function ProjectsPage() {
  
  const views = await listProjectViews({
    includeArchived: true,
    workspaceId: (await requireCurrentSession()).workspaceId,
  });
  const persistence = getPersistenceInfo();
  // « Projets en cours » = ni archivés, ni déclassés. Les déclassés ont leur propre section
  // (spec François : sortir un projet de la liste active sans l'archiver définitivement).
  const activeViews = views.filter(
    (v) => !v.aggregate.project.archivedAt && !v.aggregate.project.declassedAt,
  );
  const declassedViews = views.filter(
    (v) => v.aggregate.project.declassedAt && !v.aggregate.project.archivedAt,
  );
  const archivedViews = views.filter((v) => v.aggregate.project.archivedAt);
  const derivedRiskCount = views.filter(
    (v) =>
      v.metrics.derivedHealth === "AT_RISK" ||
      v.metrics.derivedHealth === "OFF_TRACK",
  ).length;

  return (
    <div className="space-y-6">

      {/* ── En-tête clair CheetahCost ── */}
      <PageHeader
        eyebrow="Vos projets"
        title="Projets en cours"
        description="Tous les plans actifs de ce poste, avec leurs signaux d'ordonnancement calculés par le moteur."
        actions={
          <>
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="size-4" />
                Nouveau projet
              </Link>
            </Button>
            <form action={levelWorkspaceResourcesAction}>
              <Button type="submit" variant="outline">Niveler les ressources</Button>
            </form>
          </>
        }
      />

      {/* ── Portfolio KPI summary — cartes claires CheetahCost ── */}
      <StatGrid>
        <StatTile label="Projets actifs" value={activeViews.length} tone="#56a45b" />
        <StatTile label="Déclassés" value={declassedViews.length} tone="#b45309" />
        <StatTile label="Archivé" value={archivedViews.length} tone="#94a3b8" />
        <StatTile
          label="Risque calculé"
          value={derivedRiskCount}
          sub="signalé par le moteur"
          tone={derivedRiskCount > 0 ? "#e2424a" : "#94a3b8"}
        />
        <StatTile
          label="Référentiels actifs"
          value={views.filter((v) => v.activeBaseline).length}
          tone="#f4a321"
        />
      </StatGrid>

      {/* ── Persistence mode notice ── */}
      <Card
        className="border-dashed bg-white/50 shadow-none"
        style={{ borderColor: "oklch(0.880 0.011 85 / 0.60)" }}
      >
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Mode de persistance
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {persistence.label}
            </div>
            <div className="mt-0.5 max-w-xl text-xs text-slate-500">
              {persistence.description}
            </div>
          </div>
          <div
            className="shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em]"
            style={
              persistence.mode === "prisma"
                ? { background: "oklch(0.925 0.030 145)", color: "oklch(0.355 0.118 145)" }
                : { background: "oklch(0.96 0.065 58 / 0.40)", color: "oklch(0.530 0.172 52)" }
            }
          >
            {persistence.mode === "prisma" ? "Base de données" : "Données locales"}
          </div>
        </CardContent>
      </Card>

      {/* ── Active portfolio ── */}
      <ProjectImportPanel />

      <section className="space-y-4 animate-velocity-enter delay-300">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {/* Rosette decoration */}
            <span className="flex items-center gap-1 animate-rosette-bloom delay-350" aria-hidden="true">
              <span className="block size-2.5 rounded-full" style={{ background: "oklch(0.555 0.155 145)" }} />
              <span className="block size-1.5 rounded-full" style={{ background: "oklch(0.670 0.172 52)" }} />
              <span className="block size-2 rounded-full" style={{ background: "oklch(0.555 0.155 145)" }} />
            </span>
            <div>
              <h2 className="text-xl font-bold text-[#1a4a20]">Projets actifs</h2>
              <p className="text-xs text-slate-500">
                Plans actifs, avec santé, écarts et échéances calculés par le moteur.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {activeViews.map((view, i) => {
            const health = view.metrics.derivedHealth;
            const isAtRisk = health === "AT_RISK" || health === "OFF_TRACK";
            const cardDelays = ["delay-50", "delay-150", "delay-250", "delay-350", "delay-450", "delay-550"];
            const delayClass = cardDelays[i % cardDelays.length];
            return (
              <Card
                key={view.aggregate.project.id}
                className={cn(
                  "group flex flex-col elite-lift aurora-card animate-velocity-enter",
                  isAtRisk ? "border-rose-200/50" : "",
                  delayClass,
                )}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* Top accent bar */}
                <div
                  className="h-[2px] w-full rounded-t-2xl animate-gradient-x"
                  style={{
                    background: isAtRisk
                      ? "oklch(0.54 0.20 24)"
                      : "linear-gradient(90deg, oklch(0.355 0.118 145) 0%, oklch(0.670 0.172 52) 50%, oklch(0.355 0.118 145) 100%)",
                    backgroundSize: "200% 100%",
                  }}
                />

                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ProjectStatusBadge status={view.aggregate.project.status} />
                    <ProjectHealthBadge health={view.aggregate.project.health} />
                    <ProjectOriginBadge origin={view.aggregate.project.origin} />
                  </div>
                  <CardTitle className="mt-1 text-[15px] leading-snug truncate">
                    {view.aggregate.project.name}
                  </CardTitle>
                  <p className="text-xs leading-5 text-slate-500 line-clamp-2">
                    {view.aggregate.project.description}
                  </p>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  {/* Key metrics grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        label: "Avancement",
                        value: formatPercent(view.metrics.overallProgress),
                        color: "oklch(0.355 0.118 145)",
                      },
                      {
                        label: "Fin prévisionnelle",
                        value: formatDateLabel(view.schedule.projectFinishDate),
                        color: "oklch(0.155 0.022 230)",
                        small: true,
                      },
                      {
                        label: "Tâches critiques",
                        value: String(view.metrics.criticalTaskCount),
                        color:
                          view.metrics.criticalTaskCount > 0
                            ? "oklch(0.54 0.20 24)"
                            : "oklch(0.155 0.022 230)",
                      },
                      {
                        label: "Ressources",
                        value: String(view.aggregate.resources.length),
                        color: "oklch(0.670 0.172 52)",
                      },
                    ].map(({ label, value, color, small }) => (
                      <div
                        key={label}
                        className="rounded-lg border px-3 py-2.5"
                        style={{
                          borderColor: "oklch(0.880 0.011 85 / 0.40)",
                          background: "oklch(0.978 0.008 85 / 0.60)",
                        }}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          {label}
                        </div>
                        <div
                          className={cn(
                            "mt-1 font-bold tabular-nums leading-none animate-count-pop",
                            small ? "text-[14px]" : "text-[20px]",
                          )}
                          style={{ color }}
                        >
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary snapshot */}
                  <div
                    className="gradient-border space-y-1.5 rounded-lg border px-3 py-3"
                    style={{
                      borderColor: "oklch(0.880 0.011 85 / 0.40)",
                      background: "oklch(0.978 0.008 85 / 0.50)",
                    }}
                  >
                    {[
                      { key: "Responsable", value: view.aggregate.project.ownerName },
                      {
                        key: "Fin prévue",
                        value: formatDateLabel(view.schedule.projectFinishDate),
                      },
                      {
                        key: "Référentiel",
                        value: view.activeBaseline?.name ?? "Non capturé",
                      },
                    ].map(({ key, value }) => (
                      <div key={key} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-400">{key}</span>
                        <span className="font-medium text-slate-700">{value}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400">Moteur</span>
                      <span
                        className="font-bold"
                        style={{
                          color:
                            health === "ON_TRACK"
                              ? "oklch(0.52 0.14 148)"
                              : health === "WATCH"
                                ? "oklch(0.62 0.15 58)"
                                : "oklch(0.54 0.20 24)",
                        }}
                      >
                        {({"ON_TRACK":"En bonne voie","WATCH":"Surveillance","AT_RISK":"À risque","OFF_TRACK":"Hors délai"} as Record<string,string>)[health] ?? health}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link href={`/projects/${view.aggregate.project.id}/planning`}>
                        Planifier
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/projects/${view.aggregate.project.id}/dashboard`}>
                        Tableau de bord
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/projects/${view.aggregate.project.id}/resources`}>
                        Ressources
                      </Link>
                    </Button>
                    <form action={setProjectDeclassedAction} className="ml-auto">
                      <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                      <input type="hidden" name="declassed" value="true" />
                      <input type="hidden" name="actor" value={view.aggregate.project.ownerName} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="text-[#b45309] hover:bg-[#b45309]/10"
                        title="Sortir ce projet de « Projets en cours » sans l'archiver"
                      >
                        Déclasser
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── Projets déclassés (sortis des « en cours » sans archivage) ── */}
      {declassedViews.length ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-[#1a4a20]">Projets déclassés</h2>
            <p className="text-xs text-slate-500">
              Sortis de « Projets en cours » sans archivage. Reclassez-les pour les réactiver.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {declassedViews.map((view) => (
              <Card key={view.aggregate.project.id} className="bg-white/70">
                <div className="h-[2px] w-full rounded-t-2xl" style={{ background: "#b45309" }} />
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ProjectOriginBadge origin={view.aggregate.project.origin} />
                    <span
                      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                      style={{ borderColor: "rgba(180,83,9,0.3)", color: "#b45309", background: "rgba(180,83,9,0.08)" }}
                    >
                      Déclassé
                    </span>
                  </div>
                  <CardTitle className="mt-1 text-[15px] leading-snug truncate">
                    {view.aggregate.project.name}
                  </CardTitle>
                  <p className="text-xs leading-5 text-slate-500 line-clamp-2">
                    {view.aggregate.project.description}
                  </p>
                </CardHeader>
                <CardContent className="mt-auto flex flex-wrap gap-2 pt-0">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/projects/${view.aggregate.project.id}/planning`}>Ouvrir</Link>
                  </Button>
                  <form action={setProjectDeclassedAction} className="ml-auto">
                    <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                    <input type="hidden" name="declassed" value="false" />
                    <input type="hidden" name="actor" value={view.aggregate.project.ownerName} />
                    <Button type="submit" size="sm" title="Remettre ce projet dans « Projets en cours »">
                      Reclasser
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Archived portfolio ── */}
      {archivedViews.length ? (
        <section className="space-y-4 animate-velocity-enter delay-500">
          <div>
            <h2 className="text-xl font-bold text-[#1a4a20]">Projets archivés</h2>
            <p className="text-xs text-slate-500">
              Dossiers de planning conservés — exclus du tableau de bord actif.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {archivedViews.map((view) => (
              <Card key={view.aggregate.project.id} className="bg-white/70 opacity-80">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ProjectOriginBadge origin={view.aggregate.project.origin} />
                    <span
                      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                      style={{
                        borderColor: "oklch(0.880 0.011 85 / 0.55)",
                        background: "oklch(0.952 0.007 85)",
                        color: "oklch(0.455 0.016 220)",
                      }}
                    >
                      Archivé
                    </span>
                  </div>
                  <CardTitle className="mt-1 text-[14px] leading-snug">
                    {view.aggregate.project.name}
                  </CardTitle>
                  <p className="text-xs text-slate-500">
                    Archivé le{" "}
                    {new Date(view.aggregate.project.archivedAt!).toLocaleDateString("fr-FR")}{" "}
                    par {view.aggregate.project.archivedBy ?? view.aggregate.project.ownerName}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400">Fin prévisionnelle</span>
                    <span className="font-medium text-slate-700">
                      {formatDateLabel(view.schedule.projectFinishDate)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400">Référentiel actif</span>
                    <span className="font-medium text-slate-700">
                      {view.activeBaseline?.name ?? "Non capturé"}
                    </span>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/projects/${view.aggregate.project.id}/dashboard`}>
                      Ouvrir le dossier
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
