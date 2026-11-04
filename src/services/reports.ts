import { addCalendarDays, compareIsoDates } from "@/lib/planning/date-utils";
import { formatCurrency, formatDateLabel, formatPercent } from "@/lib/format/formatters";
import { buildXlsx } from "@/lib/export/xlsx-writer";
import { computeDelayBanner, formatGap } from "@/lib/fgf/delay-banner";
import { fromWorkingDays, timeUnitShortLabel } from "@/lib/planning/time-unit";
import type { ProjectView, ScheduledTask } from "@/types/planning";

export interface BurndownPoint {
  date: string;
  plannedRemainingWorkHours: number;
  actualRemainingWorkHours: number;
  completedTaskCount: number;
}

export interface ProjectReportPayload {
  generatedAt: string;
  projectId: string;
  projectName: string;
  summary: Array<{ label: string; value: string }>;
  burndown: BurndownPoint[];
  criticalTasks: ScheduledTask[];
  delayedTasks: ScheduledTask[];
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvEscape).join(";"),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(";")),
  ].join("\n");
}

function taskPlannedWork(task: ScheduledTask) {
  return task.effortHours ?? task.durationDays * 8;
}

export function buildBurndown(view: ProjectView): BurndownPoint[] {
  const start = view.schedule.projectStartDate ?? view.aggregate.project.targetStartDate;
  const finish = view.schedule.projectFinishDate ?? view.aggregate.project.targetFinishDate ?? start;
  const totalPlanned = view.tasks
    .filter((task) => !task.isSummary)
    .reduce((sum, task) => sum + taskPlannedWork(task), 0);
  const points: BurndownPoint[] = [];

  let cursor = start;
  let guard = 0;
  while (compareIsoDates(cursor, finish) <= 0 && guard < 370) {
    const completedByDate = view.tasks.filter(
      (task) =>
        !task.isSummary &&
        task.scheduledFinishDate &&
        compareIsoDates(task.scheduledFinishDate, cursor) <= 0,
    );
    const plannedDone = completedByDate.reduce((sum, task) => sum + taskPlannedWork(task), 0);
    const actualDone = view.tasks
      .filter((task) => !task.isSummary)
      .reduce((sum, task) => sum + Math.min(task.actualWorkHours, taskPlannedWork(task)), 0);

    points.push({
      date: cursor,
      plannedRemainingWorkHours: Math.max(totalPlanned - plannedDone, 0),
      actualRemainingWorkHours: Math.max(totalPlanned - actualDone, 0),
      completedTaskCount: completedByDate.filter((task) => task.progressPercent >= 100 || task.status === "DONE").length,
    });

    cursor = addCalendarDays(cursor, 7);
    guard += 1;
  }

  return points;
}

export function buildProjectReport(view: ProjectView): ProjectReportPayload {
  const project = view.aggregate.project;
  const banner = computeDelayBanner(view);
  return {
    generatedAt: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    summary: [
      { label: "Projet", value: project.name },
      { label: "Maître d'ouvrage", value: project.clientName },
      { label: "Portefeuille", value: project.portfolio },
      { label: "Responsable", value: project.ownerName },
      { label: "Début", value: formatDateLabel(project.targetStartDate) },
      { label: "Fin Initiale (Fi)", value: formatDateLabel(banner.finInitiale) },
      { label: "Fin à Date (PàD)", value: formatDateLabel(banner.finADate) },
      { label: "Date actuelle", value: formatDateLabel(banner.dateActuelle) },
      { label: "Fin Prévisionnelle (FP)", value: formatDateLabel(banner.finPrevisionnelle) },
      { label: "Écart", value: formatGap(banner.ecart, banner.unitLabel) },
      { label: "Avancement", value: formatPercent(view.metrics.overallProgress) },
      { label: "Pilotage", value: banner.hasPI ? (banner.actionRequise ? "Action de pilotage requise" : "Action de pilotage non requise") : "PI non figé" },
      { label: "LT critiques", value: String(view.metrics.criticalTaskCount) },
      { label: "Ressources surchargées", value: String(view.metrics.overloadedResourceCount) },
    ],
    burndown: buildBurndown(view),
    criticalTasks: view.metrics.criticalTasks,
    delayedTasks: view.metrics.delayedTasks,
  };
}

export function buildTasksCsv(view: ProjectView) {
  return toCsv(
    view.tasks.map((task) => ({
      WBS: task.wbsCode,
      Nom: task.name,
      Type: task.type,
      Statut: task.status,
      Priorite: task.priority,
      Debut: task.scheduledStartDate ?? "",
      Fin: task.scheduledFinishDate ?? "",
      Duree: task.durationDays,
      Avancement: task.progressPercent,
      MargeTotale: task.totalSlackDays ?? "",
      MargeLibre: task.freeSlackDays ?? "",
      Critique: task.isCritical ? "Oui" : "Non",
    })),
  );
}

export function buildResourcesCsv(view: ProjectView) {
  return toCsv(
    view.resourceSummaries.map((summary) => ({
      Ressource: summary.resource.name,
      Role: summary.resource.role,
      Type: summary.resource.type,
      Disponibilite: summary.resource.availabilityPct,
      Taches: summary.assignedTaskCount,
      ChargeMax: summary.maxAllocationPct,
      SemainesSurcharge: summary.overloadedWeeks,
      CoutPlanifie: summary.totalPlannedCost,
      CoutReel: summary.totalActualCost,
    })),
  );
}

export function buildBurndownCsv(view: ProjectView) {
  return toCsv(
    buildBurndown(view).map((point) => ({
      Date: point.date,
      RestePlanifieHeures: point.plannedRemainingWorkHours,
      ResteReelHeures: point.actualRemainingWorkHours,
      TachesTerminees: point.completedTaskCount,
    })),
  );
}

export function buildProjectXlsx(view: ProjectView): Buffer {
  const banner = computeDelayBanner(view);
  const unit = view.aggregate.project.timeUnit ?? "jours";
  const unitLabel = timeUnitShortLabel(unit);
  const toUnit = (days: number) => fromWorkingDays(days, unit, view.aggregate.calendar.hoursPerDay);
  const snaps = view.aggregate.project.b2pSnapshots ?? {};
  return buildXlsx(
    [
      {
        name: "Synthèse",
        widths: [34, 40],
        rows: [
          ["Indicateur", "Valeur"],
          ["Projet", view.aggregate.project.name],
          ["Maître d'ouvrage", view.aggregate.project.clientName],
          ["Unité de temps", unit],
          ["Fin Initiale (Fi)", banner.finInitiale ?? ""],
          ["Fin à Date (PàD)", banner.finADate ?? ""],
          ["Date actuelle (date d'état)", banner.dateActuelle],
          ["Fin Prévisionnelle (FP)", banner.finPrevisionnelle ?? ""],
          [`Écart FP − PàD (${unitLabel})`, banner.ecart ?? ""],
          ["Avancement (%)", banner.avancement],
          ["Pilotage", banner.hasPI ? (banner.actionRequise ? "Action de pilotage requise" : "Action de pilotage non requise") : "PI non figé"],
          ["LT critiques", view.metrics.criticalTaskCount],
        ],
      },
      {
        name: "Planning",
        widths: [10, 12, 44, 14, 14, 14, 12, 12, 14, 14, 10],
        rows: [
          ["WBS", "Code", "Lot de tâches", "Type", "Début", "Fin", `Durée (${unitLabel})`, "Avancement (%)", `Marge totale (${unitLabel})`, `Marge libre (${unitLabel})`, "Critique"],
          ...view.tasks.map((t) => [
            t.wbsCode,
            t.code ?? "",
            t.name,
            t.isSummary ? "Tâche hamac" : t.type === "MILESTONE" ? "Jalon" : "LT",
            t.scheduledStartDate ?? "",
            t.scheduledFinishDate ?? "",
            toUnit(t.durationDays),
            Math.round(t.progressPercent),
            t.totalSlackUnits ?? toUnit(t.totalSlackDays ?? 0),
            t.freeSlackUnits ?? toUnit(t.freeSlackDays ?? 0),
            t.isCritical ? "Oui" : t.isPseudoCritical ? "Pseudo" : "Non",
          ]),
        ],
      },
      {
        name: "Écarts au PI",
        widths: [12, 44, 14, 14, 14, 14, 14],
        rows: [
          ["Code", "Lot de tâches", "Début PI", "Fin PI", "Début prévu", "Fin prévue", `Écart de fin (${unitLabel})`],
          ...view.tasks
            .filter((t) => !t.isSummary)
            .map((t) => {
              const v = view.baselineVarianceByTaskId[t.id];
              return [
                t.code ?? t.wbsCode,
                t.name,
                v?.snapshot?.startDate ?? "",
                v?.snapshot?.finishDate ?? "",
                t.scheduledStartDate ?? "",
                t.scheduledFinishDate ?? "",
                toUnit(v?.finishVarianceDays ?? 0),
              ];
            }),
        ],
      },
      {
        name: "Tableaux B2P",
        widths: [14, 16, 16, 14, 14, 30],
        rows: [
          ["B2P", "Fin à date", "FP", `Écart (${unitLabel})`, "Avancement (%)", "Pilotage"],
          ...Object.values(snaps)
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((s) => [s.date, s.finADate ?? "", s.finPrevisionnelle ?? "", s.ecart ?? "", s.avancement, s.actionRequise ? "Action requise" : "Non requise"]),
        ],
      },
      {
        name: "Ressources",
        widths: [30, 20, 14, 18],
        rows: [
          ["Ressource", "Rôle", "Charge max (%)", "Semaines en surcharge"],
          ...view.resourceSummaries.map((r) => [r.resource.name, r.resource.role, Math.round(r.maxAllocationPct), r.overloadedWeeks]),
        ],
      },
    ],
    `Cheetah Time — ${view.aggregate.project.name}`,
  );
}

export function buildGanttSvg(view: ProjectView) {
  const rowHeight = 28;
  const left = 210;
  const width = 1180;
  const height = Math.max(240, 70 + view.tasks.length * rowHeight);
  const projectStart = view.schedule.projectStartDate ?? view.aggregate.project.targetStartDate;
  const projectFinish = view.schedule.projectFinishDate ?? view.aggregate.project.targetFinishDate ?? projectStart;
  const totalDays = Math.max(1, Math.round((Date.parse(projectFinish) - Date.parse(projectStart)) / 86_400_000));
  const xForDate = (date?: string | null) =>
    left + (((date ? Math.max(0, Date.parse(date) - Date.parse(projectStart)) / 86_400_000 : 0) / totalDays) * (width - left - 40));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#fbfaf6"/>
  <text x="24" y="34" font-family="Arial" font-size="20" font-weight="700" fill="#1a4a20">Gantt baseline vs actuel - ${escapeXml(view.aggregate.project.name)}</text>
  <line x1="${left}" x2="${width - 40}" y1="52" y2="52" stroke="#cbd5e1"/>
  ${view.tasks
    .map((task, index) => {
      const y = 70 + index * rowHeight;
      const start = xForDate(task.scheduledStartDate);
      const finish = Math.max(start + 4, xForDate(task.scheduledFinishDate));
      const baseline = view.baselineVarianceByTaskId[task.id]?.snapshot;
      const baselineStart = xForDate(baseline?.startDate);
      const baselineFinish = Math.max(baselineStart + 4, xForDate(baseline?.finishDate));
      return `<text x="24" y="${y + 15}" font-family="Arial" font-size="11" fill="#334155">${escapeXml(task.wbsCode)} ${escapeXml(task.name).slice(0, 48)}</text>
      ${baseline ? `<rect x="${baselineStart}" y="${y + 4}" width="${baselineFinish - baselineStart}" height="7" rx="3" fill="#cbd5e1"/>` : ""}
      <rect x="${start}" y="${y + 12}" width="${finish - start}" height="${task.type === "MILESTONE" ? 4 : 10}" rx="4" fill="${task.isCritical ? "#dc2626" : "#1a4a20"}"/>
      ${task.type === "MILESTONE" ? `<polygon points="${finish},${y + 6} ${finish + 7},${y + 13} ${finish},${y + 20} ${finish - 7},${y + 13}" fill="#f4a321"/>` : ""}`;
    })
    .join("")}
</svg>`;
}

