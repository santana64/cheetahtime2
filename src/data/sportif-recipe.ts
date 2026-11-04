import type { CreateProjectStructureInput } from "@/services/projects";

/**
 * Jeu de recette FGF — « Cas complexe sportif » (corrigé François Gagné, annexe 1).
 * Reproduit exactement les tâches, durées (mois), liens typés et décalages du
 * corrigé, pour valider le moteur A1 de Cheetah Time (potentiel-tâches, Gantt
 * au plus tôt/tard, marges, chemin critique, charges, nivellement).
 */

export const SPORTIF_STRUCTURE: CreateProjectStructureInput = {
  timeUnit: "mois",
  resources: [
    { code: "R01", name: "Équipe projet", hoursPerDay: 7, workingDays: [1, 2, 3, 4, 5] },
  ],
  hammocks: [
    { code: "A", name: "A — Marché Génie Civil", lotCodes: ["A1", "A2", "A3"] },
    { code: "B", name: "B — Management d'ensemble", lotCodes: ["B1", "B2", "B3", "B4", "B5", "B6"] },
  ],
  lots: [
    { code: "A1", name: "Préparation / Négociation / Signature contrat", duration: 1, budgetAmount: 0, lotType: "DUREE",
      predecessors: [{ code: "B1", type: "FS", lag: -1 }], assignments: [] },
    { code: "A2", name: "Réalisation gros œuvre", duration: 7, budgetAmount: 0, lotType: "DUREE",
      predecessors: [{ code: "A1", type: "FS", lag: 0 }], assignments: [] },
    { code: "A3", name: "Réalisation second œuvre", duration: 4, budgetAmount: 0, lotType: "DUREE",
      predecessors: [{ code: "A2", type: "FS", lag: 0 }], assignments: [] },
    { code: "B1", name: "Définition d'ensemble (salles, rangement, vestiaires)", duration: 3, budgetAmount: 0, lotType: "DUREE",
      predecessors: [], assignments: [{ resourceCode: "R01", intensity: 1 }] },
    { code: "B2", name: "Sélection des équipements", duration: 4, budgetAmount: 0, lotType: "DUREE",
      predecessors: [{ code: "B1", type: "FS", lag: 0 }], assignments: [{ resourceCode: "R01", intensity: 1 }] },
    { code: "B3", name: "Commandes des équipements", duration: 2, budgetAmount: 0, lotType: "DUREE",
      predecessors: [{ code: "B2", type: "SS", lag: 0 }, { code: "B2", type: "FF", lag: 0 }],
      assignments: [{ resourceCode: "R01", intensity: 1 }] },
    { code: "B4", name: "Réception et installation des équipements", duration: 6, budgetAmount: 0, lotType: "DUREE",
      predecessors: [{ code: "B3", type: "FS", lag: 0 }, { code: "A3", type: "FF", lag: 1 }],
      assignments: [{ resourceCode: "R01", intensity: 1 }] },
    { code: "B5", name: "Test des différentes configurations d'utilisation", duration: 1, budgetAmount: 0, lotType: "DUREE",
      predecessors: [{ code: "B4", type: "FS", lag: 0 }], assignments: [{ resourceCode: "R01", intensity: 1 }] },
    { code: "B6", name: "Préparation et répétition du spectacle inaugural", duration: 1, budgetAmount: 0, lotType: "DUREE",
      predecessors: [{ code: "B4", type: "FS", lag: 0 }], assignments: [{ resourceCode: "R01", intensity: 1 }] },
    { code: "C", name: "Marge", duration: 2, budgetAmount: 0, lotType: "DUREE",
      predecessors: [{ code: "B5", type: "FS", lag: 0 }, { code: "B6", type: "FS", lag: 0 }], assignments: [] },
  ],
  jalons: [
    { code: "B7", name: "Inauguration", predecessors: [{ code: "B6", type: "FS", lag: 0 }, { code: "C", type: "FS", lag: 0 }] },
  ],
};

/** Métadonnées du projet de recette. */
export const SPORTIF_META = {
  name: "Cas complexe sportif — recette FGF",
  clientName: "Université",
  phase: "Réalisation" as const,
  // Le projet ne peut pas démarrer avant le 1er avril. Pas de fin contractuelle
  // imposée : le référentiel = le planning lui-même, pour que le chemin critique
  // (marge = 0) apparaisse comme dans le corrigé.
  targetStartDate: "2026-04-01",
  targetFinishDate: null as string | null,
};
