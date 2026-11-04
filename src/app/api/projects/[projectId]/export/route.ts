import { buildMspdiXml } from "@/lib/interop/mspdi";
import {
  convertMspdiXmlToMpp,
  supportsNativeMppExport,
} from "@/lib/interop/mpp-bridge";
import { jsonErrorFromUnknown } from "@/lib/api/route-utils";
import { exportProjectData } from "@/services/projects";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const payload = await exportProjectData(projectId);
    const format = new URL(request.url).searchParams.get("format");

    if (format === "xml" || format === "mspdi") {
      const xml = buildMspdiXml(payload);
      return new Response(xml, {
        status: 200,
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "content-disposition": `attachment; filename="${payload.project.slug}.xml"`,
        },
      });
    }

    if (format === "mpp") {
      const xml = buildMspdiXml(payload);
      if (!supportsNativeMppExport()) {
        return new Response(xml, {
          status: 200,
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "content-disposition": `attachment; filename="${payload.project.slug}.mspdi.xml"`,
            "x-cheetah-time-native-mpp-export": "unsupported-open-source-bridge",
            "x-cheetah-time-recommended-format": "mspdi",
          },
        });
      }

      const mpp = await convertMspdiXmlToMpp(payload.project.slug, xml);

      return new Response(mpp, {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="${payload.project.slug}.mpp"`,
        },
      });
    }

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${payload.project.slug}.json"`,
      },
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to export project.", 400);
  }
}
