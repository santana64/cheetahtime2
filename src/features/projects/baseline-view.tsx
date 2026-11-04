import {
  activateBaselineAction,
  captureBaselineAction,
} from "@/features/projects/actions";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateLabel } from "@/lib/format/formatters";
import type { ProjectView } from "@/types/planning";

function formatHours(value?: number | null) {
  const normalized = Math.round((value ?? 0) * 100) / 100;
  return `${Number.isInteger(normalized) ? normalized.toFixed(0) : normalized.toFixed(2)}h`;
}

function MetricCard({
  label,
  value,
  sub,
  accent,
  delay,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "orange" | "red";
  delay?: number;
}) {
  const accentColor =
    accent === "orange"
      ? "#f4a321"
      : accent === "red"
        ? "#e55353"
        : "#56a45b";

  return (
    <div
      className="relative overflow-hidden rounded-xl animate-velocity-enter"
      style={{
        background: "white",
        border: "1px solid rgba(86,164,91,0.15)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        animationDelay: delay ? `${delay}ms` : undefined,
      }}
    >
      <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)` }} />
      <div className="p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(0,0,0,0.40)" }}>
          {label}
        </div>
        <div className="mt-2 text-2xl font-black tracking-tight" style={{ color: "#0d1f10", letterSpacing: "-0.02em" }}>
          {value}
        </div>
        {sub && (
          <div className="mt-1 text-[11px] leading-snug" style={{ color: "rgba(0,0,0,0.45)" }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

export function BaselineView({ view }: { view: ProjectView }) {
  const varianceRows = view.tasks
    .filter((task) => !task.isSummary)
    .map((task) => ({
      task,
      variance: view.baselineVarianceByTaskId[task.id],
    }));
  const slippedTasks = varianceRows.filter(
    ({ variance }) => (variance?.finishVarianceDays ?? 0) > 0,
  ).length;
  const aheadTasks = varianceRows.filter(
    ({ variance }) => (variance?.finishVarianceDays ?? 0) < 0,
  ).length;
  const stableTasks = varianceRows.filter(
    ({ variance }) =>
      (variance?.startVarianceDays ?? 0) === 0 &&
      (variance?.finishVarianceDays ?? 0) === 0,
  ).length;
  const criticalSlips = varianceRows.filter(
    ({ task, variance }) => task.isCritical && (variance?.finishVarianceDays ?? 0) > 0,
  ).length;
  const worstFinishSlip = Math.max(
    0,
    ...varianceRows.map(({ variance }) => variance?.finishVarianceDays ?? 0),
  );
  const totalWorkVariance = view.metrics.baselineWorkVarianceHours ?? 0;

  return (
    <div className="space-y-6 animate-velocity-enter">
      {/* Capture form */}
      <div
        className="relative overflow-hidden rounded-xl"
        style={{
          background: "white",
          border: "1px solid rgba(86,164,91,0.18)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.07)",
        }}
      >
        <div
          className="h-[3px] w-full animate-gradient-x"
          style={{
            background: "linear-gradient(90deg, #1a4a20, #56a45b, #f4a321, #56a45b, #1a4a20)",
            backgroundSize: "200% 100%",
          }}
        />
        <div className="p-5">
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "#56a45b" }}>
              Referentiels
            </div>
            <h2 className="mt-0.5 text-base font-black" style={{ color: "#0d1f10", letterSpacing: "-0.02em" }}>
              Capturer un nouveau referentiel
            </h2>
          </div>
          <form action={captureBaselineAction} className="flex flex-col gap-3 md:flex-row md:items-end">
            <input type="hidden" name="projectId" value={view.aggregate.project.id} />
            <input type="hidden" name="capturedBy" value={view.aggregate.project.ownerName} />
            <label className="grid flex-1 gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.50)" }}>
              Nom du referentiel
              <Input
                name="baselineName"
                defaultValue={`Referentiel ${new Date().toLocaleDateString("fr-FR")}`}
                className="h-9 text-sm"
              />
            </label>
            <Button
              type="submit"
              style={{
                background: "linear-gradient(135deg, #56a45b, #3f8f48)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.15)",
                boxShadow: "0 2px 10px rgba(86,164,91,0.30)",
              }}
            >
              Capturer le referentiel
            </Button>
          </form>
        </div>
      </div>

      {view.aggregate.baselines.length ? (
        <>
          {/* KPI grid */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Referentiel actif"
              value={view.activeBaseline?.name ?? "Aucun"}
              sub={
                view.activeBaseline
                  ? `Capture le ${new Date(view.activeBaseline.capturedAt).toLocaleDateString("fr-FR")} par ${view.activeBaseline.capturedBy}`
                  : "Activez un referentiel pour comparer la derive planning."
              }
              accent="green"
              delay={0}
            />
            <MetricCard
              label="Variance de fin"
              value={`${slippedTasks} en retard / ${aheadTasks} en avance`}
              sub={`${stableTasks} taches restent sur leurs dates approuvees.`}
              accent={slippedTasks > 0 ? "red" : "green"}
              delay={80}
            />
            <MetricCard
              label="Historique"
              value={String(view.aggregate.baselines.length)}
              sub="Referentiels captures. Reactivez le bon point de comparaison selon la gouvernance."
              accent="green"
              delay={160}
            />
            <MetricCard
              label="Variance chemin critique"
              value={`${criticalSlips} gliss. / ${worstFinishSlip}j max`}
              sub="Taches critiques depassant le referentiel — a traiter en priorite."
              accent={criticalSlips > 0 ? "red" : "green"}
              delay={240}
            />
            <MetricCard
              label="Variance charge"
              value={formatHours(totalWorkVariance)}
              sub="Delta charge planifiee vs referentiel actif."
              accent={totalWorkVariance > 0 ? "orange" : "green"}
              delay={320}
            />
          </div>

          {/* Cheetah Time = outil de DÉLAI : bloc EVM/coût (PV, EV, AC, IPS/ICP, écart de
              coût) retiré — spec François. Seule la variance de planning est suivie. */}

          {/* Baseline history table */}
          <div
            className="relative overflow-hidden rounded-xl animate-velocity-enter"
            style={{
              background: "white",
              border: "1px solid rgba(86,164,91,0.15)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
              animationDelay: "100ms",
            }}
          >
            <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, #56a45b, #f4a321)" }} />
            <div className="p-5">
              <div className="mb-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "#56a45b" }}>
                  Historique
                </div>
                <h3 className="mt-0.5 text-base font-black" style={{ color: "#0d1f10", letterSpacing: "-0.02em" }}>
                  Referentiels captures
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-1.5">
                  <thead>
                    <tr className="text-left text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "rgba(0,0,0,0.38)" }}>
                      <th className="px-3 py-2">Referentiel</th>
                      <th className="px-3 py-2">Capture</th>
                      <th className="px-3 py-2">Instantanes</th>
                      <th className="px-3 py-2">Charge gelee</th>
                      <th className="px-3 py-2">Statut</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.aggregate.baselines.map((baseline) => (
                      <tr
                        key={baseline.id}
                        className="rounded-xl"
                        style={{
                          background: baseline.isActive ? "rgba(86,164,91,0.07)" : "rgba(0,0,0,0.025)",
                        }}
                      >
                        <td className="rounded-l-xl px-3 py-3.5">
                          <div className="text-sm font-semibold" style={{ color: "#0d1f10" }}>{baseline.name}</div>
                          {baseline.description && (
                            <div className="text-[11px]" style={{ color: "rgba(0,0,0,0.45)" }}>{baseline.description}</div>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-[12px]" style={{ color: "rgba(0,0,0,0.55)" }}>
                          {new Date(baseline.capturedAt).toLocaleDateString("fr-FR")}
                          <div>{baseline.capturedBy}</div>
                        </td>
                        <td className="px-3 py-3.5 text-[12px]" style={{ color: "rgba(0,0,0,0.55)" }}>
                          {baseline.snapshots.length} taches
                        </td>
                        <td className="px-3 py-3.5 text-[12px]" style={{ color: "rgba(0,0,0,0.55)" }}>
                          {formatHours(
                            baseline.snapshots.reduce(
                              (total, snapshot) => total + snapshot.workHours,
                              0,
                            ),
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          {baseline.isActive ? (
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                              style={{ background: "rgba(86,164,91,0.15)", color: "#1a4a20", border: "1px solid rgba(86,164,91,0.30)" }}
                            >
                              Actif
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                              style={{ background: "rgba(0,0,0,0.06)", color: "rgba(0,0,0,0.45)", border: "1px solid rgba(0,0,0,0.10)" }}
                            >
                              Archive
                            </span>
                          )}
                        </td>
                        <td className="rounded-r-xl px-3 py-3.5">
                          {baseline.isActive ? null : (
                            <form action={activateBaselineAction}>
                              <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                              <input type="hidden" name="baselineId" value={baseline.id} />
                              <button
                                type="submit"
                                className="rounded-lg px-3 py-1 text-[12px] font-semibold transition-all duration-200 hover:opacity-80"
                                style={{
                                  background: "rgba(86,164,91,0.12)",
                                  border: "1px solid rgba(86,164,91,0.25)",
                                  color: "#1a4a20",
                                }}
                              >
                                Activer
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Task variance table */}
          {view.activeBaseline ? (
            <div
              className="relative overflow-hidden rounded-xl animate-velocity-enter"
              style={{
                background: "white",
                border: "1px solid rgba(86,164,91,0.15)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
                animationDelay: "200ms",
              }}
            >
              <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, #f4a321, #56a45b)" }} />
              <div className="p-5">
                <div className="mb-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "#f4a321" }}>
                    Analyse
                  </div>
                  <h3 className="mt-0.5 text-base font-black" style={{ color: "#0d1f10", letterSpacing: "-0.02em" }}>
                    Variance par tache
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-1.5">
                    <thead>
                      <tr className="text-left text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.38)" }}>
                        <th className="px-3 py-2">Tache</th>
                        <th className="px-3 py-2">Referentiel</th>
                        <th className="px-3 py-2">Actuel</th>
                        <th className="px-3 py-2">Delta debut</th>
                        <th className="px-3 py-2">Delta fin</th>
                        <th className="px-3 py-2">Delta charge</th>
                        <th className="px-3 py-2">Nivellement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {varianceRows.map(({ task, variance }) => {
                        const hasSlip =
                          (variance?.finishVarianceDays ?? 0) > 0 ||
                          (variance?.startVarianceDays ?? 0) > 0;
                        return (
                          <tr
                            key={task.id}
                            className="rounded-xl"
                            style={{
                              background: hasSlip ? "rgba(229,83,83,0.045)" : "rgba(0,0,0,0.025)",
                            }}
                          >
                            <td className="rounded-l-xl px-3 py-3 text-sm font-semibold" style={{ color: "#0d1f10" }}>
                              {task.wbsCode} {task.name}
                            </td>
                            <td className="px-3 py-3 text-[11px]" style={{ color: "rgba(0,0,0,0.50)" }}>
                              {formatDateLabel(variance?.snapshot?.startDate)} &rarr;{" "}
                              {formatDateLabel(variance?.snapshot?.finishDate)}
                            </td>
                            <td className="px-3 py-3 text-[11px]" style={{ color: "rgba(0,0,0,0.50)" }}>
                              {formatDateLabel(task.scheduledStartDate)} &rarr;{" "}
                              {formatDateLabel(task.scheduledFinishDate)}
                            </td>
                            <td
                              className="px-3 py-3 text-[12px] font-semibold"
                              style={{
                                color: (variance?.startVarianceDays ?? 0) > 0
                                  ? "#e55353"
                                  : "rgba(0,0,0,0.50)",
                              }}
                            >
                              {variance?.startVarianceDays ?? 0}j
                            </td>
                            <td
                              className="px-3 py-3 text-[12px] font-semibold"
                              style={{
                                color: (variance?.finishVarianceDays ?? 0) > 0
                                  ? "#e55353"
                                  : "rgba(0,0,0,0.50)",
                              }}
                            >
                              {variance?.finishVarianceDays ?? 0}j
                            </td>
                            <td
                              className="px-3 py-3 text-[12px] font-semibold"
                              style={{
                                color: (variance?.workVarianceHours ?? 0) > 0
                                  ? "#e55353"
                                  : "rgba(0,0,0,0.50)",
                              }}
                            >
                              {formatHours(variance?.workVarianceHours ?? 0)}
                            </td>
                            <td className="rounded-r-xl px-3 py-3 text-[12px]" style={{ color: "rgba(0,0,0,0.50)" }}>
                              {task.levelingDelayDays ? `${task.levelingDelayDays}j` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          eyebrow="Aucun referentiel"
          title="Capturez le plan approuve"
          description="Les referentiels gelee le planning actuel pour que Cheetah Time puisse afficher la variance de dates et suivre la derive au fil du temps."
        />
      )}
    </div>
  );
}
