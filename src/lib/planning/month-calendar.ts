import { addCalendarDays, normalizeWorkingDate, parseIsoDate, type WorkingCalendarLike } from "@/lib/planning/date-utils";
import type { ISODate } from "@/types/planning";

/**
 * Arithmétique en MOIS CALENDAIRES (projets dont l'unité est « mois »).
 *
 * Avant : 1 mois = 21,67 jours ouvrés → une tâche de 3 mois démarrant le
 * 1er avril finissait le 29 ou le 30 juin selon les fériés, et l'inauguration
 * du cas sportif tombait le 30 septembre au lieu du 1er octobre.
 * Désormais : 3 mois à partir du 1er avril = jusqu'au 30 juin, quel que soit
 * le nombre de jours ouvrés du trimestre. Les fractions de mois sont
 * proportionnelles au nombre de jours du mois concerné.
 */

export const MONTH_WORKING_DAYS_APPROX = 21.67;

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Ajoute (ou retire) un nombre de mois, éventuellement fractionnaire. */
export function addMonthsIso(date: ISODate, months: number): ISODate {
  if (!months) return date;
  const d = parseIsoDate(date);
  const whole = months >= 0 ? Math.floor(months) : Math.ceil(months);
  const fraction = months - whole;
  const targetMonth = d.getUTCMonth() + whole;
  const year = d.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const day = Math.min(d.getUTCDate(), daysInMonth(year, month));
  let result = new Date(Date.UTC(year, month, day, 12)).toISOString().slice(0, 10);
  if (fraction) {
    const ref = parseIsoDate(result);
    const dim = daysInMonth(ref.getUTCFullYear(), ref.getUTCMonth());
    result = addCalendarDays(result, Math.round(fraction * dim));
  }
  return result;
}

/** Mois (fractionnaires) entre deux dates : 1er juillet → 1er septembre = 2. */
export function monthsBetween(from: ISODate, to: ISODate): number {
  if (from === to) return 0;
  const sign = from < to ? 1 : -1;
  const [a, b] = sign > 0 ? [from, to] : [to, from];
  const da = parseIsoDate(a);
  const db = parseIsoDate(b);
  let whole = (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth());
  let anchor = addMonthsIso(a, whole);
  if (anchor > b) {
    whole -= 1;
    anchor = addMonthsIso(a, whole);
  }
  const next = addMonthsIso(a, whole + 1);
  const span = Math.max(1, Math.round((parseIsoDate(next).getTime() - parseIsoDate(anchor).getTime()) / 86_400_000));
  const rest = Math.round((parseIsoDate(b).getTime() - parseIsoDate(anchor).getTime()) / 86_400_000);
  return sign * Math.round((whole + rest / span) * 100) / 100;
}

/**
 * Valeur en mois d'une durée stockée en jours ouvrés (données antérieures au
 * champ `durationUnits`) : arrondie au quart de mois si elle en est proche.
 */
export function inferMonths(days: number): number {
  const raw = days / MONTH_WORKING_DAYS_APPROX;
  const quarter = Math.round(raw * 4) / 4;
  return Math.abs(raw - quarter) <= 0.06 ? quarter : Math.round(raw * 100) / 100;
}

/** Fin d'une tâche de `months` mois commençant le `start` (inclus). */
export function monthFinish(start: ISODate, months: number, calendar: WorkingCalendarLike): ISODate {
  if (months <= 0) return normalizeWorkingDate(start, calendar);
  const end = addCalendarDays(addMonthsIso(start, months), -1);
  const normalized = normalizeWorkingDate(end, calendar, -1);
  return normalized < start ? normalizeWorkingDate(start, calendar) : normalized;
}

/** Début d'une tâche de `months` mois finissant le `finish` (inclus). */
export function monthStart(finish: ISODate, months: number, calendar: WorkingCalendarLike): ISODate {
  if (months <= 0) return normalizeWorkingDate(finish, calendar, -1);
  const start = addMonthsIso(addCalendarDays(finish, 1), -months);
  const normalized = normalizeWorkingDate(start, calendar, 1);
  return normalized > finish ? normalizeWorkingDate(finish, calendar, -1) : normalized;
}

/** Lendemain (calendaire) d'une fin, décalé de `lag` mois, ramené au jour ouvré suivant. */
export function monthAfter(finish: ISODate, lag: number, calendar: WorkingCalendarLike): ISODate {
  return normalizeWorkingDate(addMonthsIso(addCalendarDays(finish, 1), lag), calendar, 1);
}

/** Date décalée de `lag` mois, ramenée au jour ouvré (sens `direction`). */
export function monthShift(date: ISODate, lag: number, calendar: WorkingCalendarLike, direction: 1 | -1 = 1): ISODate {
  return normalizeWorkingDate(addMonthsIso(date, lag), calendar, direction);
}

/** Fin décalée de `lag` mois (FF/SF) : J+lag mois, veille ouvrée. */
export function monthFinishShift(finish: ISODate, lag: number, calendar: WorkingCalendarLike): ISODate {
  if (!lag) return normalizeWorkingDate(finish, calendar, -1);
  return normalizeWorkingDate(addCalendarDays(addMonthsIso(addCalendarDays(finish, 1), lag), -1), calendar, -1);
}
