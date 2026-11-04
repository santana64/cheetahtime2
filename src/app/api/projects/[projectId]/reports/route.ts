import { notFound } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

import {
  buildBurndownCsv,
  buildExcelHtml,
  buildExcelXml,
  buildGanttSvg,
  buildProjectReport,
  buildResourcesCsv,
  buildSCurveSvg,
  buildSimplePdf,
  buildSoutenancePdf,
  buildTasksCsv,
} from "@/services/reports";
import { exportProjectData, getProjectView } from "@/services/projects";

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

  if (format === "xls" || format === "excel") {
    return new Response(buildExcelXml(view), {
      headers: {
        "content-type": "application/vnd.ms-excel; charset=utf-8",
        "content-disposition": `attachment; filename="${baseName}-rapport-complet.xls"`,
      },
    });
  }

  if (format === "excel-html") {
    return new Response(buildExcelHtml(view), {
      headers: {
        "content-type": "application/vnd.ms-excel; charset=utf-8",
        "content-disposition": `attachment; filename="${baseName}-rapport-html.xls"`,
      },
    });
  }

  if (format === "pdf") {
    const pdf = buildSimplePdf(view);
    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${baseName}-rapport.pdf"`,
      },
    });
  }

  if (format === "soutenance" || format === "soutenance-pdf") {
    const pdf = buildSoutenancePdf(view);
    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${baseName}-soutenance.pdf"`,
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

  if (format === "s-curve-svg" || format === "scurve-svg") {
    return new Response(buildSCurveSvg(view), {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-disposition": `attachment; filename="${baseName}-courbe-s.svg"`,
      },
    });
  }

  if (format === "json-full") {
    return NextResponse.json(await exportProjectData(projectId));
  }

  return NextResponse.json(buildProjectReport(view));
}
