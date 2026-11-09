import { monthsBetween } from "@/lib/planning/month-calendar";
import { fromWorkingDays, timeUnitShortLabel } from "@/lib/planning/time-unit";
import { workingDayDistance } from "@/lib/planning/date-utils";
import type { ISODate, ProjectView, T2PLine, T2PTable, T2PTableKind, TimeUnit } from "@/types/planning";

/**
 * Tableaux de Pilotage du Temps (T2P) — transposition DÉLAI, à l'identique,
 * du modèle des tableaux B2P de Cheetah Cost (src/lib/b2p.ts) :
 *   - B2P0     « Référence initiale »        (Planning Initial)
 *   - T2Pi-1   « Prévision avant pilotage »  (créé en démarrant le B2Pi)
 *   - T2Pi-2j  « Scénario correctif »        (copie du T2Pi-1, modifiable)
 *   - T2Pi-2   « Prévision corrigée »        (copie du scénario retenu)
 * Statuts identiques à Cost : action de pilotage non requise / requise /
 * envisagée / choisie. Écart précédent et dérive D = E − éPrec : même chaîne.
 * Les montants deviennent des dates et des durées dans l'unité du projet.
 */

const KIND_RANK: Record<T2PTableKind, number> = { b2p0: 0, "i-1": 1, "i-2j": 2, "i-2": 99 };

export function sortT2PTables(tables: T2PTable[]): T2PTable[] {
  return [...tables].sort((a, b) => {
    if (a.numero !== b.numero) return a.numero - b.numero;
    const ra = KIND_RANK[a.tableKind] + (a.tableKind === "i-2j" ? (a.scenarioIndex ?? 0) / 100 : 0);
    const rb = KIND_RANK[b.tableKind] + (b.tableKind === "i-2j" ? (b.scenarioIndex ?? 0) / 100 : 0);
    return ra - rb;
  });
}

/** Même libellé que getBilanLabel (Cost) : B2P0, T2Pi-1, T2Pi-2j, T2Pi-2. */
export function getT2PLabel(table: Pick<T2PTable, "numero" | "tableKind" | "scenarioIndex">): string {
  if (table.tableKind === "b2p0" || table.numero === 0) return "B2P0";
  if (table.tableKind === "i-2") return `T2P${table.numero}-2`;
  if (table.tableKind === "i-2j") return `T2P${table.numero}-2${table.scenarioIndex ?? 1}`;
  return `T2P${table.numero}-1`;
}

/** Même descripteur que getBilanDescriptor (Cost). */
export function getT2PDescriptor(kind: T2PTableKind): string {
  if (kind === "b2p0") return "Référence initiale";
  if (kind === "i-2") return "Prévision corrigée";
  if (kind === "i-2j") return "Scénario correctif";
  return "Prévision avant pilotage";
}

function gap(from: ISODate | null, to: ISODate | null, unit: TimeUnit, calendar: ProjectView["aggregate"]["calendar"]): number {
  if (!from || !to) return 0;
  if (unit === "mois") return monthsBetween(from, to);
  const days = workingDayDistance(from, to, calendar);
  return Math.round(fromWorkingDays(days, unit, calendar.hoursPerDay) * 100) / 100;
}

export interface T2PAggregate {
  finInitiale: ISODate | null;
  finADate: ISODate | null;
  finPrevue: ISODate | null;
  /** E — écart FP − PàD (unité du projet, > 0 = retard). */
  ecart: number;
  avancement: number;
}

const maxDate = (values: (ISODate | null)[]) =>
  values.reduce<ISODate | null>((m, v) => (v && (!m || v > m) ? v : m), null);

export function aggregateT2P(table: T2PTable, calendar: ProjectView["aggregate"]["calendar"]): T2PAggregate {
  const finInitiale = maxDate(table.lignes.map((l) => l.finInitiale));
  const finADate = maxDate(table.lignes.map((l) => l.finADate));
  const finPrevue = maxDate(table.lignes.map((l) => l.finPrevue));
  const ecart = table.tableKind === "b2p0" ? 0 : gap(finADate, finPrevue, table.unit, calendar);
  const avancement = table.lignes.length
    ? Math.round(table.lignes.reduce((s, l) => s + l.avancement, 0) / table.lignes.length)
    : 0;
  return { finInitiale, finADate, finPrevue, ecart, avancement };
}

/** Écart d'une ligne (lot) : FP − PàD dans l'unité du projet. */
export function lineEcart(line: T2PLine, unit: TimeUnit, calendar: ProjectView["aggregate"]["calendar"]) {
  return gap(line.finADate, line.finPrevue, unit, calendar);
}

/**
 * Référence de l'« écart précédent » — même chaîne que getEcartReferenceBilan (Cost) :
 *   T2Pi-1 et T2Pi-2 → T2P(i-1)-2 si retenu, sinon T2P(i-1)-1 (B2P0 si i = 1) ;
 *   T2Pi-2j → T2Pi-1 du même B2P ; B2P0 → aucune.
 */
export function getT2PEcartReference(tables: T2PTable[], table: T2PTable): T2PTable | null {
  if (table.tableKind === "b2p0") return null;
  if (table.tableKind === "i-2j") {
    return tables.find((t) => t.numero === table.numero && t.tableKind === "i-1") ?? null;
  }
  // B2P précédent SAISI (dans Cost, les B2P se suivent ; ici un B2P peut ne pas
  // avoir été saisi : on remonte au dernier tableau antérieur, sinon au B2P0).
  const earlier = tables
    .filter((t) => t.numero > 0 && t.numero < table.numero && (t.tableKind === "i-1" || t.tableKind === "i-2"))
    .map((t) => t.numero);
  const prev = earlier.length ? Math.max(...earlier) : 0;
  if (prev <= 0) return tables.find((t) => t.tableKind === "b2p0") ?? null;
  return (
    tables.find((t) => t.numero === prev && t.tableKind === "i-2") ??
    tables.find((t) => t.numero === prev && t.tableKind === "i-1") ??
    null
  );
}

export type T2PStatus = "reference" | "non-requise" | "requise" | "envisagee" | "choisie";

/** Statut — mêmes libellés que B2PTimeline (Cost). */
export function getT2PStatus(table: T2PTable, aggregate: T2PAggregate): { status: T2PStatus; label: string } {
  if (table.tableKind === "b2p0") return { status: "reference", label: "Référence initiale" };
  if (table.tableKind === "i-2j") return { status: "envisagee", label: "Action de pilotage envisagée" };
  if (table.tableKind === "i-2") return { status: "choisie", label: "Action de pilotage choisie" };
  return aggregate.ecart <= 0
    ? { status: "non-requise", label: "Action de pilotage non requise" }
    : { status: "requise", label: "Action de pilotage requise" };
}

/**
 * Lignes d'un T2P calculées depuis le planning (moteur) à la date d'état :
 * une ligne par lot du premier niveau (comme les lignes budgétaires de Cost).
 */
export function buildT2PLinesFromView(view: ProjectView, mode: "current" | "reference" = "current"): T2PLine[] {
  const unit = view.aggregate.project.timeUnit ?? "jours";
  const calendar = view.aggregate.calendar;
  const statusDate = view.schedule.statusDate ?? new Date().toISOString().slice(0, 10);
  const baselines = [...view.aggregate.baselines].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const initial = baselines[0] ?? null;
  const active = view.activeBaseline ?? initial;
  const finishOf = (b: typeof initial, ids: string[]) =>
    b ? maxDate(b.snapshots.filter((s) => ids.includes(s.taskId)).map((s) => s.finishDate ?? null)) : null;

  const children = new Map<string | null, string[]>();
  for (const t of view.tasks) {
    const k = t.parentId ?? null;
    children.set(k, [...(children.get(k) ?? []), t.id]);
  }
  const byId = new Map(view.tasks.map((t) => [t.id, t]));
  const leavesUnder = (id: string): string[] => {
    const kids = children.get(id) ?? [];
    if (!kids.length) return [id];
    return kids.flatMap(leavesUnder);
  };

  return view.tasks
    .filter((t) => !t.parentId && t.type !== "MILESTONE")
    .map((lot, i) => {
      const leafIds = leavesUnder(lot.id);
      const leaves = leafIds.map((id) => byId.get(id)!).filter(Boolean);
      const finInitiale = finishOf(initial, leafIds) ?? lot.scheduledFinishDate ?? null;
      const finADate = finishOf(active, leafIds) ?? finInitiale;
      const finPrevue = mode === "reference" ? finADate : maxDate(leaves.map((l) => l.scheduledFinishDate ?? null));
      const weight = leaves.reduce((s, l) => s + Math.max(1, l.durationDays), 0);
      const avancement =
        mode === "reference"
          ? 0
          : Math.round(leaves.reduce((s, l) => s + l.progressPercent * Math.max(1, l.durationDays), 0) / Math.max(1, weight));
      const resteAFaire =
        mode === "reference" || !finPrevue || avancement >= 100
          ? 0
          : Math.max(0, gap(statusDate > (lot.scheduledStartDate ?? statusDate) ? statusDate : lot.scheduledStartDate ?? statusDate, finPrevue, unit, calendar));
      return {
        lotId: lot.id,
        code: lot.code ?? `LT${String(i + 1).padStart(2, "0")}`,
        libelle: lot.name,
        finInitiale,
        finADate,
        avancement,
        resteAFaire,
        finPrevue,
        commentaire: "",
      };
    });
}

export function t2pUnitLabel(unit: TimeUnit) {
  return timeUnitShortLabel(unit);
}
