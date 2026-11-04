import type { ProjectView, ScheduledTask } from "@/types/planning";

/**
 * Revue planning d'un B2P (lentille DURÉE, côté Cheetah Time).
 * Par lot : avancement, date de fin prévue, glissement vs référentiel, statut.
 * Le volet COÛT est traité dans la coûtenance FGF (Cheetah Cost).
 */

export type B2PLotStatut = "Terminé" | "En cours" | "Non démarré";

export interface B2PLotRow {
  id: string;
  name: string;
  budgetAmount: number | null;
  avancement: number; // %
  finPrevue: string | null; // ISO
  glissementJours: number; // max écart de fin vs référentiel
  statut: B2PLotStatut;
}

export interface B2PPlanningReview {
  lots: B2PLotRow[];
  avancementGlobal: number;
  glissementProjet: number;
}

export function buildB2PPlanningReview(view: ProjectView): B2PPlanningReview {
  const tasks = view.tasks;

  const childrenByParent = new Map<string | null, ScheduledTask[]>();
  for (const t of tasks) {
    const key = t.parentId ?? null;
    const arr = childrenByParent.get(key) ?? [];
    arr.push(t);
    childrenByParent.set(key, arr);
  }

  const leavesUnder = (lotId: string): ScheduledTask[] => {
    const out: ScheduledTask[] = [];
    const stack = [...(childrenByParent.get(lotId) ?? [])];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.type === "SUMMARY") stack.push(...(childrenByParent.get(node.id) ?? []));
      else out.push(node);
    }
    return out;
  };

  // Premier niveau = Tâches Hamac (synthèses) + LT non regroupés + PTO.
  const lots = tasks.filter((t) => !t.parentId);

  const budgetById = new Map(view.aggregate.tasks.map((t) => [t.id, t.budgetAmount ?? null]));

  const rows: B2PLotRow[] = lots.map((lot) => {
    const leaves = lot.type === "SUMMARY" ? leavesUnder(lot.id) : [lot];
    const totalDuration = leaves.reduce((s, l) => s + Math.max(0, l.durationDays), 0);
    const avancement =
      totalDuration > 0
        ? leaves.reduce((s, l) => s + l.progressPercent * Math.max(0, l.durationDays), 0) / totalDuration
        : lot.progressPercent ?? 0;
    const finPrevue = leaves.reduce<string | null>((max, l) => {
      const d = l.scheduledFinishDate ?? null;
      if (!d) return max;
      return !max || d > max ? d : max;
    }, null);
    const glissementJours = leaves.reduce((mx, l) => {
      const v = view.baselineVarianceByTaskId[l.id]?.finishVarianceDays ?? 0;
      return Math.max(mx, v);
    }, 0);
    const rounded = Math.round(avancement);
    const statut: B2PLotStatut = rounded >= 100 ? "Terminé" : rounded > 0 ? "En cours" : "Non démarré";
    return {
      id: lot.id,
      name: lot.name,
      budgetAmount: budgetById.get(lot.id) ?? null,
      avancement: rounded,
      finPrevue,
      glissementJours,
      statut,
    };
  });

  return {
    lots: rows,
    avancementGlobal: Math.round(view.metrics.overallProgress),
    glissementProjet: view.metrics.scheduleSlipDays ?? Math.max(0, ...rows.map((r) => r.glissementJours), 0),
  };
}
