import type { ISODate } from "@/types/planning";
import { parseIsoDate } from "@/lib/planning/date-utils";

/**
 * Format de date UNIQUE de l'application : « 08 juin 26 » (jour, mois, année).
 * L'année est toujours affichée : un projet de 18 mois couvre deux années.
 */
export function formatDateLabel(date?: ISODate | null) {
  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
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
