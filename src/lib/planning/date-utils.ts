import type { CalendarException, ISODate } from "@/types/planning";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface WorkingCalendarLike {
  workingDays: number[];
  hoursPerDay: number;
  exceptions: CalendarException[];
}

export function parseIsoDate(date: ISODate): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatIsoDate(date: Date): ISODate {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(date: ISODate, amount: number): ISODate {
  const shifted = new Date(parseIsoDate(date).getTime() + amount * DAY_IN_MS);
  return formatIsoDate(shifted);
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

  return left.localeCompare(right);
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
  const day = parseIsoDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isWorkingDay(date: ISODate, calendar: WorkingCalendarLike) {
  const exception = calendar.exceptions.find((entry) => entry.date === date);
  if (exception) {
    return exception.isWorkingDay;
  }

  return calendar.workingDays.includes(getWeekday(date));
}

export function normalizeWorkingDate(
  date: ISODate,
  calendar: WorkingCalendarLike,
  direction: 1 | -1 = 1,
) {
  let cursor = date;

  while (!isWorkingDay(cursor, calendar)) {
    cursor = addCalendarDays(cursor, direction);
  }

  return cursor;
}

export function addWorkingDays(
  date: ISODate,
  amount: number,
  calendar: WorkingCalendarLike,
) {
  let cursor = normalizeWorkingDate(date, calendar, amount >= 0 ? 1 : -1);

  if (amount === 0) {
    return cursor;
  }

  let remaining = Math.abs(amount);

  while (remaining > 0) {
    cursor = addCalendarDays(cursor, amount > 0 ? 1 : -1);
    if (isWorkingDay(cursor, calendar)) {
      remaining -= 1;
    }
  }

  return cursor;
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
  const start = normalizeWorkingDate(startDate, calendar, compareIsoDates(startDate, endDate) <= 0 ? 1 : -1);
  const end = normalizeWorkingDate(endDate, calendar, compareIsoDates(startDate, endDate) <= 0 ? 1 : -1);

  if (start === end) {
    return 0;
  }

  const direction: 1 | -1 = compareIsoDates(start, end) < 0 ? 1 : -1;
  let cursor = start;
  let distance = 0;

  while (cursor !== end) {
    cursor = addWorkingDays(cursor, direction, calendar);
    distance += direction;
  }

  return distance;
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
