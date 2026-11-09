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

/**
 * Cheetah Cost est la référence : Cheetah Time écrit EXACTEMENT son format
 * (`PROJECT_FILE_SCHEMA_VERSION = "1.0.0"`, type `Projet`). Le bloc
 * `project.lentilleDelai` est une extension propre à Cheetah Time : Cheetah
 * Cost l'ignore sans erreur, Cheetah Time le relit pour l'aller-retour.
 */
export const SUITE_FILE_SCHEMA_VERSION = "1.0.0";

/** Situation délai à une date de B2P (« Prévision avant pilotage T2Pi-1 »). */
export interface SuiteDelaiB2P {
  date: string;
  indexB2P: number | null;
  finADate: string | null;
  finPrevisionnelle: string | null;
  /** Écart FP − PàD dans l'unité du projet (> 0 = retard). */
  ecart: number | null;
  avancement: number;
  actionPilotageRequise: boolean;
}

/** Retard délai d'un lot (même ordre et même libellé que `project.lots`). */
export interface SuiteDelaiLot {
  code: string;
  libelle: string;
  finPrevue: string | null;
  /** Glissement de fin vs Planning Initial, dans l'unité du projet. */
  glissement: number;
  glissementJours: number;
  avancement: number;
}

export interface SuiteLentilleDelai {
  module: "CheetahTime";
  uniteTemps: string;
  dateEtat: string | null;
  finInitiale: string | null;
  finADate: string | null;
  finPrevisionnelle: string | null;
  ecart: number | null;
  ecartJours: number | null;
  avancement: number;
  actionPilotageRequise: boolean;
  piFige: boolean;
  parB2P: SuiteDelaiB2P[];
  lots: SuiteDelaiLot[];
}

export interface SuiteLot {
  name: string;
  budgetAmount: number;
  /** Code du lot (LT01, PT01…) — conservé tel quel dans Cheetah Cost. */
  code?: string;
}

export interface SuiteProjectData {
  name: string;
  phase: ProjetPhase | null;
  dateDebut: string;
  dateFin: string | null;
  currency: string;
  lots: SuiteLot[];
  b2pDates: string[];
  /** Présent dans les fichiers 1.1.0 produits par Cheetah Time. */
  lentilleDelai?: SuiteLentilleDelai | null;
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
      code: typeof l.code === "string" && l.code.trim() ? l.code.trim() : undefined,
    };
  });

  const b2pDates = Array.isArray(project.b2pDates)
    ? project.b2pDates.filter(isIsoDate)
    : [];

  return {
    lentilleDelai: parseLentilleDelai(project.lentilleDelai),
    name,
    phase: coercePhase(project.phase),
    dateDebut,
    dateFin,
    currency: String(project.monnaie ?? project.currency ?? "EUR").trim() || "EUR",
    lots,
    b2pDates,
  };
}

function num(value: unknown): number | null {
  const n = Number(value);
  return value == null || value === "" || !Number.isFinite(n) ? null : n;
}
function isoOrNull(value: unknown): string | null {
  return isIsoDate(value) ? value : null;
}

/** Lecture tolérante du bloc délai (absent ou partiel = ignoré proprement). */
export function parseLentilleDelai(raw: unknown): SuiteLentilleDelai | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const parB2P = (Array.isArray(r.parB2P) ? r.parB2P : [])
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .filter((x) => isIsoDate(x.date))
    .map((x) => ({
      date: x.date as string,
      indexB2P: num(x.indexB2P),
      finADate: isoOrNull(x.finADate),
      finPrevisionnelle: isoOrNull(x.finPrevisionnelle),
      ecart: num(x.ecart),
      avancement: num(x.avancement) ?? 0,
      actionPilotageRequise: Boolean(x.actionPilotageRequise),
    }));
  const lots = (Array.isArray(r.lots) ? r.lots : []).map((x) => {
    const l = (x ?? {}) as Record<string, unknown>;
    return {
      code: String(l.code ?? ""),
      libelle: String(l.libelle ?? ""),
      finPrevue: isoOrNull(l.finPrevue),
      glissement: num(l.glissement) ?? 0,
      glissementJours: num(l.glissementJours) ?? 0,
      avancement: num(l.avancement) ?? 0,
    };
  });
  return {
    module: "CheetahTime",
    uniteTemps: String(r.uniteTemps ?? "jours"),
    dateEtat: isoOrNull(r.dateEtat),
    finInitiale: isoOrNull(r.finInitiale),
    finADate: isoOrNull(r.finADate),
    finPrevisionnelle: isoOrNull(r.finPrevisionnelle),
    ecart: num(r.ecart),
    ecartJours: num(r.ecartJours),
    avancement: num(r.avancement) ?? 0,
    actionPilotageRequise: Boolean(r.actionPilotageRequise),
    piFige: Boolean(r.piFige),
    parB2P,
    lots,
  };
}

/** Construit un fichier projet partagé (lisible par Cheetah Cost). */
export function buildSuiteProjectFile(
  data: SuiteProjectData & { id?: string; code?: string },
) {
  const now = new Date().toISOString();
  const lots = data.lots.map((lot, i) => ({
    id: `lt-${i + 1}`,
    code: lot.code ?? `LT${String(i + 1).padStart(2, "0")}`,
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
      precision: 0,
      isDemo: false,
      lots,
      bilans: [],
      ...(data.lentilleDelai ? { lentilleDelai: data.lentilleDelai } : {}),
      createdAt: now,
      updatedAt: now,
    },
  };
}
