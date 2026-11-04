import { buildPdf, PdfPage, textWidth } from "@/lib/export/pdf-writer";
import { formatGap } from "@/lib/fgf/delay-banner";
import { getModeleSectionTitres, getRapportDelaiLabel, getRapportStatutLabel } from "@/lib/fgf/rapports-delai";
import { aggregateT2P, getT2PLabel, lineEcart, t2pUnitLabel } from "@/lib/fgf/t2p";
import { formatDateLabel } from "@/lib/format/formatters";
import { buildTimeReportPages, pageFrame } from "@/services/time-report";
import type { ProjectView, RapportDelai } from "@/types/planning";

/**
 * PDF du rapport de délai R2Pi — même plan que le PDF du rapport de coût de
 * Cheetah Cost : en-tête (projet, R2Pi, référence, auteur, statut), les cinq
 * sections, puis les annexes : A.1 tableau T2P, A.2 double planning et
 * diagramme Temps/Temps (à la place des Courbes en S, exclues côté délai).
 */

const W = 842;
const H = 595;
const M = 36;
const INK = "#0f172a";
const MUTED = "#64748b";
const GREEN_DEEP = "#1a4a20";

function wrap(text: string, maxWidth: number, size: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const indent = raw.match(/^\s*/)?.[0] ?? "";
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = indent;
    for (const word of words) {
      const candidate = line.trim() ? `${line} ${word}` : `${indent}${word}`;
      if (textWidth(candidate, size) > maxWidth && line.trim()) {
        out.push(line);
        line = `${indent}${word}`;
      } else line = candidate;
    }
    out.push(line);
  }
  return out;
}

export function buildRapportDelaiPdf(view: ProjectView, rapport: RapportDelai | null): Buffer {
  const project = view.aggregate.project;
  const label = rapport ? getRapportDelaiLabel(rapport.numero) : "R2P — modèle vierge";
  const title = `${label} — Rapport de délai`;
  const pages: PdfPage[] = [];
  let page = new PdfPage(W, H);
  let y = 0;
  const newPage = () => {
    page = new PdfPage(W, H);
    pageFrame(page, title, view, pages.length + 1);
    pages.push(page);
    y = 56;
  };
  newPage();

  page.text(M, 70, project.name, 18, { bold: true, color: INK, maxWidth: W - 2 * M });
  page.text(M, 88, `Rapport de Pilotage de Projet — partie délai · ${label}`, 11, { color: GREEN_DEEP, bold: true });
  if (rapport) {
    page.text(
      M,
      104,
      `Référence : ${rapport.reference || "—"} · Auteur : ${rapport.auteur || "—"} · Statut : ${getRapportStatutLabel(rapport.statut)}${
        rapport.diffuseLe ? ` le ${formatDateLabel(rapport.diffuseLe.slice(0, 10))}` : ""
      }`,
      9,
      { color: MUTED, maxWidth: W - 2 * M },
    );
  }
  y = 126;

  const sections = rapport?.sections ?? getModeleSectionTitres().map((titre, i) => ({ id: String(i), titre, contenu: "" }));
  for (const section of sections) {
    if (y > H - 80) newPage();
    page.text(M, y, section.titre, 12, { bold: true, color: GREEN_DEEP });
    y += 18;
    const lines = wrap(section.contenu || (rapport ? "—" : "………………………………………………"), W - 2 * M, 9.5);
    for (const line of lines) {
      if (y > H - 36) newPage();
      page.text(M + 4, y, line, 9.5, { color: INK });
      y += 13;
    }
    y += 10;
  }

  // ── Annexes ──
  const table = rapport ? (project.t2pTables ?? []).find((t) => t.id === rapport.t2pId) ?? null : null;
  if (table) {
    newPage();
    const unit = t2pUnitLabel(table.unit);
    const agg = aggregateT2P(table, view.aggregate.calendar);
    page.text(M, 64, `Annexe A.1 — Tableau ${getT2PLabel(table)} du ${formatDateLabel(table.date)}`, 12, { bold: true, color: GREEN_DEEP });
    page.text(M, 80, `FP ${formatDateLabel(agg.finPrevue)} · Écart ${formatGap(agg.ecart, unit)} · Avancement ${agg.avancement} %`, 9, { color: MUTED });
    const cols = [M, M + 50, M + 300, M + 380, M + 460, M + 520, M + 590, M + 670];
    ["Code", "Lot de tâches", "Fi", "PàD", "Avanc.", "RàF", "FP", "Écart"].forEach((h, i) => page.text(cols[i], 100, h.toUpperCase(), 7, { bold: true, color: MUTED }));
    let ty = 116;
    for (const line of table.lignes) {
      if (ty > H - 40) {
        newPage();
        ty = 70;
      }
      const e = table.tableKind === "b2p0" ? 0 : lineEcart(line, table.unit, view.aggregate.calendar);
      [line.code, line.libelle, formatDateLabel(line.finInitiale), formatDateLabel(line.finADate), `${line.avancement} %`, `${line.resteAFaire.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${unit}`, formatDateLabel(line.finPrevue), formatGap(e, unit)].forEach((c, i) =>
        page.text(cols[i], ty, c, 8, { color: i === 7 && e > 0 ? "#be123c" : INK, bold: i === 7, maxWidth: (cols[i + 1] ?? W - M) - cols[i] - 6 }),
      );
      ty += 15;
    }
    pages.push(...buildTimeReportPages(view, ["planning", "tempsTemps"], pages.length));
  }

  return buildPdf(pages, { title: `${title} — ${project.name}` });
}
