import { formatGap } from "@/lib/fgf/delay-banner";
import { aggregateT2P, getT2PEcartReference, getT2PLabel, sortT2PTables, t2pUnitLabel } from "@/lib/fgf/t2p";
import { formatDateLabel } from "@/lib/format/formatters";
import type { ProjectView, RapportDelai, RapportDelaiSection, T2PTable } from "@/types/planning";

/**
 * Rapports de délai (R2Pi) — transposition délai, à l'identique, des rapports
 * de coût de Cheetah Cost (src/lib/rapports.ts) : même sigle R2Pi, mêmes
 * cinq sections (Généralités · Événements marquants · Situation à Date –
 * Prévision à Terminaison (pré-remplie) · Options de Pilotage ·
 * Réorientation), mêmes statuts brouillon / diffusé, un rapport par B2P
 * rattaché à son tableau représentatif (T2Pi-2 retenu, sinon T2Pi-1, sinon B2P0).
 */

export function getRapportDelaiLabel(numero: number): string {
  return `R2P${Number(numero) || 0}`;
}

export function getRapportStatutLabel(statut: RapportDelai["statut"]): string {
  return statut === "diffuse" ? "Diffusé" : "Brouillon";
}

function newId() {
  return `sec_${Math.random().toString(36).slice(2, 10)}`;
}

/** Tableau représentatif d'un B2P : prévision corrigée retenue, sinon initiale, sinon B2P0 (comme Cost). */
export function getRepresentativeTables(tables: T2PTable[]): T2PTable[] {
  const rank = (k: T2PTable["tableKind"]) => (k === "i-2" ? 3 : k === "i-1" ? 2 : k === "b2p0" ? 1 : 0);
  const byNumero = new Map<number, T2PTable>();
  for (const t of sortT2PTables(tables)) {
    const cur = byNumero.get(t.numero);
    if (!cur || rank(t.tableKind) > rank(cur.tableKind)) byNumero.set(t.numero, t);
  }
  return [...byNumero.values()].filter((t) => rank(t.tableKind) > 0).sort((a, b) => a.numero - b.numero);
}

/**
 * §3 « Situation à Date – Prévision à Terminaison », pré-remplie depuis le
 * tableau (comme buildSyntheseCout) : avancement, reste à faire, Fi, PàD, FP,
 * Écart, Dérive et nécessité de pilotage — en dates et dans l'unité du projet.
 */
export function buildSyntheseDelai(view: ProjectView, table: T2PTable): string {
  const calendar = view.aggregate.calendar;
  const tables = view.aggregate.project.t2pTables ?? [];
  const unit = t2pUnitLabel(table.unit);
  const isBaseline = table.tableKind === "b2p0";
  const a = aggregateT2P(table, calendar);
  const ref = getT2PEcartReference(tables, table);
  const prev = ref && ref.tableKind !== "b2p0" ? aggregateT2P(ref, calendar).ecart : 0;
  const ecart = isBaseline ? 0 : a.ecart;
  const derive = isBaseline ? 0 : Math.round((ecart - prev) * 100) / 100;
  const raf = table.lignes.reduce((m, l) => Math.max(m, l.resteAFaire), 0);
  const commences = table.lignes.filter((l) => l.avancement > 0 && l.avancement < 100).length;
  const finis = table.lignes.filter((l) => l.avancement >= 100).length;
  const enRetard = table.lignes.filter((l) => l.finPrevue && l.finADate && l.finPrevue > l.finADate);
  const pilotage = isBaseline
    ? "Référence du projet (B2P0) : pas de pilotage à ce stade."
    : ecart > 0
      ? `Prévision défavorable (écart ${formatGap(ecart, unit)}) : pilotage à envisager — voir §4 et §5.`
      : "Prévision maîtrisée : pilotage non requis à ce stade.";

  return [
    `Bilan : ${getT2PLabel(table)} — ${formatDateLabel(table.date)}`,
    "",
    "3.1 Situation à Date",
    `  Date d'état : ${formatDateLabel(table.date)}`,
    `  Avancement physique du projet : ${a.avancement} %`,
    `  Lots commencés : ${commences} · lots terminés : ${finis} · sur ${table.lignes.length}`,
    "",
    "3.2 Reste à Faire",
    `  Durée du Reste à Faire (chemin le plus long) : ${raf.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${unit}`,
    "",
    "3.3 Prévisions à Terminaison",
    `  Fin Initiale (Fi) : ${formatDateLabel(a.finInitiale)}`,
    `  Fin à Date (PàD) : ${formatDateLabel(a.finADate)}`,
    `  Fin Prévisionnelle (FP) : ${formatDateLabel(a.finPrevue)}`,
    `  Écart (É = FP − PàD) : ${formatGap(ecart, unit)}`,
    `  Dérive (D = É − Éprec) : ${formatGap(derive, unit)}`,
    enRetard.length ? `  Lots en retard : ${enRetard.map((l) => `${l.code} ${l.libelle}`).join(", ")}` : "  Lots en retard : aucun",
    "",
    "3.4 Nécessité de Pilotage",
    `  ${pilotage}`,
  ].join("\n");
}

/** Sections par défaut — mêmes titres que le R2P-Coût officiel, contenu transposé en délai. */
export function buildDefaultSectionsDelai(view: ProjectView, table: T2PTable): RapportDelaiSection[] {
  const project = view.aggregate.project;
  const generalites = [
    "1.1 Objectifs du présent document",
    "Le présent document a pour objet de présenter la date de fin prévisionnelle du projet, à Date, et si cette prévision est jugée mauvaise, de présenter les différentes options d'amélioration, de les comparer et d'indiquer les décisions de pilotage prises.",
    "",
    "1.2 Abréviations",
    "Fi : Fin Initiale · PàD : Planning à Date (Fin à Date) · FP : Fin Prévisionnelle · É : Écart · D : Dérive · LT : Lot de Tâches · PT : Provision de Temps · B2P : Bilan de Pilotage de Projet · T2P : Tableau de Pilotage de Projet.",
    "",
    "1.3 Documents de référence",
    `- ${project.name} — Plan de projet (PDP) Réf. … du …`,
    `- ${project.name} — Phase de ${project.phase ?? "…"} — R2P précédent Réf. … du …`,
  ].join("\n");
  const options = [
    "À compléter uniquement en cas de nécessité de pilotage (cf. §3.4).",
    "",
    "4.1 Option 1 / [Nom]",
    "  Description : …",
    "  Sources d'amélioration (LT ajoutés / supprimés / modifiés, liens, intensités) : …",
    "  Prévision à Terminaison : …",
    "  Risques : …",
    "",
    "4.2 Option 2 / [Nom]  (idem)",
    "",
    "4.3 Option 3 / [Nom]  (idem)",
  ].join("\n");
  const reorientation = [
    "5.1 Comparaison des options : …",
    "",
    "5.2 Solution proposée",
    "  Description : …",
    "  Points forts / Points faibles : …",
    "  Prévision à Terminaison : …",
    "  Risques : …",
    "",
    "5.3 Décision de Pilotage",
    "  Décideur / Date de décision : …",
    "  LT concernés : …",
    "  Acteurs concernés : …",
  ].join("\n");
  return [
    { id: newId(), titre: "1. Généralités", contenu: generalites },
    { id: newId(), titre: "2. Événements marquants depuis le précédent B2P", contenu: "" },
    { id: newId(), titre: "3. Situation à Date – Prévision à Terminaison", contenu: buildSyntheseDelai(view, table), auto: true },
    { id: newId(), titre: "4. Options de Pilotage", contenu: options },
    { id: newId(), titre: "5. Réorientation du projet", contenu: reorientation },
  ];
}

export function getModeleSectionTitres(): string[] {
  return [
    "1. Généralités",
    "2. Événements marquants depuis le précédent B2P",
    "3. Situation à Date – Prévision à Terminaison",
    "4. Options de Pilotage",
    "5. Réorientation du projet",
  ];
}

export function sortRapportsDelai(rapports: RapportDelai[]): RapportDelai[] {
  return [...rapports].sort((a, b) => a.numero - b.numero || String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
