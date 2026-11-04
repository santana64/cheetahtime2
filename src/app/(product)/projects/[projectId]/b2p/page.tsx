import { notFound } from "next/navigation";
import Link from "next/link";

import { B2PBilanView } from "@/features/projects/b2p-bilan-view";
import { MilestoneTrend } from "@/components/app/milestone-trend";
import { buildRecommendedB2PDates, getB2PCadenceRule } from "@/lib/fgf/b2p";
import { buildB2PPlanningReview } from "@/lib/fgf/b2p-review";
import { getProjectView } from "@/services/projects";
import { B2PTables } from "@/components/app/b2p-tables";
import { B2PAdvanceForm, type B2PAdvanceTaskRow } from "@/features/projects/b2p-advance-form";
import { computeDelayBanner } from "@/lib/fgf/delay-banner";
import { fromWorkingDays, timeUnitShortLabel } from "@/lib/planning/time-unit";

export default async function ProjectB2PPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => notFound());

  // Pilotage du Temps INACCESSIBLE tant que le Planning Initial (PI) n'a pas été retenu
  // (spec François 23/08). Le PI = la variante de planning ACTIVE (onglet Planning →
  // « Désigner comme PI »). Tant qu'aucune variante n'est active, le pilotage est verrouillé.
  const piRetained = Boolean(view.activeBaseline);
  if (!piRetained) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white/95 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg,#56a45b,#f4a321)" }} />
          <div className="p-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#3f8f48]">Pilotage du Temps</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#1a4a20]">Retenez d&apos;abord le Planning Initial</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Le pilotage des B2P n&apos;est accessible qu&apos;une fois le <strong>Planning Initial (PI)</strong> retenu.
              Ouvrez l&apos;onglet <strong>Planning</strong>, enregistrez une variante (P01 → P99), puis{" "}
              <strong>« Désignez-la comme PI »</strong>. La date de fin initiale et les B2P seront alors datés.
            </p>
            <Link
              href={`/projects/${projectId}/planning`}
              className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white"
              style={{ background: "#56a45b" }}
            >
              Aller au Planning →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const project = view.aggregate.project;
  const dateDebut = project.targetStartDate;
  // En ESTIMATION, la fin du projet est calculée par le moteur à partir des durées
  // des LT (elle n'est pas saisie) : on cale le rythme B2P sur la fin réelle, la plus
  // tardive entre la fin contractuelle et la fin calculée — sinon « 0 B2P » en estimation.
  const dateFin =
    [project.targetFinishDate ?? null, view.schedule.projectFinishDate ?? null]
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? dateDebut;

  // Les dates de B2P suivent la RÈGLE FGF sur la durée RÉELLE du projet (start → fin
  // calculée). On recalcule toujours : un projet de 18 mois doit avoir des B2P espacés
  // (tous les 2 mois), pas toutes les semaines. Les dates stockées éventuelles ne
  // priment plus (elles pouvaient venir d'une durée par défaut erronée).
  const dates = buildRecommendedB2PDates({ dateDebut, dateFin });
  const cadence = getB2PCadenceRule(dateDebut, dateFin);
  const review = buildB2PPlanningReview(view);

  const banner = computeDelayBanner(view);
  const unitLabel = timeUnitShortLabel(project.timeUnit ?? "jours");
  const snapshots = project.b2pSnapshots ?? {};
  const statusDate = view.schedule.statusDate ?? null;
  // Prochain B2P à saisir : le premier B2P postérieur à la dernière date d'état.
  const nextIndex = Math.max(1, dates.findIndex((d) => !statusDate || d > statusDate));
  const nextDate = dates[nextIndex] ?? dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10);
  const advanceRows: B2PAdvanceTaskRow[] = view.tasks
    .filter((t) => !t.isSummary && t.type !== "SUMMARY")
    .map((t) => ({
      id: t.id,
      code: t.code ?? t.wbsCode,
      name: t.name,
      isProvision: /^PT/i.test(t.code ?? "") || /provision/i.test(t.name),
      status: t.status,
      plannedStart: t.scheduledStartDate ?? null,
      plannedFinish: t.scheduledFinishDate ?? null,
      actualStart: t.actualStartDate ?? null,
      actualFinish: t.actualFinishDate ?? null,
      durationUnits: fromWorkingDays(t.durationDays, project.timeUnit ?? "jours"),
    }));

  return (
    <div className="space-y-6">
      <B2PTables dates={dates} banner={banner} snapshots={snapshots} unitLabel={unitLabel} />

      <B2PAdvanceForm
        projectId={projectId}
        nextB2PDate={nextDate}
        b2pLabel={`B2P${nextIndex}`}
        unitLabel={unitLabel}
        rows={advanceRows}
      />

      <B2PBilanView
        projectId={projectId}
        dates={dates}
        cadenceLabel={cadence?.label ?? "—"}
        review={review}
        notes={project.b2pNotes ?? {}}
        scenarios={project.b2pScenarios ?? {}}
        unit={project.timeUnit ?? "jours"}
      />

      {/* Rapport Périodique de Pilotage du Temps (CdC B3) : double planning + Temps/Temps + Jalons-Jalons — pas de courbe en S. */}
      <section className="ct-card p-5">
        <div className="section-label">Méthode FGF · pilotage</div>
        <h2 className="ct-title mt-1 text-[17px]">Rapport Périodique de Pilotage du Temps</h2>
        <p className="mt-1.5 max-w-3xl text-[12.5px] leading-5 text-slate-600">
          Double planning (PàD en noir, réalisé en rouge, reste à faire en vert — onglet{" "}
          <Link href={`/projects/${projectId}/planning`} className="font-semibold text-[#3f8f48] underline">Planning</Link>
          ) et diagrammes Temps/Temps et Jalons-Jalons ci-dessous. Le rapport PDF reprend ces éléments.
        </p>
      </section>

      <MilestoneTrend view={view} />
    </div>
  );
}
