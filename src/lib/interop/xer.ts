import type { ImportedProjectDocument } from "@/lib/interop/mspdi";
import type { Dependency, Resource, ScheduledTask } from "@/types/planning";

type XerRow = Record<string, string>;

function parseXerTables(content: string) {
  const tables = new Map<string, XerRow[]>();
  let currentTable: string | null = null;
  let fields: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const parts = line.split("\t");
    const marker = parts[0];

    if (marker === "%T") {
      currentTable = parts[1] ?? null;
      fields = [];
      if (currentTable && !tables.has(currentTable)) tables.set(currentTable, []);
      continue;
    }

    if (marker === "%F") {
      fields = parts.slice(1);
      continue;
    }

    if (marker === "%R" && currentTable && fields.length) {
      const row: XerRow = {};
      for (const [index, field] of fields.entries()) {
        row[field] = parts[index + 1] ?? "";
      }
      tables.get(currentTable)?.push(row);
    }
  }

  return tables;
}

function toIsoDate(value?: string | null) {
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function parseNumber(value: unknown, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapDependencyType(value?: string): Dependency["type"] {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized.includes("SS")) return "SS";
  if (normalized.includes("FF")) return "FF";
  if (normalized.includes("SF")) return "SF";
  return "FS";
}

function mapTaskType(row: XerRow): ScheduledTask["type"] {
  const type = String(row.task_type ?? row.actv_type ?? "").toUpperCase();
  if (type.includes("MILESTONE") || type.includes("TT_MILE")) return "MILESTONE";
  if (type.includes("WBS") || type.includes("SUMMARY")) return "SUMMARY";
  return "TASK";
}

function mapResourceType(row: XerRow): Resource["type"] {
  const type = String(row.rsrc_type ?? "").toUpperCase();
  if (type.includes("EQUIP")) return "EQUIPMENT";
  if (type.includes("TEAM") || type.includes("CREW")) return "TEAM";
  return "PERSON";
}

export function isXerFileName(fileName: string) {
  return fileName.toLowerCase().endsWith(".xer");
}

export function parseXerFile(content: string): ImportedProjectDocument {
  const tables = parseXerTables(content);
  const project = tables.get("PROJECT")?.[0] ?? {};
  const taskRows = tables.get("TASK") ?? [];
  const wbsRows = tables.get("PROJWBS") ?? [];
  const resourceRows = tables.get("RSRC") ?? [];
  const assignmentRows = tables.get("TASKRSRC") ?? [];
  const predecessorRows = tables.get("TASKPRED") ?? [];
  const warnings: string[] = [];
  const taskIdByWbs = new Map(wbsRows.map((row) => [row.wbs_id, row.parent_wbs_id || ""]));
  const projectStart =
    toIsoDate(project.plan_start_date) ??
    toIsoDate(project.last_recalc_date) ??
    new Date().toISOString().slice(0, 10);

  const tasks: ImportedProjectDocument["tasks"] = taskRows.map((row, index) => {
    const type = mapTaskType(row);
    const durationHours =
      parseNumber(row.target_drtn_hr_cnt, NaN) ||
      parseNumber(row.remain_drtn_hr_cnt, NaN) ||
      parseNumber(row.orig_drtn_hr_cnt, 8);
    const percent = Math.round(parseNumber(row.phys_complete_pct, 0));
    return {
      uid: row.task_id || String(index + 1),
      parentUid: taskIdByWbs.get(row.wbs_id) || null,
      sortOrder: index,
      name: row.task_name || row.task_code || `XER task ${index + 1}`,
      description: row.task_code ? `Primavera activity ${row.task_code}` : "",
      notes: row.status_code ? `Primavera status: ${row.status_code}` : "",
      type,
      status:
        percent >= 100
          ? "DONE"
          : toIsoDate(row.act_start_date) || percent > 0
            ? "IN_PROGRESS"
            : "NOT_STARTED",
      priority: "MEDIUM",
      progressPercent: Math.max(0, Math.min(percent, 100)),
      durationDays: type === "MILESTONE" ? 0 : Math.max(1, Math.round(durationHours / 8)),
      schedulingMode: toIsoDate(row.target_start_date) ? "MANUAL" : "AUTO",
      workFormula: "FIXED_DURATION",
      effortHours: type === "MILESTONE" ? 0 : durationHours,
      calendarMode: "PROJECT",
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      constraintType: toIsoDate(row.target_start_date) ? "START_NO_EARLIER_THAN" : "ASAP",
      constraintDate: toIsoDate(row.target_start_date),
      deadlineDate: toIsoDate(row.deadline_date),
      levelingDelayDays: 0,
      levelingPriority: 500,
      manualStartDate: toIsoDate(row.target_start_date) ?? toIsoDate(row.early_start_date),
      manualFinishDate: toIsoDate(row.target_end_date) ?? toIsoDate(row.early_end_date),
      actualStartDate: toIsoDate(row.act_start_date),
      actualFinishDate: toIsoDate(row.act_end_date),
      actualWorkHours: parseNumber(row.act_work_qty, 0),
      remainingWorkHours: parseNumber(row.remain_work_qty, Math.max(durationHours * (1 - percent / 100), 0)),
    };
  });

  const taskUidSet = new Set(tasks.map((task) => task.uid));
  const dependencies: ImportedProjectDocument["dependencies"] = predecessorRows
    .map((row) => ({
      predecessorProjectId: "imported-project",
      predecessorTaskUid: row.pred_task_id,
      successorProjectId: "imported-project",
      successorTaskUid: row.task_id,
      type: mapDependencyType(row.pred_type),
      lagDays: Math.round(parseNumber(row.lag_hr_cnt, 0) / 8),
      label: "Primavera XER",
    }))
    .filter((dependency) => {
      const valid = taskUidSet.has(dependency.predecessorTaskUid) && taskUidSet.has(dependency.successorTaskUid);
      if (!valid) warnings.push(`Lien XER ignore: ${dependency.predecessorTaskUid} -> ${dependency.successorTaskUid}`);
      return valid;
    });

  const resources: ImportedProjectDocument["resources"] = resourceRows
    .filter((row) => row.rsrc_id && (row.rsrc_name || row.rsrc_short_name))
    .map((row, index) => ({
      uid: row.rsrc_id || String(index + 1),
      name: row.rsrc_name || row.rsrc_short_name || `XER resource ${index + 1}`,
      role: row.role_id || row.rsrc_short_name || "Primavera",
      type: mapResourceType(row),
      location: row.location_id || "Imported XER",
      availabilityPct: 100,
      capacityHoursPerDay: 8,
      calendarWorkingDays: [],
      calendarHoursPerDay: null,
      calendarExceptions: [],
      costRate: parseNumber(row.cost_qty_link_flag, 0) ? parseNumber(row.price_per_unit, 0) : parseNumber(row.price_per_unit, 0),
      color: ["#1a4a20", "#56a45b", "#f4a321", "#0f766e"][index % 4],
    }));

  const resourceUidSet = new Set(resources.map((resource) => resource.uid));
  const assignments: ImportedProjectDocument["assignments"] = assignmentRows
    .map((row, index) => ({
      uid: row.taskrsrc_id || `xer-assignment-${index + 1}`,
      taskUid: row.task_id,
      resourceUid: row.rsrc_id,
      allocationPct: 100,
      notes: row.role_id ? `Role Primavera: ${row.role_id}` : "",
    }))
    .filter((assignment) => taskUidSet.has(assignment.taskUid) && resourceUidSet.has(assignment.resourceUid));

  if (!tasks.length) {
    throw new Error("XER import failed: no TASK rows were found.");
  }

  return {
    sourceFormat: "xer",
    project: {
      name: project.proj_short_name || project.proj_name || "Primavera XER import",
      code: project.proj_short_name || "XER",
      clientName: "Imported Primavera",
      ownerName: "XER Import",
      sponsorName: "XER Import",
      portfolio: "Primavera",
      description: "Projet importe depuis un fichier Primavera P6 XER.",
      status: "PLANNING",
      health: "ON_TRACK",
      targetStartDate: projectStart,
      targetFinishDate: toIsoDate(project.scd_end_date) ?? toIsoDate(project.finish_date),
      budgetAmount: 0,
      currencyCode: "EUR",
      levelingStrategy: "PRIORITY_THEN_SLACK",
      levelingMaxDelayDays: 30,
    },
    calendar: {
      name: "Calendrier Primavera XER",
      timezone: "Europe/Paris",
      workingDays: [1, 2, 3, 4, 5],
      hoursPerDay: 8,
      exceptions: [],
    },
    tasks,
    dependencies,
    resources,
    assignments,
    timesheetEntries: [],
    actualCostEntries: [],
    baselines: [],
    warnings,
  };
}
