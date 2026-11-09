/**
 * Génération des dates de B2P — méthode FGF.
 *
 * PORTAGE STRICT de la règle de CheetahCost (`src/lib/b2p.ts`). Les dates de B2P
 * sont des points d'étape communs aux deux modules de la suite : elles DOIVENT
 * être rigoureusement identiques côté CheetahTime et côté CheetahCost pour un
 * même couple (date de début, date de fin). Toute modification ici doit être
 * répliquée à l'identique dans CheetahCost.
 *
 * Arithmétique en UTC (midi) pour neutraliser les fuseaux/DST, comme l'original.
 */

export type B2PCadenceRule = {
  kind: "hour" | "day" | "week" | "month" | "year";
  step: number;
  label: string;
  explanation: string;
};

// ── Helpers de date (UTC, midi) ─────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function parseISODateUTC(value: string): Date | null {
  if (!isValidISODate(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

function toISODateUTC(year: number, month1: number, day: number): string {
  return `${year}-${pad2(month1)}-${pad2(day)}`;
}

function compareISODate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function addHoursUTC(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
function addDaysUTC(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
function addWeeksUTC(date: Date, weeks: number): Date {
  return addDaysUTC(date, weeks * 7);
}
function addMonthsUTC(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate(), 12, 0, 0, 0));
}
function addYearsUTC(date: Date, years: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));
}
function nextMondayAfterUTC(date: Date): Date {
  const day = date.getUTCDay();
  let delta = (8 - day) % 7;
  if (delta === 0) delta = 7;
  return addDaysUTC(date, delta);
}
function firstDayOfNextMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 12, 0, 0, 0));
}
function firstDayOfNextYearUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1, 12, 0, 0, 0));
}
function diffDaysUTC(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
}

// ── Règle de cadence selon la durée du projet ───────────────────────────────

export function getB2PCadenceRule(dateDebut: string, dateFin: string): B2PCadenceRule | null {
  const start = parseISODateUTC(dateDebut);
  const end = parseISODateUTC(dateFin);
  if (!start || !end || end.getTime() < start.getTime()) return null;

  const days = diffDaysUTC(start, end);

  if (days < 1.5) return { kind: "hour", step: 1, label: "Toutes les 1 heure", explanation: "Projet < 1,5 jour." };
  if (days < 3) return { kind: "hour", step: 2, label: "Toutes les 2 heures", explanation: "Projet entre 1,5 et 3 jours." };
  if (days < 6) return { kind: "hour", step: 12, label: "Toutes les 1/2 journées", explanation: "Projet entre 3 et 6 jours." };
  if (days < 12) return { kind: "day", step: 1, label: "Tous les jours", explanation: "Projet entre 6 et 12 jours." };
  if (days < 21) return { kind: "day", step: 2, label: "Tous les 2 jours", explanation: "Projet entre 12 et 21 jours." };
  if (days < 42) return { kind: "day", step: 3, label: "Tous les 3 jours", explanation: "Projet entre 21 et 42 jours." };
  if (days < 92) return { kind: "week", step: 1, label: "Toutes les semaines", explanation: "Projet entre 42 jours et 3 mois." };
  if (days < 183) return { kind: "week", step: 2, label: "Toutes les 2 semaines", explanation: "Projet entre 3 et 6 mois." };
  if (days < 366) return { kind: "month", step: 1, label: "Tous les mois", explanation: "Projet entre 6 mois et 1 an." };
  if (days < 731) return { kind: "month", step: 2, label: "Tous les 2 mois", explanation: "Projet entre 1 et 2 ans." };
  if (days < 1096) return { kind: "month", step: 3, label: "Tous les 3 mois", explanation: "Projet entre 2 et 3 ans." };
  if (days < 1461) return { kind: "month", step: 4, label: "Tous les 4 mois", explanation: "Projet entre 3 et 4 ans." };
  if (days < 2192) return { kind: "month", step: 6, label: "Tous les 6 mois", explanation: "Projet entre 4 et 6 ans." };
  return { kind: "year", step: 1, label: "Tous les ans", explanation: "Projet entre 6 et 12 ans." };
}

function uniqueSortedDates(dates: string[]): string[] {
  return Array.from(new Set(dates.filter(isValidISODate))).sort(compareISODate);
}

/**
 * Dates de B2P recommandées par la règle FGF. La première est la date de début
 * (B2P0 / lancement) ; la dernière est la date de fin. Identique à CheetahCost.
 */
export function buildRecommendedB2PDates(project: { dateDebut: string; dateFin: string }): string[] {
  const start = parseISODateUTC(project.dateDebut);
  const end = parseISODateUTC(project.dateFin);
  const rule = getB2PCadenceRule(project.dateDebut, project.dateFin);
  if (!start || !end || !rule || end.getTime() < start.getTime()) return [];

  const dates: string[] = [toISODateUTC(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate())];

  const pushIfInRange = (date: Date) => {
    if (date.getTime() <= start.getTime()) return;
    if (date.getTime() > end.getTime()) return;
    dates.push(toISODateUTC(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
  };

  if (rule.kind === "hour") {
    let cursor = addHoursUTC(start, rule.step);
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard < 2000) {
      pushIfInRange(cursor);
      cursor = addHoursUTC(cursor, rule.step);
      guard += 1;
    }
  }
  if (rule.kind === "day") {
    let cursor = addDaysUTC(start, rule.step);
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard < 2000) {
      pushIfInRange(cursor);
      cursor = addDaysUTC(cursor, rule.step);
      guard += 1;
    }
  }
  if (rule.kind === "week") {
    const base = addWeeksUTC(start, Math.max(0, rule.step - 1));
    let cursor = nextMondayAfterUTC(base);
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard < 500) {
      pushIfInRange(cursor);
      cursor = addWeeksUTC(cursor, rule.step);
      guard += 1;
    }
  }
  if (rule.kind === "month") {
    const base = addMonthsUTC(start, Math.max(0, rule.step - 1));
    let cursor = firstDayOfNextMonthUTC(base);
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard < 240) {
      pushIfInRange(cursor);
      cursor = addMonthsUTC(cursor, rule.step);
      guard += 1;
    }
  }
  if (rule.kind === "year") {
    const base = addYearsUTC(start, Math.max(0, rule.step - 1));
    let cursor = firstDayOfNextYearUTC(base);
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard < 50) {
      pushIfInRange(cursor);
      cursor = addYearsUTC(cursor, rule.step);
      guard += 1;
    }
  }

  pushIfInRange(end);
  return uniqueSortedDates(dates);
}

/** Avertissements d'écart à la règle FGF (dates saisies vs recommandées). */
export function getB2PPlanWarnings(
  project: { dateDebut: string; dateFin: string },
  plannedDates: string[],
): string[] {
  const recommended = buildRecommendedB2PDates(project);
  const warnings: string[] = [];
  if (!recommended.length) {
    warnings.push("Les dates du projet ne permettent pas de calculer la règle FGF.");
    return warnings;
  }
  if (plannedDates.length !== recommended.length) {
    warnings.push(`La règle FGF recommande ${Math.max(0, recommended.length - 1)} B2P + B2P0.`);
  }
  plannedDates.forEach((date, index) => {
    if (recommended[index] && date !== recommended[index]) {
      warnings.push(`B2P${index} : date saisie ${date}, recommandée ${recommended[index]}.`);
    }
  });
  return warnings;
}

/**
 * Dates de B2P d'un projet — SOURCE UNIQUE de Cheetah Time, identique à
 * `getProjectPlannedB2PDates` de Cheetah Cost : les dates saisies (ou reçues
 * par le fichier commun) priment ; sinon la règle FGF sur la durée réelle
 * du projet (la plus tardive entre fin contractuelle et fin calculée).
 */
export function getProjectB2PDates(
  project: { targetStartDate: string; targetFinishDate?: string | null; b2pDates?: string[] | null },
  computedFinishDate?: string | null,
): string[] {
  const stored = uniqueSortedDates((project.b2pDates ?? []).filter(isValidISODate));
  if (stored.length) return stored;
  const dateFin =
    [project.targetFinishDate ?? null, computedFinishDate ?? null]
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;
  return dateFin ? buildRecommendedB2PDates({ dateDebut: project.targetStartDate, dateFin }) : [];
}
