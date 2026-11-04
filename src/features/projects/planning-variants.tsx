import {
  activateBaselineAction,
  captureBaselineAction,
} from "@/features/projects/actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/app/ui-kit";
import type { ProjectView } from "@/types/planning";

/**
 * Variantes de planning P01 → P99 (spec François, demande #10).
 *
 * Chaque variante est un instantané du planning (une « baseline »). La variante
 * ACTIVE est le **Planning Initial (PI)** retenu : c'est elle qui date la fin
 * initiale et les B2P, et qui débloque le Pilotage du Temps. On peut élaborer
 * plusieurs variantes puis en désigner une comme PI à tout moment.
 */

/** Prochain libellé de variante « P0N » à partir des noms existants. */
function nextVariantLabel(names: string[]): string {
  let max = 0;
  for (const name of names) {
    const m = name.match(/\bP0*(\d{1,2})\b/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const next = Math.min(99, max + 1);
  return `P${String(next).padStart(2, "0")}`;
}

export function PlanningVariants({ view }: { view: ProjectView }) {
  const projectId = view.aggregate.project.id;
  const baselines = view.aggregate.baselines ?? [];
  const activeId = view.activeBaseline?.id ?? null;
  const nextLabel = nextVariantLabel(baselines.map((b) => b.name));
  const today = new Date().toLocaleDateString("fr-FR");
  const capturedBy = view.aggregate.project.ownerName || "Cheetah Time";

  return (
    <Panel
      title="Planning Initial & variantes (P01 → P99)"
      subtitle="Élaborez plusieurs variantes de planning, puis désignez-en une comme Planning Initial (PI). Le PI date la fin initiale et les B2P, et débloque le Pilotage du Temps."
      accent="linear-gradient(90deg,#56a45b,#f4a321)"
      actions={
        <form action={captureBaselineAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="baselineName" value={`${nextLabel} — Variante du ${today}`} />
          <input type="hidden" name="capturedBy" value={capturedBy} />
          <Button type="submit">Enregistrer la variante {nextLabel}</Button>
        </form>
      }
      bodyClassName="space-y-2"
    >
      {baselines.length === 0 ? (
        <p className="text-[13px] leading-5 text-slate-600">
          Aucune variante enregistrée. Ajustez le planning ci-dessous (LT, liens, ressources, dates),
          puis cliquez sur <strong>« Enregistrer la variante {nextLabel} »</strong>. La première variante
          enregistrée devient automatiquement le <strong>Planning Initial (PI)</strong>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-1">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                <th className="px-3 py-1.5">Variante</th>
                <th className="px-3 py-1.5">Enregistrée le</th>
                <th className="px-3 py-1.5">LT figés</th>
                <th className="px-3 py-1.5">Statut</th>
                <th className="px-3 py-1.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {baselines.map((b) => {
                const isPI = b.id === activeId;
                return (
                  <tr
                    key={b.id}
                    className="rounded-xl"
                    style={{ background: isPI ? "rgba(86,164,91,0.08)" : "rgba(15,23,42,0.025)" }}
                  >
                    <td className="rounded-l-xl px-3 py-2.5 text-sm font-semibold text-slate-800">{b.name}</td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-500">
                      {new Date(b.capturedAt).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-500">{b.snapshots.length} LT</td>
                    <td className="px-3 py-2.5">
                      {isPI ? (
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
                          style={{ background: "rgba(86,164,91,0.16)", color: "#1a4a20", border: "1px solid rgba(86,164,91,0.32)" }}
                        >
                          Planning Initial (PI)
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
                          style={{ background: "rgba(15,23,42,0.05)", color: "rgba(15,23,42,0.45)", border: "1px solid rgba(15,23,42,0.10)" }}
                        >
                          Variante
                        </span>
                      )}
                    </td>
                    <td className="rounded-r-xl px-3 py-2.5 text-right">
                      {isPI ? (
                        <span className="text-[12px] text-slate-400">— PI actuel —</span>
                      ) : (
                        <form action={activateBaselineAction} className="inline">
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="baselineId" value={b.id} />
                          <Button type="submit" variant="outline" size="sm">
                            Désigner comme PI
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
