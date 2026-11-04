/**
 * Verdict « deux lentilles » — cœur de la lecture FGF que MS Project ne fait pas.
 *
 * À un instant (le B2P courant), le même projet est jugé simultanément sous la
 * lentille DÉLAI (indice de performance planning, SPI_t) et la lentille COÛT
 * (indice de performance coût, CPI, issu de la coûtenance FGF). On en tire un
 * niveau par lentille et un verdict combiné, en français métier.
 *
 * Logique pure (aucune dépendance UI) — testable et partagée avec Cheetah Cost.
 */

export type LensKey = "delai" | "cout";
export type LensLevel = "favorable" | "vigilance" | "tension" | "critique";

const RANK: Record<LensLevel, number> = {
  favorable: 0,
  vigilance: 1,
  tension: 2,
  critique: 3,
};

const LEVEL_LABEL: Record<LensLevel, string> = {
  favorable: "Maîtrisé",
  vigilance: "À surveiller",
  tension: "Sous tension",
  critique: "Critique",
};

/** Adjectif accordé pour la phrase de verdict (« … côté délai »). */
const LEVEL_PHRASE: Record<LensLevel, string> = {
  favorable: "maîtrisé",
  vigilance: "à surveiller",
  tension: "sous tension",
  critique: "critique",
};

export interface LensReading {
  key: LensKey;
  /** Nom lisible de la lentille. */
  title: string;
  level: LensLevel;
  levelLabel: string;
  /** Indice de performance (SPI_t / CPI), 1 = au plan. */
  index: number | null;
}

export interface TwoLensVerdict {
  delai: LensReading;
  cout: LensReading;
  /** Niveau le plus défavorable des deux — donne la couleur d'ensemble. */
  worst: LensLevel;
  /** Phrase unique lisible en une seconde. */
  verdict: string;
}

/**
 * Classe un indice de performance (SPI_t ou CPI) en niveau FGF.
 * >= 1.00 au plan · >= 0.95 léger retard/dépassement · >= 0.85 tension · sinon critique.
 * `unfavorableFallback` sert quand l'indice est indisponible (pas de référentiel).
 */
export function classifyIndex(
  index: number | null | undefined,
  unfavorableFallback = false,
): LensLevel {
  if (index == null || !Number.isFinite(index)) {
    return unfavorableFallback ? "tension" : "vigilance";
  }
  if (index >= 1.0) return "favorable";
  if (index >= 0.95) return "vigilance";
  if (index >= 0.85) return "tension";
  return "critique";
}

export function worstLevel(a: LensLevel, b: LensLevel): LensLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

export function levelLabel(level: LensLevel): string {
  return LEVEL_LABEL[level];
}

/**
 * Construit le verdict combiné des deux lentilles à partir des indices de
 * performance planning (SPI_t) et coût (CPI). `scheduleSlipDays` et `ecartFinal`
 * ne changent pas le niveau mais nuancent le fallback (indice absent).
 */
export function buildTwoLensVerdict(input: {
  spi: number | null;
  cpi: number | null;
  scheduleSlipDays?: number;
  ecartFinal?: number;
}): TwoLensVerdict {
  const delaiLevel = classifyIndex(input.spi, (input.scheduleSlipDays ?? 0) > 0);
  const coutLevel = classifyIndex(input.cpi, (input.ecartFinal ?? 0) > 0);

  const delai: LensReading = {
    key: "delai",
    title: "Délai",
    level: delaiLevel,
    levelLabel: LEVEL_LABEL[delaiLevel],
    index: input.spi ?? null,
  };
  const cout: LensReading = {
    key: "cout",
    title: "Coût",
    level: coutLevel,
    levelLabel: LEVEL_LABEL[coutLevel],
    index: input.cpi ?? null,
  };

  const worst = worstLevel(delaiLevel, coutLevel);

  let verdict: string;
  if (delaiLevel === "favorable" && coutLevel === "favorable") {
    verdict = "Projet maîtrisé sur les deux lentilles — délai et coût au plan.";
  } else if (delaiLevel === coutLevel) {
    verdict = `Projet ${LEVEL_PHRASE[worst]} — délai et coût au même niveau.`;
  } else {
    verdict = `${LEVEL_LABEL[delaiLevel]} côté délai, ${LEVEL_PHRASE[coutLevel]} côté coût.`;
  }

  return { delai, cout, worst, verdict };
}
