import { monthsBetween } from "@/lib/planning/month-calendar";
import { timeUnitShortLabel } from "@/lib/planning/time-unit";
import { workingDayDistance } from "@/lib/planning/date-utils";
import type { Baseline, ISODate, ProjectView, TimeUnit } from "@/types/planning";

/**
 * Bandeau de pilotage du temps (CdC FGF p. 12) — transposition délai du
 * bandeau coût de CheetahCost :
 *   BàD → Fin Initiale (Fi) · Budget à Date → Fin à Date (PàD)
 *   Dépenses → Date actuelle · CP → Fin Prévisionnelle (FP)
 *   Écart (€) → Écart dans l'unité du projet (mois, semaines, jours)
 *   Avancement → Avancement
 * Une seule source pour tous les écrans (tableau de bord, B2P, rapports).
 */

export interface DelayBanner {
  finInitiale: ISODate | null;
  finADate: ISODate | null;
  dateActuelle: ISODate;
  finPrevisionnelle: ISODate | null;
  /** Écart FP − PàD dans l'unité du projet. > 0 = retard. */
  ecart: number | null;
  ecartJours: number | null;
  unit: TimeUnit;
  unitLabel: string;
  avancement: number;
  /** CdC p. 12 : « Action de pilotage requise / non requise ». */
  actionRequise: boolean;
  hasPI: boolean;
}

function baselineFinish(baseline: Baseline | undefined | null): ISODate | null {
  if (!baseline) return null;
  let max: string | null = null;
  for (const s of baseline.snapshots) {
    if (s.finishDate && (!max || s.finishDate > max)) max = s.finishDate;
  }
  return max;
}

export function todayIso(): ISODate {
  return new Date().toISOString().slice(0, 10);
}

/** Écart entre deux dates exprimé dans l'unité du projet (arrondi à 0,01). */
export function gapInUnit(
  from: ISODate,
  to: ISODate,
  unit: TimeUnit,
  calendar: ProjectView["aggregate"]["calendar"],
): { value: number; days: number } {
  const days = workingDayDistance(from, to, calendar);
  if (unit === "mois") return { value: monthsBetween(from, to), days };
  if (unit === "semaines") return { value: Math.round((days / 5) * 100) / 100, days };
  if (unit === "heures") return { value: Math.round(days * calendar.hoursPerDay * 100) / 100, days };
  return { value: days, days };
}

export function formatGap(value: number | null, unitLabel: string): string {
  if (value == null) return "—";
  if (value === 0) return `0 ${unitLabel}`;
  const abs = Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return `${value > 0 ? "+" : "−"}${abs} ${unitLabel}`;
}

export function computeDelayBanner(view: ProjectView): DelayBanner {
  const project = view.aggregate.project;
  const unit: TimeUnit = project.timeUnit ?? "jours";
  const baselines = [...view.aggregate.baselines].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const active = view.activeBaseline ?? baselines.find((b) => b.isActive) ?? null;
  // Fi : le tout premier planning figé (PI = B2P0) ; à défaut la fin contractuelle.
  const finInitiale = baselineFinish(baselines[0]) ?? project.targetFinishDate ?? null;
  // PàD : le planning de référence à date (variante active).
  const finADate = baselineFinish(active) ?? finInitiale;
  const dateActuelle = view.schedule.statusDate ?? todayIso();
  const finPrevisionnelle = view.schedule.projectFinishDate ?? null;
  const gap =
    finADate && finPrevisionnelle ? gapInUnit(finADate, finPrevisionnelle, unit, view.aggregate.calendar) : null;
  return {
    finInitiale,
    finADate,
    dateActuelle,
    finPrevisionnelle,
    ecart: gap ? gap.value : null,
    ecartJours: gap ? gap.days : null,
    unit,
    unitLabel: timeUnitShortLabel(unit),
    avancement: Math.round(view.metrics.overallProgress ?? 0),
    actionRequise: Boolean(gap && gap.days > 0),
    hasPI: Boolean(active),
  };
}
