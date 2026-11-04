/**
 * Pont d'interopérabilité de la suite Cheetah — « un projet, deux lentilles ».
 *
 * Lit et produit le format projet partagé `.cheetahcost.json` afin qu'un même
 * projet circule entre la coûtenance (Cheetah Cost) et la planification
 * (Cheetah Time) : même identité, mêmes Lots, **mêmes dates de B2P**.
 *
 * Volontairement découplé des types internes de Cheetah Cost (mapping souple).
 */

import { projetPhases, type ProjetPhase } from "@/types/planning";

export const SUITE_FILE_SCHEMA_VERSION = "1.0.0";

export interface SuiteLot {
  name: string;
  budgetAmount: number;
}

export interface SuiteProjectData {
  name: string;
  phase: ProjetPhase | null;
  dateDebut: string;
  dateFin: string | null;
  currency: string;
  lots: SuiteLot[];
  b2pDates: string[];
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function coercePhase(value: unknown): ProjetPhase | null {
  return (projetPhases as readonly string[]).includes(value as string)
    ? (value as ProjetPhase)
    : null;
}

/** Parse un fichier projet de la suite (.cheetahcost.json) ou un projet brut. */
export function parseSuiteProject(text: string): SuiteProjectData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Fichier JSON illisible.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Fichier projet invalide.");
  }

  const record = parsed as Record<string, unknown>;
  const project = (
    record.app && record.project ? record.project : record
  ) as Record<string, unknown>;

  const name = String(project.nom ?? project.name ?? "").trim();
  if (!name) throw new Error("Le projet importé n'a pas de nom.");

  const dateDebut = isIsoDate(project.dateDebut) ? project.dateDebut : "";
  if (!dateDebut) throw new Error("Date de début manquante ou invalide.");
  const dateFin = isIsoDate(project.dateFin) ? project.dateFin : null;

  const rawLots = Array.isArray(project.lots) ? project.lots : [];
  const lots: SuiteLot[] = rawLots.map((lot) => {
    const l = (lot ?? {}) as Record<string, unknown>;
    return {
      name: String(l.libelle ?? l.name ?? "Lot").trim() || "Lot",
      budgetAmount: Number(l.budgetInitial ?? l.budgetAmount ?? 0) || 0,
    };
  });

  const b2pDates = Array.isArray(project.b2pDates)
    ? project.b2pDates.filter(isIsoDate)
    : [];

  return {
    name,
    phase: coercePhase(project.phase),
    dateDebut,
    dateFin,
    currency: String(project.monnaie ?? project.currency ?? "EUR").trim() || "EUR",
    lots,
    b2pDates,
  };
}

/** Construit un fichier projet partagé (lisible par Cheetah Cost). */
export function buildSuiteProjectFile(
  data: SuiteProjectData & { id?: string; code?: string },
) {
  const now = new Date().toISOString();
  const lots = data.lots.map((lot, i) => ({
    id: `lt-${i + 1}`,
    code: `LT${String(i + 1).padStart(2, "0")}`,
    libelle: lot.name,
    budgetInitial: lot.budgetAmount,
  }));

  return {
    app: "CheetahCost" as const,
    schemaVersion: SUITE_FILE_SCHEMA_VERSION,
    exportedAt: now,
    sourceModule: "CheetahTime",
    project: {
      id: data.id ?? `suite-${Date.now()}`,
      nom: data.name,
      phase: data.phase ?? "Réalisation",
      dateDebut: data.dateDebut,
      dateFin: data.dateFin ?? data.dateDebut,
      monnaie: data.currency,
      typeCout: "encouru",
      status: "En cours",
      uniteCoutType: "monetaire",
      uniteCoutLibelle: data.currency,
      tvaMode: "HT",
      valeurMode: "courante",
      b2pDates: data.b2pDates,
      nbB2P: Math.max(0, data.b2pDates.length - 1),
      lots,
      bilans: [],
      createdAt: now,
      updatedAt: now,
    },
  };
}
