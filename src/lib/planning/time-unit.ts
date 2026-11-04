import type { TimeUnit } from "@/types/planning";

/**
 * Conversion d'unités de temps — heures / jours / mois.
 *
 * Décision d'architecture : le moteur de planification calcule TOUJOURS en
 * jours ouvrés (`durationDays`). L'unité choisie à la création du projet est
 * une lentille de saisie et d'affichage. La conversion est centralisée ici
 * pour rester strictement symétrique.
 *
 * Conventions (standard français) :
 *  - 1 jour ouvré = `hoursPerDay` heures (7 h par défaut, calendrier français) ;
 *  - 1 semaine = 5 jours ouvrés (lun→ven) ;
 *  - 1 mois ≈ 21,67 jours ouvrés (260 jours ouvrés / 12).
 */

export const WEEK_WORKING_DAYS = 5;
export const MONTH_WORKING_DAYS = 21.67;
export const DEFAULT_HOURS_PER_DAY = 7;

export function toWorkingDays(
  value: number,
  unit: TimeUnit,
  hoursPerDay = DEFAULT_HOURS_PER_DAY,
): number {
  const v = Number(value) || 0;
  if (v <= 0) return 0;
  if (unit === "heures") return Math.max(1, Math.ceil(v / Math.max(hoursPerDay, 1)));
  if (unit === "semaines") return Math.max(1, Math.round(v * WEEK_WORKING_DAYS));
  if (unit === "mois") return Math.max(1, Math.round(v * MONTH_WORKING_DAYS));
  return Math.max(1, Math.round(v));
}

/**
 * Conversion signée pour les délais sur lien (lag) : positif OU négatif,
 * 0 si non saisi — sans le plancher d'1 jour des durées.
 */
export function toSignedWorkingDays(
  value: number,
  unit: TimeUnit,
  hoursPerDay = DEFAULT_HOURS_PER_DAY,
): number {
  const v = Number(value) || 0;
  if (v === 0) return 0;
  if (unit === "heures") return Math.round(v / Math.max(hoursPerDay, 1));
  if (unit === "semaines") return Math.round(v * WEEK_WORKING_DAYS);
  if (unit === "mois") return Math.round(v * MONTH_WORKING_DAYS);
  return Math.round(v);
}

export function fromWorkingDays(
  days: number,
  unit: TimeUnit,
  hoursPerDay = DEFAULT_HOURS_PER_DAY,
): number {
  const d = Number(days) || 0;
  if (unit === "heures") return Math.round(d * hoursPerDay * 100) / 100;
  if (unit === "semaines") return Math.round((d / WEEK_WORKING_DAYS) * 100) / 100;
  if (unit === "mois") return Math.round((d / MONTH_WORKING_DAYS) * 100) / 100;
  return d;
}

export function timeUnitShortLabel(unit: TimeUnit | null | undefined): string {
  if (unit === "heures") return "h";
  if (unit === "semaines") return "sem.";
  if (unit === "mois") return "mois";
  return "j";
}
