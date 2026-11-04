import { addCalendarDays, compareIsoDates } from "@/lib/planning/date-utils";
import { formatCurrency, formatDateLabel, formatPercent } from "@/lib/format/formatters";
import {
  buildProgressTrend,
  calculateEarnedSchedule,
  runMonteCarloSchedule,
} from "@/services/advanced-planning";
import { calculateBridgeCostImpact } from "@/services/cost-bridge";
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
  return {
    generatedAt: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    summary: [
      { label: "Projet", value: project.name },
      { label: "Client", value: project.clientName },
      { label: "Portefeuille", value: project.portfolio },
      { label: "Responsable", value: project.ownerName },
      { label: "Debut cible", value: formatDateLabel(project.targetStartDate) },
      { label: "Fin previsionnelle", value: formatDateLabel(view.schedule.projectFinishDate) },
      { label: "Avancement", value: formatPercent(view.metrics.overallProgress) },
      { label: "Budget", value: formatCurrency(project.budgetAmount, project.currencyCode) },
      { label: "Cout reel", value: formatCurrency(view.metrics.totalActualCost, project.currencyCode) },
      { label: "Taches critiques", value: String(view.metrics.criticalTaskCount) },
      { label: "Ressources surchargees", value: String(view.metrics.overloadedResourceCount) },
      { label: "SPI", value: view.metrics.schedulePerformanceIndex?.toFixed(2) ?? "n/a" },
      { label: "CPI", value: view.metrics.costPerformanceIndex?.toFixed(2) ?? "n/a" },
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

export function buildExcelHtml(view: ProjectView) {
  const report = buildProjectReport(view);
  const taskRows = view.tasks.map((task) => `
    <tr><td>${task.wbsCode}</td><td>${task.name}</td><td>${task.type}</td><td>${task.status}</td><td>${task.scheduledStartDate ?? ""}</td><td>${task.scheduledFinishDate ?? ""}</td><td>${task.progressPercent}</td><td>${task.isCritical ? "Oui" : "Non"}</td></tr>
  `).join("");
  const resourceRows = view.resourceSummaries.map((summary) => `
    <tr><td>${summary.resource.name}</td><td>${summary.resource.role}</td><td>${summary.maxAllocationPct}</td><td>${summary.overloadedWeeks}</td><td>${summary.totalActualCost}</td></tr>
  `).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>${report.projectName}</title></head>
<body>
<h1>${report.projectName}</h1>
<h2>Synthese</h2>
<table border="1">${report.summary.map((row) => `<tr><th>${row.label}</th><td>${row.value}</td></tr>`).join("")}</table>
<h2>Taches</h2>
<table border="1"><thead><tr><th>WBS</th><th>Nom</th><th>Type</th><th>Statut</th><th>Debut</th><th>Fin</th><th>Avancement</th><th>Critique</th></tr></thead><tbody>${taskRows}</tbody></table>
<h2>Ressources</h2>
<table border="1"><thead><tr><th>Ressource</th><th>Role</th><th>Charge max</th><th>Semaines surcharge</th><th>Cout reel</th></tr></thead><tbody>${resourceRows}</tbody></table>
</body></html>`;
}

function worksheetXml(name: string, rows: Array<Array<string | number | null | undefined>>) {
  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${rows
    .map(
      (row) =>
        `<Row>${row
          .map(
            (cell) =>
              `<Cell><Data ss:Type="${typeof cell === "number" ? "Number" : "String"}">${escapeXml(cell)}</Data></Cell>`,
          )
          .join("")}</Row>`,
    )
    .join("")}</Table></Worksheet>`;
}

export function buildExcelXml(view: ProjectView) {
  const report = buildProjectReport(view);
  const trends = buildProgressTrend(view);
  const baselineRows =
    view.activeBaseline?.snapshots.map((snapshot) => [
      snapshot.name,
      snapshot.startDate ?? "",
      snapshot.finishDate ?? "",
      snapshot.durationDays,
      snapshot.workHours,
      snapshot.plannedCost,
      snapshot.isCritical ? "Oui" : "Non",
    ]) ?? [];

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${worksheetXml("Synthese", [["Indicateur", "Valeur"], ...report.summary.map((row) => [row.label, row.value])])}
${worksheetXml("Planning", [
  ["WBS", "Nom", "Type", "Statut", "Debut", "Fin", "Duree", "Avancement", "Marge totale", "Critique"],
  ...view.tasks.map((task) => [
    task.wbsCode,
    task.name,
    task.type,
    task.status,
    task.scheduledStartDate ?? "",
    task.scheduledFinishDate ?? "",
    task.durationDays,
    task.progressPercent,
    task.totalSlackDays ?? "",
    task.isCritical ? "Oui" : "Non",
  ]),
])}
${worksheetXml("Ressources", [
  ["Ressource", "Role", "Type", "Charge max", "Semaines surcharge", "Cout planifie", "Cout reel"],
  ...view.resourceSummaries.map((summary) => [
    summary.resource.name,
    summary.resource.role,
    summary.resource.type,
    Math.round(summary.maxAllocationPct),
    summary.overloadedWeeks,
    summary.totalPlannedCost,
    summary.totalActualCost,
  ]),
])}
${worksheetXml("Baselines", [
  ["Tache", "Debut", "Fin", "Duree", "Charge", "Cout planifie", "Critique"],
  ...baselineRows,
])}
${worksheetXml("Courbe S", [
  ["Date", "Prevu %", "Realise %", "Forecast %", "PV", "EV", "Forecast finish"],
  ...trends.map((point) => [
    point.date,
    point.plannedProgress,
    point.actualProgress,
    point.forecastProgress,
    point.plannedCost,
    point.earnedValue,
    point.forecastFinish ?? "",
  ]),
])}
</Workbook>`;
}

export function buildSCurveSvg(view: ProjectView) {
  const width = 980;
  const height = 420;
  const padding = 56;
  const trends = buildProgressTrend(view);
  const points = trends.length ? trends : [{ date: "", plannedProgress: 0, actualProgress: 0, forecastProgress: 0 }];
  const x = (index: number) =>
    padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const y = (value: number) => height - padding - (value / 100) * (height - padding * 2);
  const path = (key: "plannedProgress" | "actualProgress" | "forecastProgress") =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point[key] ?? 0).toFixed(1)}`)
      .join(" ");
  const last = points[points.length - 1];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#fbfaf6"/>
  <text x="${padding}" y="32" font-family="Arial" font-size="20" font-weight="700" fill="#1a4a20">Courbe S - ${escapeXml(view.aggregate.project.name)}</text>
  ${[0, 25, 50, 75, 100].map((tick) => `<line x1="${padding}" x2="${width - padding}" y1="${y(tick)}" y2="${y(tick)}" stroke="#d6d3c8" stroke-width="1"/><text x="16" y="${y(tick) + 4}" font-family="Arial" font-size="11" fill="#64748b">${tick}%</text>`).join("")}
  <path d="${path("plannedProgress")}" fill="none" stroke="#94a3b8" stroke-width="3"/>
  <path d="${path("actualProgress")}" fill="none" stroke="#1a4a20" stroke-width="4"/>
  <path d="${path("forecastProgress")}" fill="none" stroke="#f4a321" stroke-width="3" stroke-dasharray="8 6"/>
  <circle cx="${x(points.length - 1)}" cy="${y(last.actualProgress ?? 0)}" r="6" fill="#1a4a20"/>
  <g font-family="Arial" font-size="12" fill="#334155">
    <text x="${padding}" y="${height - 18}">${escapeXml(points[0]?.date)}</text>
    <text x="${width - padding - 72}" y="${height - 18}">${escapeXml(last?.date)}</text>
    <text x="${width - 250}" y="54" fill="#94a3b8">Prevu</text>
    <text x="${width - 190}" y="54" fill="#1a4a20">Realise</text>
    <text x="${width - 120}" y="54" fill="#f4a321">Forecast</text>
  </g>
</svg>`;
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

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdfDocument(pages: string[][]) {
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    `2 0 obj << /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >> endobj`,
    "3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];

  pages.forEach((lines, index) => {
    const content = [
      "BT",
      "/F1 10 Tf",
      "42 800 Td",
      ...lines.slice(0, 42).flatMap((line, lineIndex) => [
        lineIndex === 0 ? "/F1 16 Tf" : lineIndex === 1 ? "/F1 12 Tf" : "/F1 9 Tf",
        `(${escapePdfText(line)}) Tj`,
        "0 -17 Td",
      ]),
      "ET",
    ].join("\n");
    const pageObjectNumber = 4 + index * 2;
    const contentObjectNumber = 5 + index * 2;
    objects.push(
      `${pageObjectNumber} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >> endobj`,
      `${contentObjectNumber} 0 obj << /Length ${Buffer.byteLength(content, "utf8")} >> stream\n${content}\nendstream endobj`,
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export function buildSimplePdf(view: ProjectView) {
  const report = buildProjectReport(view);
  const lines = [
    `Cheetah Time - Rapport projet`,
    report.projectName,
    `Genere le ${new Date(report.generatedAt).toLocaleString("fr-FR")}`,
    "",
    ...report.summary.map((row) => `${row.label}: ${row.value}`),
    "",
    "Taches critiques",
    ...report.criticalTasks.slice(0, 15).map((task) => `${task.wbsCode} ${task.name} - ${task.scheduledFinishDate ?? "n/a"}`),
    "",
    "Taches en retard / a risque",
    ...report.delayedTasks.slice(0, 15).map((task) => `${task.wbsCode} ${task.name} - ${task.scheduledFinishDate ?? "n/a"}`),
  ];

  const content = [
    "BT",
    "/F1 12 Tf",
    "50 780 Td",
    ...lines.flatMap((line, index) => [
      index === 0 ? "/F1 16 Tf" : index === 1 ? "/F1 14 Tf" : "/F1 10 Tf",
      `(${escapePdfText(line)}) Tj`,
      "0 -18 Td",
    ]),
    "ET",
  ].join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(content, "utf8")} >> stream\n${content}\nendstream endobj`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export function buildSoutenancePdf(view: ProjectView) {
  const project = view.aggregate.project;
  const earnedSchedule = calculateEarnedSchedule(view);
  const monteCarlo = runMonteCarloSchedule(view, undefined, 800);
  const costImpact = calculateBridgeCostImpact(view);
  const trends = buildProgressTrend(view);
  const currentTrend = trends[trends.length - 1];

  return buildPdfDocument([
    [
      "Cheetah Time - Rapport de soutenance",
      `${project.name} - ${project.clientName}`,
      `Marche: ${project.code} - Genere le ${new Date().toLocaleDateString("fr-FR")}`,
      `Avancement physique: ${formatPercent(view.metrics.overallProgress)}`,
      `Delai: fin previsionnelle ${formatDateLabel(view.schedule.projectFinishDate)} / contractuelle ${formatDateLabel(project.targetFinishDate)}`,
      `Cout: ${formatCurrency(view.metrics.totalActualCost, project.currencyCode)} consomme / budget ${formatCurrency(project.budgetAmount, project.currencyCode)}`,
      `Risque: ${view.metrics.derivedHealth}`,
      `PAF/Cost: impact glissement ${formatCurrency(costImpact.totalCostImpact, project.currencyCode)} (${costImpact.scheduleSlipDays} jour(s))`,
      "",
      "Feux tricolores par lot",
      ...view.tasks.slice(0, 22).map((task) => `${task.wbsCode} ${task.name}: ${task.isCritical ? "ROUGE" : task.progressPercent > 0 ? "ORANGE" : "VERT"}`),
    ],
    [
      "Page 2 - Planning reference vs actuel",
      `Baseline active: ${view.activeBaseline?.name ?? "Non capturee"}`,
      `Chemin critique: ${view.metrics.criticalTaskCount} tache(s)`,
      "",
      ...view.tasks
        .filter((task) => task.isCritical || task.type === "MILESTONE")
        .slice(0, 30)
        .map((task) => `${task.wbsCode} ${task.name} - ${formatDateLabel(task.scheduledStartDate)} -> ${formatDateLabel(task.scheduledFinishDate)}${task.isCritical ? " - CRITIQUE" : ""}`),
    ],
    [
      "Page 3 - Courbe S",
      `Prevu courant: ${currentTrend?.plannedProgress ?? 0}%`,
      `Realise courant: ${currentTrend?.actualProgress ?? 0}%`,
      `Forecast courant: ${currentTrend?.forecastProgress ?? 0}%`,
      `Earned Schedule: ${earnedSchedule.ES} semaine(s) / SPI_t ${earnedSchedule.SPI_t?.toFixed(2) ?? "n/a"}`,
      `IEAC_t: ${earnedSchedule.IEAC_t ?? "n/a"} - glissement predit ${earnedSchedule.predictedSlip} jour(s)`,
      `Monte Carlo P50: ${monteCarlo.p50 ?? "n/a"} / P80 client: ${monteCarlo.p80 ?? "n/a"} / P90: ${monteCarlo.p90 ?? "n/a"}`,
      "",
      ...trends.slice(-16).map((point) => `${point.date}: prevu ${point.plannedProgress}% / realise ${point.actualProgress}% / forecast ${point.forecastProgress}%`),
    ],
    [
      "Page 4 - Tableau des ecarts",
      "WBS - debut prevu / debut actuel / fin prevue / fin actuelle / ecart jours",
      ...view.tasks.slice(0, 32).map((task) => {
        const variance = view.baselineVarianceByTaskId[task.id];
        return `${task.wbsCode} ${task.name}: ${variance?.snapshot?.startDate ?? "-"} / ${task.scheduledStartDate ?? "-"} / ${variance?.snapshot?.finishDate ?? "-"} / ${task.scheduledFinishDate ?? "-"} / ${variance?.finishVarianceDays ?? 0}${task.isCritical ? " - CRITIQUE" : ""}`;
      }),
    ],
    [
      "Page 5 - Points d'alerte et actions",
      ...view.schedule.issues.slice(0, 14).map((issue) => `Alerte: ${issue.message}`),
      ...view.metrics.delayedTasks.slice(0, 14).map((task) => `Action: replanifier / traiter ${task.wbsCode} ${task.name}`),
      ...(view.schedule.issues.length || view.metrics.delayedTasks.length ? [] : ["Aucune alerte bloquante detectee."]),
    ],
    [
      "Page 6 - Ressources",
      "Charge realisee vs planifiee et conflits identifies",
      ...view.resourceSummaries.slice(0, 32).map((summary) => `${summary.resource.name}: charge max ${Math.round(summary.maxAllocationPct)}%, semaines surcharge ${summary.overloadedWeeks}, cout reel ${formatCurrency(summary.totalActualCost, project.currencyCode)}`),
    ],
  ]);
}
