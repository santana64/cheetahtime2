import type { ISODate } from "@/types/planning";
import { parseIsoDate } from "@/lib/planning/date-utils";

/**
 * Format de date UNIQUE de l'application, identique à Cheetah Cost
 * (`formatDateFR`) : « 08/06/2026 ».
 */
export function formatDateLabel(date?: ISODate | null) {
  if (!date) {
    return "—";
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return String(date);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatLongDate(date?: ISODate | null) {
  if (!date) {
    return "Non planifié";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parseIsoDate(date));
}

export function formatCurrency(amount: number, currencyCode = "EUR") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(value: number) {
  return `${Math.round(value)} %`;
}
