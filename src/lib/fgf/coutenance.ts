/**
 * Méthode FGF de Coûtenance — formules canoniques.
 *
 * SOURCE UNIQUE de la méthode FGF pour Cheetah Time. Ces formules suivent le
 * standard FGF de coûtenance (Budget à Date, Valeur Acquise, Coût Prévisionnel,
 * écart) afin de garantir un vocabulaire et des calculs cohérents dans tout
 * l'écosystème.
 *
 * Glossaire :
 *  - BàD : Budget à Date              = budgetInitial + variation
 *  - VA  : Valeur Acquise             = BàD × avancement%
 *  - CV  : Variance de coût           = Dépenses − VA
 *  - CP  : Coût Prévisionnel à terminaison = Dépenses + Reste à Faire
 *  - Écart final                      = CP − BàD
 */

export function computeBudgetADate(budgetInitial: number, variation: number): number {
  return Number(budgetInitial ?? 0) + Number(variation ?? 0);
}

export function computeValeurAcquise(budgetADate: number, avancement: number): number {
  const ratio = Math.max(0, Math.min(100, Number(avancement ?? 0))) / 100;
  return Number(budgetADate ?? 0) * ratio;
}

export function computeVarianceCout(depenses: number, valeurAcquise: number): number {
  return Number(depenses ?? 0) - Number(valeurAcquise ?? 0);
}

export function computeCoutPrevisionnelTerminaison(
  depenses: number,
  resteAFaire: number,
): number {
  return Number(depenses ?? 0) + Number(resteAFaire ?? 0);
}

export function computeEcartFinal(
  budgetADate: number,
  coutPrevisionnelTerminaison: number,
): number {
  return Number(coutPrevisionnelTerminaison ?? 0) - Number(budgetADate ?? 0);
}

export interface FgfLine {
  /** Budget de référence figé (baseline). */
  budgetInitial: number;
  /** Variation cumulée du budget vs référence. */
  variation: number;
  /** Budget à Date = budgetInitial + variation. */
  budgetADate: number;
  /** Dépenses réalisées / encourues. */
  depenses: number;
  /** Avancement physique en % (0–100). */
  avancementPhysique: number;
  /** Valeur Acquise = BàD × avancement. */
  valeurAcquise: number;
  /** Reste à Faire (coût restant estimé). */
  resteAFaire: number;
  /** Coût Prévisionnel à terminaison = Dépenses + RàF. */
  coutPrevisionnelTerminaison: number;
  /** Variance de coût = Dépenses − VA. */
  varianceCout: number;
  /** Écart final = CP − BàD (positif = dépassement). */
  ecartFinal: number;
  /** Écart relatif = écartFinal / BàD. */
  ecartSurBad: number;
}

/**
 * Construit une ligne FGF complète à partir des grandeurs de coût d'une tâche
 * Cheetah Time. Le Reste à Faire suit la convention coûtenance par défaut :
 * RàF = max(BàD − VA, 0) (estimation « budget restant à acquérir »), sauf si
 * un RàF explicite est fourni (prévision corrigée saisie).
 */
export function buildFgfLine(input: {
  budgetInitial: number;
  budgetADate: number;
  depenses: number;
  avancementPhysique: number;
  resteAFaire?: number | null;
}): FgfLine {
  const budgetInitial = Number(input.budgetInitial ?? 0);
  const budgetADate = Number(input.budgetADate ?? 0);
  const variation = budgetADate - budgetInitial;
  const depenses = Number(input.depenses ?? 0);
  const avancementPhysique = Number(input.avancementPhysique ?? 0);
  const valeurAcquise = computeValeurAcquise(budgetADate, avancementPhysique);

  const resteAFaire =
    input.resteAFaire != null
      ? Number(input.resteAFaire)
      : Math.max(budgetADate - valeurAcquise, 0);

  const coutPrevisionnelTerminaison = computeCoutPrevisionnelTerminaison(
    depenses,
    resteAFaire,
  );
  const varianceCout = computeVarianceCout(depenses, valeurAcquise);
  const ecartFinal = computeEcartFinal(budgetADate, coutPrevisionnelTerminaison);
  const ecartSurBad = budgetADate > 0 ? ecartFinal / budgetADate : 0;

  return {
    budgetInitial,
    variation,
    budgetADate,
    depenses,
    avancementPhysique,
    valeurAcquise,
    resteAFaire,
    coutPrevisionnelTerminaison,
    varianceCout,
    ecartFinal,
    ecartSurBad,
  };
}
