import {
  createProject,
  listProjectViews,
} from "@/services/projects";
import {
  getNumber,
  getString,
  jsonErrorFromUnknown,
  jsonResponse,
  parseJsonBody,
} from "@/lib/api/route-utils";
import { getPersistenceInfo } from "@/services/project-store";

export async function GET() {
  try {
    const views = await listProjectViews();
    const activeCount = views.filter((view) => !view.aggregate.project.archivedAt).length;
    const archivedCount = views.length - activeCount;
    const persistence = getPersistenceInfo();

    return jsonResponse({
      portfolio: {
        activeCount,
        archivedCount,
        generatedAt: new Date().toISOString(),
      },
      persistence,
      projects: views.map((view) => ({
        project: view.aggregate.project,
        metrics: view.metrics,
        schedule: {
          projectStartDate: view.schedule.projectStartDate,
          projectFinishDate: view.schedule.projectFinishDate,
          issueCount: view.schedule.issues.length,
        },
        counts: {
          tasks: view.tasks.length,
          resources: view.aggregate.resources.length,
          assignments: view.aggregate.assignments.length,
          baselines: view.aggregate.baselines.length,
        },
      })),
    });
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to load projects.", 400);
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const projectId = await createProject({
      name: getString(body, "name"),
      clientName: getString(body, "clientName"),
      ownerName: getString(body, "ownerName"),
      sponsorName: getString(body, "sponsorName"),
      portfolio: getString(body, "portfolio"),
      targetStartDate: getString(body, "targetStartDate"),
      targetFinishDate: getString(body, "targetFinishDate", false),
      budgetAmount: getNumber(body, "budgetAmount", 0),
      currencyCode: getString(body, "currencyCode"),
    });

    return jsonResponse({ projectId }, 201);
  } catch (error) {
    return jsonErrorFromUnknown(error, "Unable to create project.", 400);
  }
}
