import path from "node:path";
import { randomUUID } from "node:crypto";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function near(a: number, b: number, tol = 0.5) {
  return Math.abs(a - b) <= tol;
}

async function loadModule<T>(modulePath: string): Promise<T> {
  const loaded = await import(modulePath);
  return ("default" in loaded ? loaded.default : loaded) as T;
}

async function main() {
  process.env["CHEETAH_TIME_PERSISTENCE"] = "local";
  process.env["CHEETAH_TIME_LOCAL_STORE_PATH"] =
    process.env["CHEETAH_TIME_LOCAL_STORE_PATH"] ||
    path.join(process.cwd(), ".codex-temp", `verify-fgf-${Date.now()}-${randomUUID().slice(0, 8)}.json`);

  const fgf = await loadModule<typeof import("../src/lib/fgf/coutenance")>(
    "../src/lib/fgf/coutenance.ts",
  );
  const b2p = await loadModule<typeof import("../src/lib/fgf/b2p")>(
    "../src/lib/fgf/b2p.ts",
  );
  const b2pReview = await loadModule<typeof import("../src/lib/fgf/b2p-review")>(
    "../src/lib/fgf/b2p-review.ts",
  );
  const projectServices = await loadModule<typeof import("../src/services/projects")>(
    "../src/services/projects.ts",
  );
  const costBridge = await loadModule<typeof import("../src/services/cost-bridge")>(
    "../src/services/cost-bridge.ts",
  );
  const advancedPlanning = await loadModule<
    typeof import("../src/services/advanced-planning")
  >("../src/services/advanced-planning.ts");

  // ── 1. Formules FGF canoniques (déterministes) ─────────────────────────
  {
    const line = fgf.buildFgfLine({
      budgetInitial: 1000,
      budgetADate: 1200,
      depenses: 500,
      avancementPhysique: 50,
    });
    assert(near(line.variation, 200), `variation attendue 200, obtenu ${line.variation}`);
    assert(near(line.valeurAcquise, 600), `VA attendue 600, obtenu ${line.valeurAcquise}`);
    assert(near(line.varianceCout, -100), `CV attendu -100, obtenu ${line.varianceCout}`);
    assert(near(line.resteAFaire, 600), `RàF attendu 600, obtenu ${line.resteAFaire}`);
    assert(near(line.coutPrevisionnelTerminaison, 1100), `CP attendu 1100, obtenu ${line.coutPrevisionnelTerminaison}`);
    assert(near(line.ecartFinal, -100), `écart attendu -100, obtenu ${line.ecartFinal}`);

    // Reste à Faire explicite (prévision corrigée saisie).
    const corrige = fgf.buildFgfLine({
      budgetInitial: 1000,
      budgetADate: 1000,
      depenses: 700,
      avancementPhysique: 60,
      resteAFaire: 500,
    });
    assert(near(corrige.coutPrevisionnelTerminaison, 1200), `CP corrigé attendu 1200, obtenu ${corrige.coutPrevisionnelTerminaison}`);
    assert(near(corrige.ecartFinal, 200), `écart corrigé attendu 200, obtenu ${corrige.ecartFinal}`);

    // Fonctions unitaires.
    assert(near(fgf.computeValeurAcquise(1000, 25), 250), "computeValeurAcquise");
    assert(near(fgf.computeCoutPrevisionnelTerminaison(300, 200), 500), "CP unitaire");
    assert(near(fgf.computeEcartFinal(1000, 1100), 100), "écart unitaire");
    console.log("✓ Formules FGF canoniques");
  }

  // ── 2. Invariants FGF sur un vrai projet ───────────────────────────────
  {
    const view = await projectServices.getProjectView("northstar-erp-rollout");
    const synth = costBridge.computeFgfSyntheseFromView(view);

    assert(synth.budgetADate > 0, "BàD projet doit être > 0 (taux ressources alimentés)");
    assert(synth.depenses > 0, "Dépenses projet doivent être > 0 (heures réelles saisies)");
    assert(synth.valeurAcquise > 0, "VA projet doit être > 0");
    assert(synth.valeurAcquise <= synth.budgetADate + 0.5, "VA ne peut dépasser le BàD");
    assert(
      near(synth.coutPrevisionnelTerminaison, synth.depenses + synth.resteAFaire),
      "CP doit égaler Dépenses + RàF",
    );
    assert(
      near(synth.ecartFinal, synth.coutPrevisionnelTerminaison - synth.budgetADate),
      "écart final doit égaler CP - BàD",
    );
    assert(
      near(synth.varianceCout, synth.depenses - synth.valeurAcquise),
      "CV doit égaler Dépenses - VA",
    );
    console.log(
      `✓ Invariants FGF projet (BàD=${synth.budgetADate} VA=${synth.valeurAcquise} Dép=${synth.depenses} CP=${synth.coutPrevisionnelTerminaison} écart=${synth.ecartFinal})`,
    );
  }

  // ── 3. Coût du glissement (what-if) ────────────────────────────────────
  {
    const view = await projectServices.getProjectView("northstar-erp-rollout");
    const leaf = view.tasks.find(
      (t) => !t.isSummary && t.type !== "MILESTONE",
    );
    assert(leaf, "Une tâche feuille est attendue pour le what-if");
    const res = advancedPlanning.simulateWhatIf(view, {
      shiftTask: { taskId: leaf!.id, days: 8 },
    });
    assert(res.finishDeltaDays >= 0, "Le glissement ne doit pas avancer la fin");
    assert(typeof res.costOfDelayDelta === "number", "costOfDelayDelta doit exister");
    assert(res.costOfDelayDelta >= 0, "coût du glissement >= 0");
    console.log(
      `✓ What-if coût du glissement (+${res.finishDeltaDays} j → ${res.costOfDelayDelta} €)`,
    );
  }

  // ── 4. Dates de B2P (règle FGF, identiques à CheetahCost) ──────────────
  {
    // Projet phare : 2026-05-25 → 2026-07-09 (45 j → cadence hebdomadaire).
    const rule = b2p.getB2PCadenceRule("2026-05-25", "2026-07-09");
    assert(rule?.label === "Toutes les semaines", `cadence attendue hebdomadaire, obtenu ${rule?.label}`);

    const dates = b2p.buildRecommendedB2PDates({ dateDebut: "2026-05-25", dateFin: "2026-07-09" });
    assert(dates[0] === "2026-05-25", `B2P0 doit être la date de début, obtenu ${dates[0]}`);
    assert(dates[dates.length - 1] === "2026-07-09", `dernière date = fin, obtenu ${dates[dates.length - 1]}`);
    assert(dates.includes("2026-06-01") && dates.includes("2026-07-06"), "jalons hebdomadaires (lundis) attendus");
    assert(dates.length === 8, `8 dates attendues (B2P0 + 7), obtenu ${dates.length}`);

    // Cohérence des buckets de cadence.
    assert(b2p.getB2PCadenceRule("2026-01-01", "2026-01-09")?.label === "Tous les jours", "bucket 6–12 j");
    assert(b2p.getB2PCadenceRule("2026-01-01", "2026-07-20")?.label === "Tous les mois", "bucket 6 mois–1 an");

    // Invariant : 1ʳᵉ date = début, dernière = fin sur une plage quelconque.
    const d2 = b2p.buildRecommendedB2PDates({ dateDebut: "2026-03-02", dateFin: "2026-09-30" });
    assert(d2[0] === "2026-03-02" && d2[d2.length - 1] === "2026-09-30", "bornes B2P invariantes");
    console.log(`✓ Dates de B2P (règle FGF) — ${dates.length} dates, cadence « ${rule?.label} »`);
  }

  // ── 5. Flux de création : Lots de Tâches (LT) + phase + dates B2P ──────
  {
    const dateDebut = "2026-09-01";
    const dateFin = "2026-12-15";
    const dates = b2p.buildRecommendedB2PDates({ dateDebut, dateFin });
    const pid = await projectServices.createProject({
      name: `Test LT FGF ${Date.now()}`,
      clientName: "Commune de Test — Maîtrise d'ouvrage",
      ownerName: "Maîtrise d'œuvre",
      sponsorName: "Maître d'ouvrage",
      portfolio: "Bâtiments publics",
      targetStartDate: dateDebut,
      targetFinishDate: dateFin,
      budgetAmount: 0,
      currencyCode: "EUR",
      phase: "Réalisation",
      b2pDates: dates,
      lots: [
        { name: "Gros œuvre & structure", budgetAmount: 500000 },
        { name: "Lots techniques", budgetAmount: 300000 },
        { name: "Provision pour aléas (PTO)", budgetAmount: 50000 },
      ],
    });

    const view = await projectServices.getProjectView(pid);
    const p = view.aggregate.project;
    assert(p.phase === "Réalisation", "phase persistée");
    assert((p.b2pDates?.length ?? 0) === dates.length, "dates B2P persistées");
    const lotPhases = view.aggregate.tasks.filter(
      (t) => t.type === "SUMMARY" && (t.budgetAmount ?? 0) > 0,
    );
    assert(lotPhases.length === 3, `3 lots budgétés attendus, obtenu ${lotPhases.length}`);
    assert(Math.abs(p.budgetAmount - 850000) < 1, `budget projet = somme des LT, obtenu ${p.budgetAmount}`);

    // Le cockpit FGF doit refléter le BàD piloté par les lots (= somme des LT).
    const synth = costBridge.computeFgfSyntheseFromView(view);
    assert(Math.abs(synth.budgetADate - 850000) < 1, `BàD cockpit piloté par LT attendu 850000, obtenu ${synth.budgetADate}`);
    console.log(
      `✓ Création LT (${lotPhases.length} lots · budget ${p.budgetAmount.toLocaleString("fr-FR")} € · BàD cockpit ${synth.budgetADate.toLocaleString("fr-FR")} € · ${dates.length} dates B2P · phase ${p.phase})`,
    );

    // Bilan planning B2P : revue par lot + persistance de la note.
    const review = b2pReview.buildB2PPlanningReview(view);
    assert(review.lots.length === 3, `3 lots attendus dans la revue, obtenu ${review.lots.length}`);
    await projectServices.setProjectB2PNote({ projectId: pid, date: dates[1], note: "Décision de bilan test" });
    const view2 = await projectServices.getProjectView(pid);
    assert(
      view2.aggregate.project.b2pNotes?.[dates[1]] === "Décision de bilan test",
      "note de bilan B2P persistée",
    );
    console.log(`✓ Bilan planning B2P (${review.lots.length} lots · note persistée au B2P1)`);

    // ── 6. Interop suite : Time → fichier .cheetahcost.json → ré-import ──
    const file = await projectServices.buildSuiteExport(pid);
    assert(file.app === "CheetahCost", "enveloppe lisible par Cheetah Cost");
    assert(file.project.lots.length === 3, `3 lots exportés attendus, obtenu ${file.project.lots.length}`);
    assert(file.project.b2pDates.length === dates.length, "mêmes dates B2P à l'export");

    const reimport = await projectServices.importSuiteProject(JSON.stringify(file));
    const view3 = await projectServices.getProjectView(reimport.projectId);
    const lots3 = view3.aggregate.tasks.filter((t) => t.type === "SUMMARY" && (t.budgetAmount ?? 0) > 0);
    assert(lots3.length === 3, `ré-import : 3 lots attendus, obtenu ${lots3.length}`);
    assert(view3.aggregate.project.phase === "Réalisation", "ré-import : phase conservée");
    assert(
      (view3.aggregate.project.b2pDates?.length ?? 0) === dates.length,
      "ré-import : mêmes dates B2P",
    );
    console.log(
      `✓ Interop suite (export .cheetahcost.json → ré-import : ${lots3.length} lots, ${view3.aggregate.project.b2pDates?.length} dates B2P, phase conservée)`,
    );
  }

  // ── 7. Création structurée : unité de temps, LT complets, PTO, TH, Ressources ──
  {
    const pid = await projectServices.createProject({
      name: `Test structuré FGF ${Date.now()}`,
      clientName: "Commune de Test — Maîtrise d'ouvrage",
      ownerName: "Maîtrise d'œuvre",
      sponsorName: "Maître d'ouvrage",
      portfolio: "Bâtiments publics",
      targetStartDate: "2026-09-01",
      targetFinishDate: "2026-10-30",
      budgetAmount: 0,
      currencyCode: "EUR",
      phase: "Réalisation",
      b2pDates: b2p.buildRecommendedB2PDates({ dateDebut: "2026-09-01", dateFin: "2026-10-30" }),
      structure: {
        timeUnit: "jours",
        resources: [
          { code: "R01", name: "Chef de projet", hoursPerDay: 7, workingDays: [1, 2, 3, 4, 5] },
          { code: "R02", name: "Maçon", hoursPerDay: 7, workingDays: [1, 2, 3, 4, 5] },
        ],
        lots: [
          { code: "LT01", name: "Fondations", duration: 5, budgetAmount: 100000, assignments: [{ resourceCode: "R02", intensity: 2 }] },
          { code: "LT02", name: "Dalle", duration: 3, budgetAmount: 50000, predecessors: [{ code: "LT01", type: "FS" }], assignments: [{ resourceCode: "R02", intensity: 1.5 }] },
          { code: "LT03", name: "Élévation des murs", duration: 4, budgetAmount: 80000, predecessors: [{ code: "LT02", type: "FS", lag: 2 }], assignments: [{ resourceCode: "R01", intensity: 0.25 }] },
          { code: "PTO01", name: "Provision pour Tâches Oubliées", duration: 0, budgetAmount: 20000, isPto: true },
        ],
        hammocks: [{ code: "TH01", name: "Maçonnerie", lotCodes: ["LT01", "LT02", "LT03"] }],
        jalons: [
          { code: "J1", name: "Dalle coulée", predecessors: [{ code: "LT02", type: "FS" }] },
          { code: "J2", name: "Murs terminés", predecessors: [{ code: "LT03", type: "FS" }] },
        ],
      },
    });

    const view = await projectServices.getProjectView(pid);
    const agg = view.aggregate;

    // Unité de temps + calendrier 7 h.
    assert(agg.project.timeUnit === "jours", "unité de temps persistée");
    assert(agg.calendar.hoursPerDay === 7, "calendrier projet 7 h/jour (standard français)");

    // Tâche Hamac = synthèse regroupant les 3 LT.
    const th = agg.tasks.find((t) => t.code === "TH01");
    assert(th?.type === "SUMMARY", "TH01 est une tâche de synthèse");
    const children = agg.tasks.filter((t) => t.parentId === th!.id);
    assert(children.length === 3, `TH01 regroupe 3 LT, obtenu ${children.length}`);

    // Jalons : durée nulle, planifiés après leurs prédécesseurs.
    const j1 = agg.tasks.find((t) => t.code === "J1");
    const j2 = agg.tasks.find((t) => t.code === "J2");
    assert(j1?.type === "MILESTONE" && j1.durationDays === 0, "J1 = jalon à durée nulle");
    assert(j2?.type === "MILESTONE" && j2.durationDays === 0, "J2 = jalon à durée nulle");

    // Dépendances : 2 liens LT + 2 liens jalons, dont délai +2 j sur LT03.
    assert(agg.dependencies.length === 4, `4 dépendances attendues, obtenu ${agg.dependencies.length}`);
    const lt3 = agg.tasks.find((t) => t.code === "LT03")!;
    const depLt3 = agg.dependencies.find((d) => d.successorTaskId === lt3.id);
    assert(depLt3?.lagDays === 2, `délai sur lien +2 j attendu, obtenu ${depLt3?.lagDays}`);

    // Intensités → allocations (×100), 2 décimales respectées (0,25 → 25 %).
    const allocs = agg.assignments.map((a) => a.allocationPct).sort((a, b) => a - b);
    assert(JSON.stringify(allocs) === JSON.stringify([25, 150, 200]), `allocations 25/150/200 attendues, obtenu ${allocs}`);

    // Moteur : LT02 démarre après LT01 ; LT03 après LT02 + délai.
    const sched = view.schedule.tasksById;
    const lt1 = agg.tasks.find((t) => t.code === "LT01")!;
    const lt2 = agg.tasks.find((t) => t.code === "LT02")!;
    assert(
      String(sched[lt2.id]?.scheduledStartDate) > String(sched[lt1.id]?.scheduledFinishDate),
      "LT02 démarre après la fin de LT01 (lien FD)",
    );
    assert(
      String(sched[lt3.id]?.scheduledStartDate) > String(sched[lt2.id]?.scheduledFinishDate),
      "LT03 démarre après la fin de LT02 (+ délai)",
    );

    // PTO = jalon budgété ; BàD = somme des LT + PTO.
    const pto = agg.tasks.find((t) => t.code === "PTO01");
    assert(pto?.type === "MILESTONE", "PTO01 est un jalon budgété");
    const synth = costBridge.computeFgfSyntheseFromView(view);
    assert(Math.abs(synth.budgetADate - 250000) < 1, `BàD = 250 000 attendu, obtenu ${synth.budgetADate}`);

    // Jalon J2 planifié après la fin de LT03 (lien FD).
    assert(
      String(sched[j2!.id]?.scheduledStartDate) > String(sched[lt3.id]?.scheduledFinishDate),
      "J2 tombe après la fin de LT03",
    );

    // Ressources : codes + capacité 7 h.
    assert(agg.resources.length === 2 && agg.resources[0].capacityHoursPerDay === 7, "2 ressources à 7 h/j");
    console.log(
      `✓ Création structurée (TH01→3 LT · 2 jalons durée 0 · liens FD avec délai +2 j · intensités 0,25/1,5/2 · PTO · BàD ${synth.budgetADate.toLocaleString("fr-FR")} € · planning ordonné)`,
    );

    // ── 8. Nivellement par allongement (durée ×F, intensité ÷F) ──────────
    const pid2 = await projectServices.createProject({
      name: `Test allongement ${Date.now()}`,
      clientName: "Test",
      ownerName: "Test",
      sponsorName: "Test",
      portfolio: "Test",
      targetStartDate: "2026-09-01",
      targetFinishDate: "2026-10-30",
      budgetAmount: 0,
      currencyCode: "EUR",
      structure: {
        timeUnit: "jours",
        resources: [{ code: "R01", name: "Développeur" }],
        // Deux tâches parallèles à 100 % sur la même ressource → surcharge 200 %.
        lots: [
          { code: "LT01", name: "Tâche A", duration: 4, assignments: [{ resourceCode: "R01", intensity: 1 }] },
          { code: "LT02", name: "Tâche B", duration: 4, assignments: [{ resourceCode: "R01", intensity: 1 }] },
        ],
        hammocks: [],
      },
    });

    const stretched = await projectServices.stretchProjectResources(pid2);
    assert(stretched === 2, `2 tâches allongées attendues, obtenu ${stretched}`);
    const view4 = await projectServices.getProjectView(pid2);
    const a = view4.aggregate.tasks.find((t) => t.code === "LT01")!;
    assert(a.durationDays === 8, `durée ×2 attendue (8 j), obtenu ${a.durationDays}`);
    const asgA = view4.aggregate.assignments.find((x) => x.taskId === a.id)!;
    assert(asgA.allocationPct === 50, `intensité ÷2 attendue (50 %), obtenu ${asgA.allocationPct}`);
    console.log(
      `✓ Nivellement par allongement (surcharge 200 % → ${stretched} tâches : durée 4→${a.durationDays} j, intensité 1,00→${(asgA.allocationPct / 100).toFixed(2)})`,
    );
  }

  console.log("\nVERIFY:FGF — OK");
}

main().catch((error) => {
  console.error("VERIFY:FGF — ÉCHEC");
  console.error(error);
  process.exit(1);
});
