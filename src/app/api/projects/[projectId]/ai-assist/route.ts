import { NextResponse, type NextRequest } from "next/server";
import { notFound } from "next/navigation";
import { getProjectView } from "@/services/projects";
import { buildSmartAlerts } from "@/services/smart-alerts";
import { calculateEarnedSchedule } from "@/services/advanced-planning";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const view = await getProjectView(projectId).catch(() => notFound());

  const body = await request.json().catch(() => ({}));
  const userMessage: string = body.message ?? "Analyse ce projet et donne-moi les priorités d'action.";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { reply: "Assistant IA non configuré — ajoutez ANTHROPIC_API_KEY dans vos variables d'environnement." },
      { status: 200 },
    );
  }

  // Build concise project context
  const alerts = buildSmartAlerts(view);
  const earnedSchedule = calculateEarnedSchedule(view);
  const criticalTasks = view.metrics.criticalTasks.slice(0, 6);
  const delayedTasks = view.tasks.filter(
    (t) => !t.isSummary && t.status !== "DONE" && t.scheduledFinishDate &&
      t.scheduledFinishDate < new Date().toISOString().slice(0, 10)
  ).slice(0, 6);

  const systemPrompt = `Tu es un assistant expert en planification de projet (MS Project, P6, FGF, BTP français).
Tu analyses des projets dans Cheetah Time (outil de planification professionnel de CheetahSoft).
Réponds toujours en français, de façon concise et actionnable — max 5 points si liste.
Contexte projet :
- Nom : ${view.aggregate.project.name}
- Client : ${view.aggregate.project.clientName}
- Avancement : ${(view.metrics.overallProgress * 100).toFixed(1)}%
- SPI_t : ${earnedSchedule.SPI_t?.toFixed(2) ?? "n/a"} | Glissement prédit : ${earnedSchedule.predictedSlip}j
- CPI : ${view.metrics.costPerformanceIndex?.toFixed(2) ?? "n/a"}
- Tâches critiques : ${criticalTasks.map((t) => t.name).join(", ") || "aucune"}
- Tâches en retard : ${delayedTasks.map((t) => t.name).join(", ") || "aucune"}
- Alertes actives (${alerts.length}) : ${alerts.slice(0, 4).map((a) => a.message).join(" | ")}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err);
    }

    const data = await response.json();
    const reply = (data.content?.[0]?.text ?? "Aucune réponse générée.") as string;
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("[ai-assist] Anthropic error:", error);
    return NextResponse.json(
      { reply: "Erreur lors de la communication avec l'assistant IA. Vérifiez votre clé ANTHROPIC_API_KEY." },
      { status: 200 },
    );
  }
}
