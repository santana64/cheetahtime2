import { jsonError, jsonErrorFromUnknown, jsonResponse } from "@/lib/api/route-utils";
import { parseMspdiXml } from "@/lib/interop/mspdi";
import {
  convertProjectFileToMspdiXml,
  isMppFileName,
} from "@/lib/interop/mpp-bridge";
import { isXerFileName, parseXerFile } from "@/lib/interop/xer";
import { importProjectDocument } from "@/services/projects";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let fileName = "import.xml";
    let importedBy = "Project Interop";
    let content: Buffer;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return jsonError("Import requests must include a file field.", 400);
      }

      fileName = file.name || fileName;
      importedBy =
        (typeof formData.get("importedBy") === "string" &&
        String(formData.get("importedBy")).trim()
          ? String(formData.get("importedBy")).trim()
          : importedBy);
      content = Buffer.from(await file.arrayBuffer());
    } else {
      const url = new URL(request.url);
      fileName = url.searchParams.get("fileName")?.trim() || fileName;
      importedBy = url.searchParams.get("importedBy")?.trim() || importedBy;
      content = Buffer.from(await request.arrayBuffer());
    }

    const document = isXerFileName(fileName)
      ? parseXerFile(content.toString("utf8"))
      : parseMspdiXml(
          await convertProjectFileToMspdiXml(fileName, content),
          isMppFileName(fileName) ? "mpp" : "mspdi",
        );
    const imported = await importProjectDocument(document, importedBy);

    return jsonResponse(
      {
        projectId: imported.projectId,
        sourceFormat: document.sourceFormat,
        warningCount: imported.warnings.length,
        warnings: imported.warnings,
      },
      201,
    );
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to import project file.", 400);
  }
}
