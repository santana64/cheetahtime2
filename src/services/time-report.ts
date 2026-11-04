import { buildPdf, PdfPage } from "@/lib/export/pdf-writer";
import { computeDelayBanner, formatGap } from "@/lib/fgf/delay-banner";
import { buildRecommendedB2PDates } from "@/lib/fgf/b2p";
import { parseIsoDate } from "@/lib/planning/date-utils";
import { fromWorkingDays, timeUnitShortLabel } from "@/lib/planning/time-unit";
import type { ProjectView, ScheduledTask } from "@/types/planning";

/**
 * « Rapport Périodique de Pilotage du Temps » (CdC p. 8) — le document posé
 * sur la table en commission :
 *  1. Synthèse : bandeau Fi / PàD / Date actuelle / FP / Écart / Avancement,
 *     statut d'action de pilotage et Tableaux B2P ;
 *  2. Double planning : PàD (noir) | réalisé (rouge) + reste prévu (vert) ;
 *  3. Diagramme Temps/Temps des jalons + tableau Jalons-Jalons ;
 *  4. Écarts par LT dans l'unité du projet.
 * Pas de courbe en S (exclue par le CdC pour la lentille délai).
 */

const W = 842;
const H = 595;
const M = 36;
const GREEN_DEEP = "#1a4a20";
const GREEN = "#3f8f48";
const ORANGE = "#e0902a";
const RED = "#be123c";
const INK = "#0f172a";
const MUTED = "#64748b";
const GRID = "#e2e0d8";

const HEALTH_FR: Record<string, string> = {
  ON_TRACK: "Dans les délais",
  AT_RISK: "À surveiller",
  OFF_TRACK: "En dérive",
};

function fr(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = parseIsoDate(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

function frShort(iso: string) {
  return parseIsoDate(iso).toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function pageFrame(page: PdfPage, title: string, view: ProjectView, pageNo: number) {
  page.rect(0, 0, W, 4, GREEN);
  page.rect(W * 0.7, 0, W * 0.3, 4, "#f4a321");
  page.text(M, 26, title, 13, { bold: true, color: GREEN_DEEP });
  page.text(W - M, 26, `${view.aggregate.project.name} · ${view.aggregate.project.code}`, 8.5, {
    align: "right",
    color: MUTED,
    maxWidth: 360,
  });
  page.line(M, 34, W - M, 34, GRID, 0.8);
  page.text(M, H - 16, "Cheetah Time · Rapport Périodique de Pilotage du Temps · méthode FGF", 7.5, { color: MUTED });
  page.text(W - M, H - 16, `Page ${pageNo}`, 7.5, { color: MUTED, align: "right" });
}

function taskCode(t: ScheduledTask) {
  return t.code || t.wbsCode;
}

export function buildTimeReportPdf(view: ProjectView): Buffer {
  const project = view.aggregate.project;
  const banner = computeDelayBanner(view);
  const unit = project.timeUnit ?? "jours";
  const unitLabel = timeUnitShortLabel(unit);
  const toUnit = (days: number) => fromWorkingDays(days, unit, view.aggregate.calendar.hoursPerDay);
  const pages: PdfPage[] = [];
  const statusDate = banner.dateActuelle;

  // ── 1. Synthèse ───────────────────────────────────────────────────────────
  {
    const p = new PdfPage(W, H);
    pageFrame(p, "Rapport Périodique de Pilotage du Temps", view, 1);
    p.text(M, 62, project.name, 20, { bold: true, color: INK, maxWidth: W - 2 * M });
    p.text(M, 80, `${project.clientName} · Phase : ${project.phase ?? "—"} · Responsable : ${project.ownerName}`, 10, { color: MUTED, maxWidth: W - 2 * M });
    p.text(M, 95, `Date d'état : ${fr(statusDate)} · Édité le ${new Date().toLocaleDateString("fr-FR")}`, 9, { color: MUTED });

    const cells: [string, string, string?][] = [
      ["Fin Initiale (Fi)", fr(banner.finInitiale)],
      ["Fin à Date (PàD)", fr(banner.finADate)],
      ["Date actuelle", fr(banner.dateActuelle)],
      ["Fin Prévisionnelle (FP)", fr(banner.finPrevisionnelle), (banner.ecart ?? 0) > 0 ? RED : GREEN_DEEP],
      [`Écart (${unit})`, formatGap(banner.ecart, unitLabel), (banner.ecart ?? 0) > 0 ? RED : GREEN],
      ["Avancement", `${banner.avancement} %`],
    ];
    const cw = (W - 2 * M) / cells.length;
    cells.forEach(([label, value, color], i) => {
      const x = M + i * cw;
      p.rect(x + 2, 110, cw - 4, 52, "#ffffff", "#d9d6cc");
      p.text(x + 12, 128, label, 7.5, { bold: true, color: MUTED, maxWidth: cw - 20 });
      p.text(x + 12, 150, value, 14, { bold: true, color: color ?? INK, maxWidth: cw - 20 });
    });

    const action = banner.actionRequise;
    p.rect(M, 176, 260, 26, action ? "#fde8ea" : "#e6f3e7", action ? "#f3b7bd" : "#b9dcbc");
    p.text(M + 12, 193, banner.hasPI ? (action ? "Action de pilotage requise" : "Action de pilotage non requise") : "Planning Initial non figé", 11, {
      bold: true,
      color: action ? RED : GREEN_DEEP,
    });
    p.text(M + 276, 193, `Santé calculée : ${HEALTH_FR[view.metrics.derivedHealth] ?? view.metrics.derivedHealth} · ${view.metrics.criticalTaskCount} LT critiques · ${view.metrics.executableTaskCount} LT`, 9.5, {
      color: INK,
    });

    // Tableaux B2P
    p.text(M, 232, "Tableaux B2P — prévision avant pilotage", 12, { bold: true, color: GREEN_DEEP });
    const fin = [project.targetFinishDate, view.schedule.projectFinishDate].filter(Boolean).sort().at(-1) ?? null;
    const dates = fin ? buildRecommendedB2PDates({ dateDebut: project.targetStartDate, dateFin: fin }) : [];
    const snaps = project.b2pSnapshots ?? {};
    const cols = [M, M + 120, M + 230, M + 340, M + 450, M + 560];
    const headers = ["B2P", "Date", "FP", "Écart", "Avancement", "Pilotage"];
    headers.forEach((h, i) => p.text(cols[i], 252, h.toUpperCase(), 7.5, { bold: true, color: MUTED }));
    p.line(M, 257, W - M, 257, GRID);
    let y = 272;
    const rows: string[][] = [["B2P0 (PI)", fr(dates[0] ?? project.targetStartDate), fr(banner.finInitiale), formatGap(0, unitLabel), "0 %", "Référence initiale"]];
    dates.slice(1).forEach((d, i) => {
      const s = snaps[d];
      if (!s) return;
      rows.push([`T2P${i + 1}-1`, fr(d), fr(s.finPrevisionnelle), formatGap(s.ecart, unitLabel), `${s.avancement} %`, s.actionRequise ? "Requise" : "Non requise"]);
    });
    rows.push(["Actuel", fr(statusDate), fr(banner.finPrevisionnelle), formatGap(banner.ecart, unitLabel), `${banner.avancement} %`, banner.actionRequise ? "Requise" : "Non requise"]);
    for (const row of rows.slice(0, 16)) {
      row.forEach((cell, i) =>
        p.text(cols[i], y, cell, 9, {
          bold: i === 0,
          color: i === 5 && cell === "Requise" ? RED : i === 3 && cell.startsWith("+") ? RED : INK,
          maxWidth: 108,
        }),
      );
      p.line(M, y + 5, W - M, y + 5, "#efede6");
      y += 17;
    }

    // Alertes principales
    const alerts = view.schedule.issues.slice(0, 5).map((i) => i.message);
    if (alerts.length) {
      p.text(M, Math.min(y + 18, 520), "Points d'alerte", 11, { bold: true, color: GREEN_DEEP });
      alerts.forEach((a, i) => p.text(M, Math.min(y + 34, 536) + i * 12, `• ${a}`, 8.5, { color: INK, maxWidth: W - 2 * M }));
    }
    pages.push(p);
  }

  // ── 2. Double planning (PàD | réalisé + reste prévu) ─────────────────────
  {
    const tasks = view.tasks.filter((t) => t.scheduledStartDate && t.scheduledFinishDate);
    const ROWS = 26;
    const MAX_PAGES = 12;
    const all = [
      view.schedule.projectStartDate,
      view.schedule.projectFinishDate,
      banner.finADate,
      banner.finInitiale,
      statusDate,
      ...tasks.map((t) => view.baselineVarianceByTaskId[t.id]?.snapshot?.startDate ?? null),
    ].filter((d): d is string => Boolean(d));
    const t0 = parseIsoDate(all.reduce((a, b) => (a < b ? a : b))).getTime();
    const t1 = parseIsoDate(all.reduce((a, b) => (a > b ? a : b))).getTime() + 86_400_000;
    const LEFT = M + 210;
    const RIGHT = W - M;
    const x = (iso: string) => LEFT + ((parseIsoDate(iso).getTime() - t0) / Math.max(1, t1 - t0)) * (RIGHT - LEFT);
    const chunks: ScheduledTask[][] = [];
    for (let i = 0; i < tasks.length && chunks.length < MAX_PAGES; i += ROWS) chunks.push(tasks.slice(i, i + ROWS));
    chunks.forEach((chunk, ci) => {
      const p = new PdfPage(W, H);
      pageFrame(p, `Double planning — PàD | réalisé + reste prévu${chunks.length > 1 ? ` (${ci + 1}/${chunks.length})` : ""}`, view, pages.length + 1);
      // Légende
      const lx = M;
      p.rect(lx, 44, 18, 3, "#111827");
      p.text(lx + 22, 48, "PàD", 7.5, { color: INK });
      p.rect(lx + 56, 43, 18, 5, RED);
      p.text(lx + 78, 48, "Réalisé", 7.5, { color: INK });
      p.rect(lx + 120, 43, 18, 5, GREEN);
      p.text(lx + 142, 48, "Reste prévu", 7.5, { color: INK });
      p.rect(lx + 200, 42, 18, 7, GREEN, "#0f172a", 1.4);
      p.text(lx + 222, 48, "Critique (trait épais)", 7.5, { color: INK });
      p.line(lx + 320, 41, lx + 320, 50, ORANGE, 1.2);
      p.text(lx + 326, 48, "Date d'état", 7.5, { color: INK });
      // Graduations mensuelles
      const top = 62;
      const rowH = 18;
      const bottom = top + chunk.length * rowH + 4;
      const start = new Date(t0);
      const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 12));
      const months: string[] = [];
      while (cursor.getTime() < t1) {
        months.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
      const step = Math.max(1, Math.ceil(months.length / 18));
      months.forEach((m, i) => {
        const mx = x(m);
        if (mx < LEFT) return;
        p.line(mx, top - 4, mx, bottom, "#efede6", 0.5);
        if (i % step === 0) p.text(mx + 2, top - 6, frShort(m), 6.5, { color: MUTED });
      });
      if (statusDate) p.line(x(statusDate), top - 4, x(statusDate), bottom, ORANGE, 1.2);

      chunk.forEach((t, i) => {
        const y = top + i * rowH;
        if (i % 2 === 0) p.rect(M, y, W - 2 * M, rowH, "#faf9f5");
        p.text(M + 4, y + 12, `${taskCode(t)}  ${t.name}`, 7.5, { bold: t.isSummary, color: t.isCritical ? RED : INK, maxWidth: 200 });
        const snap = view.baselineVarianceByTaskId[t.id]?.snapshot;
        if (snap?.startDate && snap.finishDate) {
          p.rect(x(snap.startDate), y + 3, Math.max(1.5, x(snap.finishDate) - x(snap.startDate) + 1), 2.5, "#111827");
        }
        const s = t.scheduledStartDate!;
        const e = t.scheduledFinishDate!;
        if (t.type === "MILESTONE") {
          const mx = x(s);
          p.polygon([[mx, y + 6], [mx + 4.5, y + 10.5], [mx, y + 15], [mx - 4.5, y + 10.5]], t.status === "DONE" ? RED : GREEN);
          return;
        }
        if (t.isSummary) {
          p.rect(x(s), y + 9, Math.max(2, x(e) - x(s)), 3, GREEN_DEEP);
          return;
        }
        const realEnd = t.actualFinishDate ?? (t.actualStartDate ? (statusDate < e ? statusDate : e) : null);
        if (t.actualStartDate && realEnd) {
          p.rect(x(t.actualStartDate), y + 8, Math.max(1.5, x(realEnd) - x(t.actualStartDate)), 6, RED);
        }
        const restStart = t.actualFinishDate ? null : realEnd && realEnd > s ? realEnd : s;
        if (restStart) {
          p.rect(
            x(restStart),
            y + 8,
            Math.max(1.5, x(e) - x(restStart) + 1),
            6,
            GREEN,
            t.isCritical ? "#0f172a" : undefined,
            t.isCritical ? 1.3 : 0.6,
          );
        }
      });
      if (ci === chunks.length - 1 && tasks.length > MAX_PAGES * ROWS) {
        p.text(M, bottom + 16, `${tasks.length - MAX_PAGES * ROWS} LT supplémentaires non imprimés : voir l'export Excel.`, 8.5, { color: MUTED });
      }
      pages.push(p);
    });
  }

  // ── 3. Temps/Temps + Jalons-Jalons ───────────────────────────────────────
  {
    const p = new PdfPage(W, H);
    pageFrame(p, "Diagramme Temps/Temps des jalons — et tableau Jalons-Jalons", view, pages.length + 1);
    const milestones = view.tasks.filter((t) => t.type === "MILESTONE").slice(0, 8);
    const baselines = [...view.aggregate.baselines].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const measures = baselines.map((b, i) => ({
      iso: b.capturedAt.slice(0, 10),
      label: `B2P${i}`,
      byId: new Map(b.snapshots.map((s) => [s.taskId, s.finishDate ?? null])),
    }));
    measures.push({ iso: statusDate, label: "Actuel", byId: new Map(milestones.map((m) => [m.id, m.scheduledFinishDate ?? null])) });
    const colors = ["#1a4a20", "#c2710c", "#3730a3", "#be123c", "#0ea5a4", "#9333ea", "#0369a1", "#4d7c0f"];
    const PX = M + 40;
    const PY = 60;
    const PW = 470;
    const PH = 430;
    const values: number[] = [];
    for (const m of measures) {
      values.push(parseIsoDate(m.iso).getTime());
      for (const ms of milestones) {
        const v = m.byId.get(ms.id);
        if (v) values.push(parseIsoDate(v).getTime());
      }
    }
    if (milestones.length && values.length) {
      const lo = Math.min(...values);
      const hi = Math.max(...values) + 86_400_000;
      const sx = (t: number) => PX + ((t - lo) / (hi - lo)) * PW;
      const sy = (t: number) => PY + PH - ((t - lo) / (hi - lo)) * PH;
      p.rect(PX, PY, PW, PH, "#fbfaf6", "#d9d6cc");
      p.line(sx(lo), sy(lo), sx(hi), sy(hi), "#94a3b8", 0.8, [3, 3]);
      p.text(PX + PW, PY + PH + 14, "Date de mesure (B2P) →", 7.5, { color: MUTED, align: "right" });
      p.text(PX - 4, PY - 6, "Date prévue du jalon", 7.5, { color: MUTED });
      milestones.forEach((ms, i) => {
        const pts = measures
          .map((m) => ({ mx: parseIsoDate(m.iso).getTime(), v: m.byId.get(ms.id) }))
          .filter((pt): pt is { mx: number; v: string } => Boolean(pt.v));
        for (let k = 1; k < pts.length; k++) {
          p.line(sx(pts[k - 1].mx), sy(parseIsoDate(pts[k - 1].v).getTime()), sx(pts[k].mx), sy(parseIsoDate(pts[k].v).getTime()), colors[i % colors.length], 1.4);
        }
        for (const pt of pts) p.rect(sx(pt.mx) - 2, sy(parseIsoDate(pt.v).getTime()) - 2, 4, 4, colors[i % colors.length]);
      });
      // Tableau Jalons-Jalons
      const TX = PX + PW + 24;
      p.text(TX, 66, "Jalons-Jalons", 11, { bold: true, color: GREEN_DEEP });
      ["Jalon", "Référence (PI)", "Prévu", "Écart"].forEach((h, i) => p.text(TX + [0, 110, 180, 240][i], 84, h.toUpperCase(), 6.5, { bold: true, color: MUTED }));
      milestones.forEach((ms, i) => {
        const y = 100 + i * 16;
        const ref = measures[0]?.byId.get(ms.id) ?? null;
        const cur = ms.scheduledFinishDate ?? null;
        const gapDays = ref && cur ? Math.round((parseIsoDate(cur).getTime() - parseIsoDate(ref).getTime()) / 86_400_000) : null;
        p.rect(TX, y - 6, 6, 6, colors[i % colors.length]);
        p.text(TX + 10, y, `${taskCode(ms)} ${ms.name}`, 7.5, { color: INK, maxWidth: 96 });
        p.text(TX + 110, y, fr(ref), 7.5, { color: INK });
        p.text(TX + 180, y, fr(cur), 7.5, { color: INK });
        p.text(TX + 240, y, gapDays == null ? "—" : `${gapDays > 0 ? "+" : ""}${gapDays} j`, 7.5, { bold: true, color: (gapDays ?? 0) > 0 ? RED : GREEN });
      });
    } else {
      p.text(M, 80, "Aucun jalon dans le planning : ajoutez des jalons (J1 à J9) pour suivre leur tendance.", 10, { color: MUTED });
    }
    pages.push(p);
  }

  // ── 4. Écarts par LT ────────────────────────────────────────────────────
  {
    const rows = view.tasks.filter((t) => !t.isSummary);
    const PER = 30;
    const MAX = 8;
    for (let pi = 0; pi * PER < rows.length && pi < MAX; pi++) {
      const p = new PdfPage(W, H);
      pageFrame(p, `Écarts par LT (en ${unit})${rows.length > PER ? ` — ${pi + 1}/${Math.min(MAX, Math.ceil(rows.length / PER))}` : ""}`, view, pages.length + 1);
      const cols = [M, M + 50, M + 320, M + 400, M + 480, M + 560, M + 640, M + 715];
      ["Code", "Lot de tâches", "Fin PI", "Fin prévue", "Écart", "Marge tot.", "Avanc.", "État"].forEach((h, i) =>
        p.text(cols[i], 54, h.toUpperCase(), 7, { bold: true, color: MUTED }),
      );
      p.line(M, 59, W - M, 59, GRID);
      rows.slice(pi * PER, (pi + 1) * PER).forEach((t, i) => {
        const y = 74 + i * 16;
        const v = view.baselineVarianceByTaskId[t.id];
        const ecart = v?.finishVarianceDays ?? 0;
        const slack = t.totalSlackUnits ?? toUnit(t.totalSlackDays ?? 0);
        const etat = t.status === "DONE" ? "Fini" : t.progressPercent > 0 || t.actualStartDate ? "Commencé" : "Non commencé";
        const cells = [
          taskCode(t),
          t.name,
          fr(v?.snapshot?.finishDate),
          fr(t.scheduledFinishDate),
          formatGap(toUnit(ecart), unitLabel),
          `${slack < 0 ? "−" : ""}${Math.abs(slack).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${unitLabel}`,
          `${Math.round(t.progressPercent)} %`,
          t.isCritical ? `${etat} · critique` : etat,
        ];
        cells.forEach((c, k) =>
          p.text(cols[k], y, c, 8, {
            color: k === 4 && ecart > 0 ? RED : k === 5 && slack < 0 ? RED : INK,
            bold: k === 4,
            maxWidth: k === 1 ? 262 : (cols[k + 1] ?? W - M) - cols[k] - 6,
          }),
        );
        p.line(M, y + 5, W - M, y + 5, "#f1efe8");
      });
      pages.push(p);
    }
  }

  return buildPdf(pages, { title: `Rapport Périodique de Pilotage du Temps — ${project.name}` });
}
