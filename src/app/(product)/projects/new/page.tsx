import { ProjectCreationWizard } from "@/features/projects/project-creation-wizard";
import { ProjectTemplateLauncher } from "@/features/projects/project-template-launcher";
import { listProjectTemplates } from "@/services/templates";
import { requireCurrentSession } from "@/services/auth";

export default async function NewProjectPage() {

  const templates = await listProjectTemplates((await requireCurrentSession()).workspaceId);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
      <div className="space-y-6">
        <ProjectCreationWizard />

        <ProjectTemplateLauncher templates={templates} />
      </div>

      {/* Panneau info — clair CheetahCost */}
      <aside className="panel-solid self-start overflow-hidden rounded-2xl">
        <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg, #56a45b, #f4a321)" }} />
        <div className="p-6">
          <div className="mb-4">
            <div className="section-label">Ce qui est créé</div>
            <h2 className="mt-1 text-[16px] font-black text-[#1a4a20]">Votre projet de planification</h2>
            <div className="mt-2.5 flex items-center gap-1.5">
              <div className="h-[2px] w-6 rounded-full" style={{ background: "#56a45b" }} />
              <div className="h-[2px] w-3 rounded-full" style={{ background: "#f4a321" }} />
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                label: "Planning calculé automatiquement",
                desc: "Les LT, leurs liens (FD, DD, FF, DF) et les délais ± produisent le Gantt et le réseau potentiel-tâches dès la création.",
              },
              {
                label: "Lots de Tâches & Tâches Hamac",
                desc: "Chaque LT porte durée, prédécesseurs, ressources et budget. Les TH regroupent les LT en synthèses (ex. Maçonnerie).",
              },
              {
                label: "Ressources & intensités",
                desc: "Calendrier 7 h/j lun→ven modifiable. Intensités à 2 décimales (0,25 chef de projet · 2,00 développeurs).",
              },
              {
                label: "Bilans B2P — méthode FGF",
                desc: "Dates de B2P générées par la règle FGF, communes à la coûtenance. PT (Provision de Temps) ajoutable à plusieurs moments, 9 au maximum.",
              },
            ].map(({ label, desc }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-xl p-3"
                style={{ background: "rgba(15,23,42,0.02)", border: "1px solid rgba(0,0,0,0.07)" }}
              >
                <div className="mt-1 flex shrink-0 items-center">
                  <div className="h-2 w-2 rounded-full" style={{ background: "#56a45b" }} />
                </div>
                <div>
                  <div className="text-[12.5px] font-bold text-slate-800">{label}</div>
                  <div className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-2.5 opacity-60">
            <div className="h-px flex-1 rounded-full" style={{ background: "rgba(86,164,91,0.4)" }} />
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">CheetahSoft</span>
            <div className="h-px flex-1 rounded-full" style={{ background: "rgba(244,163,33,0.4)" }} />
          </div>
        </div>
      </aside>
    </div>
  );
}
