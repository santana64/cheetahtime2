import type { CalendarException, ISODate } from "@/types/planning";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface WorkingCalendarLike {
  workingDays: number[];
  hoursPerDay: number;
  exceptions: CalendarException[];
}

/* ── Arithmétique de dates en « numéros de jour » (jours depuis 1970-01-01) ──
   Le moteur appelait parseIsoDate des centaines de millions de fois sur un
   planning de 3 000 LT. Les conversions ISO ⇄ numéro de jour sont désormais
   mises en cache ; week-ends et exceptions se calculent sans Date. */
const dayNumberCache = new Map<string, number>();
const isoByDayNumber = new Map<number, string>();
const DAY_CACHE_LIMIT = 200_000;

function toDayNumber(date: ISODate): number {
  const cached = dayNumberCache.get(date);
  if (cached !== undefined) return cached;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const value = Math.round(Date.UTC(year, month - 1, day) / DAY_IN_MS);
  if (dayNumberCache.size > DAY_CACHE_LIMIT) dayNumberCache.clear();
  dayNumberCache.set(date, value);
  return value;
}

function fromDayNumber(value: number): ISODate {
  const cached = isoByDayNumber.get(value);
  if (cached !== undefined) return cached;
  const iso = new Date(value * DAY_IN_MS).toISOString().slice(0, 10);
  if (isoByDayNumber.size > DAY_CACHE_LIMIT) isoByDayNumber.clear();
  isoByDayNumber.set(value, iso);
  return iso;
}

/** Jour ISO 1 (lundi) … 7 (dimanche) à partir d'un numéro de jour. 1970-01-01 = jeudi. */
function weekdayOfDayNumber(value: number) {
  const dow = (((value + 4) % 7) + 7) % 7; // 0 = dimanche
  return dow === 0 ? 7 : dow;
}

interface CalendarIndex {
  workingSet: Set<number>;
  exceptions: Map<number, boolean>;
  sortedExceptions: { day: number; delta: number }[];
}
const calendarIndexCache = new WeakMap<WorkingCalendarLike, CalendarIndex>();

function indexCalendar(calendar: WorkingCalendarLike): CalendarIndex {
  const cached = calendarIndexCache.get(calendar);
  if (cached) return cached;
  const workingSet = new Set(calendar.workingDays);
  const exceptions = new Map<number, boolean>();
  for (const entry of calendar.exceptions ?? []) exceptions.set(toDayNumber(entry.date), entry.isWorkingDay);
  const sortedExceptions = [...exceptions.entries()]
    .map(([day, working]) => {
      const regular = workingSet.has(weekdayOfDayNumber(day));
      return { day, delta: working === regular ? 0 : working ? 1 : -1 };
    })
    .filter((e) => e.delta !== 0)
    .sort((a, b) => a.day - b.day);
  const index = { workingSet, exceptions, sortedExceptions };
  calendarIndexCache.set(calendar, index);
  return index;
}

function isWorkingDayNumber(value: number, index: CalendarIndex) {
  const exception = index.exceptions.get(value);
  if (exception !== undefined) return exception;
  return index.workingSet.has(weekdayOfDayNumber(value));
}

/** Nombre de jours ouvrés d dans ]a, b] (a < b). Arithmétique par semaines + exceptions. */
function countWorkingDaysBetween(a: number, b: number, index: CalendarIndex) {
  const span = b - a;
  const weeks = Math.floor(span / 7);
  let count = weeks * index.workingSet.size;
  for (let d = a + weeks * 7 + 1; d <= b; d++) {
    if (index.workingSet.has(weekdayOfDayNumber(d))) count++;
  }
  for (const e of index.sortedExceptions) {
    if (e.day > b) break;
    if (e.day > a) count += e.delta;
  }
  return count;
}

export function parseIsoDate(date: ISODate): Date {
  return new Date(toDayNumber(date) * DAY_IN_MS);
}

export function formatIsoDate(date: Date): ISODate {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(date: ISODate, amount: number): ISODate {
  return fromDayNumber(toDayNumber(date) + Math.round(amount));
}

export function compareIsoDates(
  left?: ISODate | null,
  right?: ISODate | null,
): number {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return -1;
  }

  if (!right) {
    return 1;
  }

  // Dates ISO AAAA-MM-JJ : l'ordre lexicographique est l'ordre chronologique.
  return left < right ? -1 : left > right ? 1 : 0;
}

export function minIsoDate(values: Array<ISODate | null | undefined>) {
  const filtered = values.filter(Boolean) as ISODate[];
  if (!filtered.length) {
    return null;
  }

  return filtered.reduce((best, value) =>
    compareIsoDates(value, best) < 0 ? value : best,
  );
}

export function maxIsoDate(values: Array<ISODate | null | undefined>) {
  const filtered = values.filter(Boolean) as ISODate[];
  if (!filtered.length) {
    return null;
  }

  return filtered.reduce((best, value) =>
    compareIsoDates(value, best) > 0 ? value : best,
  );
}

function getWeekday(date: ISODate) {
  return weekdayOfDayNumber(toDayNumber(date));
}

export function isWorkingDay(date: ISODate, calendar: WorkingCalendarLike) {
  return isWorkingDayNumber(toDayNumber(date), indexCalendar(calendar));
}

function hasAnyWorkingDay(index: CalendarIndex) {
  return index.workingSet.size > 0 || [...index.exceptions.values()].some(Boolean);
}

export function normalizeWorkingDate(
  date: ISODate,
  calendar: WorkingCalendarLike,
  direction: 1 | -1 = 1,
) {
  const index = indexCalendar(calendar);
  if (!hasAnyWorkingDay(index)) return date;
  let cursor = toDayNumber(date);
  let guard = 0;
  while (!isWorkingDayNumber(cursor, index) && guard < 3660) {
    cursor += direction;
    guard += 1;
  }
  return fromDayNumber(cursor);
}

export function addWorkingDays(
  date: ISODate,
  amount: number,
  calendar: WorkingCalendarLike,
) {
  const index = indexCalendar(calendar);
  const start = normalizeWorkingDate(date, calendar, amount >= 0 ? 1 : -1);
  if (amount === 0 || !hasAnyWorkingDay(index)) {
    return start;
  }

  const step = amount > 0 ? 1 : -1;
  let remaining = Math.abs(Math.round(amount));
  let cursor = toDayNumber(start);
  // Saut par semaines pleines quand il n'y a pas d'exception dans la zone.
  const perWeek = index.workingSet.size;
  if (perWeek > 0 && index.sortedExceptions.length === 0 && remaining > perWeek) {
    const weeks = Math.floor((remaining - 1) / perWeek);
    cursor += step * weeks * 7;
    remaining -= weeks * perWeek;
  }
  while (remaining > 0) {
    cursor += step;
    if (isWorkingDayNumber(cursor, index)) {
      remaining -= 1;
    }
  }

  return fromDayNumber(cursor);
}

export function durationToFinishDate(
  startDate: ISODate,
  durationDays: number,
  calendar: WorkingCalendarLike,
) {
  if (durationDays <= 0) {
    return normalizeWorkingDate(startDate, calendar);
  }

  return addWorkingDays(startDate, Math.max(durationDays - 1, 0), calendar);
}

export function finishToStartDate(
  finishDate: ISODate,
  durationDays: number,
  calendar: WorkingCalendarLike,
) {
  if (durationDays <= 0) {
    return normalizeWorkingDate(finishDate, calendar, -1);
  }

  return addWorkingDays(finishDate, -Math.max(durationDays - 1, 0), calendar);
}

export function workingDayDistance(
  startDate: ISODate,
  endDate: ISODate,
  calendar: WorkingCalendarLike,
) {
  const forward = compareIsoDates(startDate, endDate) <= 0;
  const start = normalizeWorkingDate(startDate, calendar, forward ? 1 : -1);
  const end = normalizeWorkingDate(endDate, calendar, forward ? 1 : -1);

  if (start === end) {
    return 0;
  }

  const index = indexCalendar(calendar);
  const a = toDayNumber(start);
  const b = toDayNumber(end);
  // Jours ouvrés dans ]a, b] — les deux bornes sont des jours ouvrés après normalisation.
  return a < b ? countWorkingDaysBetween(a, b, index) : -countWorkingDaysBetween(b, a, index);
}

export function countWorkingDaysInclusive(
  startDate?: ISODate | null,
  finishDate?: ISODate | null,
  calendar?: WorkingCalendarLike,
) {
  if (!startDate || !finishDate || !calendar) {
    return 0;
  }

  const normalizedStart = normalizeWorkingDate(startDate, calendar);
  const normalizedFinish = normalizeWorkingDate(finishDate, calendar, -1);

  if (compareIsoDates(normalizedStart, normalizedFinish) > 0) {
    return 0;
  }

  return workingDayDistance(normalizedStart, normalizedFinish, calendar) + 1;
}

export function getWeekStart(date: ISODate) {
  const weekday = getWeekday(date);
  return addCalendarDays(date, -(weekday - 1));
}

export function getWeekLabel(date: ISODate) {
  return formatIsoDate(parseIsoDate(getWeekStart(date))).slice(5);
}
