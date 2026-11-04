import { getCurrentSession } from "@/services/auth";
import { notFound } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

import {
  buildBurndownCsv,
  buildGanttSvg,
  buildProjectReport,
  buildProjectXlsx,
  buildResourcesCsv,
  buildTasksCsv,
} from "@/services/reports";
import { buildTimeReportPdf } from "@/services/time-report";
import { exportProjectData, getProjectView, recordProjectExport } from "@/services/projects";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const view = await getProjectView(projectId).catch(() => notFound());
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const section = (url.searchParams.get("section") ?? "summary").toLowerCase();
  const baseName = view.aggregate.project.slug;

  if (format === "csv") {
    const body =
      section === "resources"
        ? buildResourcesCsv(view)
        : section === "burndown"
          ? buildBurndownCsv(view)
          : buildTasksCsv(view);
    return new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${baseName}-${section}.csv"`,
      },
    });
  }

  if (format === "xls" || format === "xlsx" || format === "excel" || format === "excel-html") {
    await recordProjectExport(projectId, "Export Excel", (await getCurrentSession())?.name);
    return new Response(new Uint8Array(buildProjectXlsx(view)), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${baseName}-pilotage-temps.xlsx"`,
      },
    });
  }

  // Rapport Périodique de Pilotage du Temps (commission / marché public).
  if (format === "pdf" || format === "soutenance" || format === "soutenance-pdf") {
    await recordProjectExport(projectId, "Export PDF — Rapport Périodique de Pilotage du Temps", (await getCurrentSession())?.name);
    return new Response(new Uint8Array(buildTimeReportPdf(view)), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${baseName}-rapport-pilotage-temps.pdf"`,
      },
    });
  }

  if (format === "svg" || format === "gantt-svg") {
    return new Response(buildGanttSvg(view), {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-disposition": `attachment; filename="${baseName}-gantt.svg"`,
      },
    });
  }

  if (format === "json-full") {
    return NextResponse.json(await exportProjectData(projectId));
  }

  return NextResponse.json(buildProjectReport(view));
}
