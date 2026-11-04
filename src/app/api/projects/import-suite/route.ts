import { jsonError, jsonErrorFromUnknown, jsonResponse } from "@/lib/api/route-utils";
import { importSuiteProject } from "@/services/projects";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let text = "";
    let importedBy = "Import suite";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (file instanceof File) {
        text = await file.text();
      } else if (typeof formData.get("content") === "string") {
        text = String(formData.get("content"));
      }
      if (typeof formData.get("importedBy") === "string" && String(formData.get("importedBy")).trim()) {
        importedBy = String(formData.get("importedBy")).trim();
      }
    } else {
      text = await request.text();
    }

    if (!text.trim()) {
      return jsonError("Le fichier projet de la suite est vide.", 400);
    }

    const imported = await importSuiteProject(text, importedBy);
    return jsonResponse(imported, 201);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to import suite project file.", 400);
  }
}
