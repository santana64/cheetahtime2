import type { ISODate } from "@/types/planning";
import { parseIsoDate } from "@/lib/planning/date-utils";

export function formatDateLabel(date?: ISODate | null) {
  if (!date) {
    return "Non planifié";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
  }).format(parseIsoDate(date));
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
