/**
 * Recette officielle FGF — « Cas complexe sportif » (corrigé de François Gagné).
 * Automatise les questions du corrigé : marges sans/avec date imposée (Q3/Q4),
 * nivellement sans surcharge (Q6), chemin critique après nivellement (Q7),
 * et la date d'inauguration en mois calendaires.
 *
 *   npm run verify:recette
 */
import path from "node:path";
import { randomUUID } from "node:crypto";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const near = (a: number | null | undefined, b: number, tol = 0.05) =>
  typeof a === "number" && Math.abs(a - b) <= tol;

async function load<T>(p: string): Promise<T> {
  const m = await import(p);
  return ("default" in m ? m.default : m) as T;
}

async function main() {
  process.env["CHEETAH_TIME_PERSISTENCE"] = "local";
  process.env["CHEETAH_TIME_LOCAL_STORE_PATH"] = path.join(
    process.cwd(),
    ".codex-temp",
    `verify-recette-${Date.now()}-${randomUUID().slice(0, 8)}.json`,
  );

  const svc = await load<typeof import("../src/services/projects")>("../src/services/projects.ts");
  const recipe = await load<typeof import("../src/data/sportif-recipe")>("../src/data/sportif-recipe.ts");

  async function createRecipe(structure = recipe.SPORTIF_STRUCTURE) {
    return svc.createProject({
      name: `${recipe.SPORTIF_META.name} ${randomUUID().slice(0, 4)}`,
      clientName: recipe.SPORTIF_META.clientName,
      ownerName: "Recette",
      sponsorName: "MOA",
      portfolio: "Recette",
      targetStartDate: recipe.SPORTIF_META.targetStartDate,
      targetFinishDate: recipe.SPORTIF_META.targetFinishDate,
      budgetAmount: 0,
      currencyCode: "EUR",
      phase: recipe.SPORTIF_META.phase,
      b2pDates: [],
      lots: [],
      structure,
    });
  }

  const byCode = (view: Awaited<ReturnType<typeof svc.getProjectView>>) =>
    new Map(view.tasks.map((t) => [t.code ?? t.name, t]));

  // ── Q2/Q3 : Gantt au plus tôt, marges sans date imposée ──
  const projectId = await createRecipe();
  const v3 = await svc.getProjectView(projectId);
  const t3 = byCode(v3);
  const b2 = t3.get("B2")!;
  const b3 = t3.get("B3")!;
  const b7 = t3.get("B7")!;
  assert(t3.get("B1")?.scheduledFinishDate === "2026-06-30", `B1 doit finir le 30/06/2026 (obtenu ${t3.get("B1")?.scheduledFinishDate})`);
  assert(b7.scheduledStartDate === "2027-10-01", `Inauguration attendue le 01/10/2027, obtenu ${b7.scheduledStartDate}`);
  assert(near(b2.freeSlackUnits, 0) && near(b2.totalSlackUnits, 2), `Q3 B2 attendu ML 0 / MT 2, obtenu ML ${b2.freeSlackUnits} / MT ${b2.totalSlackUnits}`);
  assert(near(b3.freeSlackUnits, 2) && near(b3.totalSlackUnits, 2), `Q3 B3 attendu ML 2 / MT 2, obtenu ML ${b3.freeSlackUnits} / MT ${b3.totalSlackUnits}`);
  console.log("✓ Q3 — marges sans date imposée (B2 0/2, B3 2/2) · inauguration 01/10/2027");

  // ── Q4 : date imposée B3 au 1/10 → seule B3 décalée ──
  const imposed = {
    ...recipe.SPORTIF_STRUCTURE,
    lots: recipe.SPORTIF_STRUCTURE.lots.map((lot) =>
      lot.code === "B3" ? { ...lot, imposed: { kind: "SNET" as const, date: "2026-10-01" } } : lot,
    ),
  };
  const v4 = await svc.getProjectView(await createRecipe(imposed));
  const t4 = byCode(v4);
  assert(t4.get("B3")?.scheduledStartDate === "2026-10-01", `Q4 B3 doit démarrer le 01/10, obtenu ${t4.get("B3")?.scheduledStartDate}`);
  assert(t4.get("B2")?.scheduledStartDate === b2.scheduledStartDate, "Q4 : B2 ne doit pas bouger");
  assert(near(t4.get("B2")?.freeSlackUnits, 1) && near(t4.get("B2")?.totalSlackUnits, 2), `Q4 B2 attendu ML 1 / MT 2, obtenu ${t4.get("B2")?.freeSlackUnits} / ${t4.get("B2")?.totalSlackUnits}`);
  assert(near(t4.get("B3")?.freeSlackUnits, 1) && near(t4.get("B3")?.totalSlackUnits, 1), `Q4 B3 attendu ML 1 / MT 1, obtenu ${t4.get("B3")?.freeSlackUnits} / ${t4.get("B3")?.totalSlackUnits}`);
  console.log("✓ Q4 — date imposée B3 au 01/10 (B2 1/2, B3 1/1)");

  // ── Q6 : nivellement → plus aucune surcharge sur l'équipe projet ──
  await svc.levelProjectResources(projectId);
  const v6 = await svc.getProjectView(projectId);
  const overloads = svc.findResourceOverloads(v6);
  assert(overloads.length === 0, `Q6 : surcharge restante après nivellement : ${overloads.map((o) => `${o.resourceName} ${o.date} ×${o.load}`).slice(0, 3).join(", ")}`);
  console.log("✓ Q6 — nivellement : aucune surcharge restante");

  // ── Q7 : chemin critique après nivellement = toutes les tâches critiques ──
  const t6 = byCode(v6);
  const notCritical = [...t6.values()].filter((t) => !t.isSummary && !t.isCritical);
  assert(notCritical.length === 0, `Q7 : tâches non critiques après nivellement : ${notCritical.map((t) => `${t.code} (MT ${t.totalSlackUnits})`).join(", ")}`);
  console.log("✓ Q7 — après nivellement, toutes les tâches sont critiques");

  console.log("\nRecette « cas complexe sportif » : OK");
}

main().catch((error) => {
  console.error("✗", error instanceof Error ? error.message : error);
  process.exit(1);
});
