import { EmptyState } from "@/components/app/empty-state";
import { FrenchDateInput } from "@/components/ui/french-date-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  clearProjectLevelingAction,
  deleteAssignmentAction,
  deleteResourceAction,
  deleteTimesheetEntryAction,
  levelProjectResourcesAction,
  stretchProjectResourcesAction,
  saveAssignmentDirectAction,
  saveTimesheetEntryDirectAction,
  updateResourceDirectAction,
} from "@/features/projects/actions";
import { ResourceAdmin } from "@/features/projects/resource-admin";
import { formatPercent } from "@/lib/format/formatters";
import { getAssignmentDailyWorkHours } from "@/lib/planning/work-model";
import type { ProjectView } from "@/types/planning";

const WORKING_DAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 7, label: "Dim" },
] as const;

function formatHours(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)}h`;
}

function serializeCalendarExceptions(
  exceptions: Array<{ date: string; label: string; isWorkingDay: boolean }>,
) {
  return [...exceptions]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map(
      (exception) =>
        `${exception.date} | ${exception.label} | ${
          exception.isWorkingDay ? "working" : "off"
        }`,
    )
    .join("\n");
}

function SectionPanel({
  eyebrow,
  title,
  accentColor,
  children,
  delay,
}: {
  eyebrow: string;
  title: string;
  accentColor?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  const color = accentColor ?? "#56a45b";
  return (
    <div
      className="relative overflow-hidden rounded-xl animate-velocity-enter"
      style={{
        background: "white",
        border: "1px solid rgba(86,164,91,0.15)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        animationDelay: delay ? `${delay}ms` : undefined,
      }}
    >
      <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      <div className="p-5">
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color }}>
            {eyebrow}
          </div>
          <h3 className="mt-0.5 text-base font-black" style={{ color: "#0d1f10", letterSpacing: "-0.02em" }}>
            {title}
          </h3>
        </div>
        {children}
      </div>
    </div>
  );
}

function MetricTile({
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
  const color = accent === "orange" ? "#f4a321" : accent === "red" ? "#e55353" : "#56a45b";
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
      <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
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

export function ResourceView({ view }: { view: ProjectView }) {
  // Libellés de période selon l'unité du projet (spec François 29/08).
  const monthlyLoad = view.aggregate.project.timeUnit === "mois";
  const periodNoun = monthlyLoad ? "mois" : "semaine"; // « mois » invariable
  const periodPlural = monthlyLoad ? "mois" : "semaines";
  const periodAdj = monthlyLoad ? "mensuelle" : "hebdo";
  const resourceMap = new Map(
    view.aggregate.resources.map((resource) => [resource.id, resource]),
  );
  const taskMap = new Map(view.tasks.map((task) => [task.id, task]));
  const overloadedResourceCount = view.resourceSummaries.filter(
    (summary) => summary.overloadedWeeks > 0,
  ).length;
  const unassignedTaskCount = view.tasks.filter(
    (task) =>
      task.type === "TASK" &&
      !task.isSummary &&
      !view.aggregate.assignments.some((assignment) => assignment.taskId === task.id),
  ).length;
  const hottestResource = view.resourceSummaries[0];
  const canLevel = view.aggregate.assignments.length > 0;
  const executableTasks = view.tasks.filter((task) => !task.isSummary);
  const timesheetEntries = [...view.aggregate.timesheetEntries].sort(
    (left, right) => right.entryDate.localeCompare(left.entryDate) || right.id.localeCompare(left.id),
  );

  return (
    <div className="space-y-6 animate-velocity-enter">
      <ResourceAdmin view={view} />

      {/* Leveling controls */}
      <SectionPanel eyebrow="Nivellement" title="Equilibrer la charge" accentColor="#f4a321" delay={100}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-semibold" style={{ color: "#0d1f10" }}>
              Rééquilibrer le planning selon la capacité nominative
            </div>
            <div className="text-[12px] leading-relaxed" style={{ color: "rgba(0,0,0,0.50)" }}>
              Deux stratégies : <strong>retarder</strong> des tâches pour supprimer les surcharges,
              ou <strong>allonger</strong> des tâches (charge constante, intensité réduite) pour diminuer
              l&apos;intensité d&apos;utilisation des ressources surchargées.
            </div>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <form action={levelProjectResourcesAction}>
              <input type="hidden" name="projectId" value={view.aggregate.project.id} />
              <button
                type="submit"
                disabled={!canLevel}
                className="rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:opacity-80 disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #f4a321, #c87b00)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.15)",
                  boxShadow: "0 2px 8px rgba(244,163,33,0.30)",
                }}
                title="Retarde des tâches pour supprimer les surcharges"
              >
                Niveler — retarder
              </button>
            </form>
            <form action={stretchProjectResourcesAction}>
              <input type="hidden" name="projectId" value={view.aggregate.project.id} />
              <button
                type="submit"
                disabled={!canLevel}
                className="rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:opacity-80 disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #56a45b, #3f8f48)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.15)",
                  boxShadow: "0 2px 8px rgba(86,164,91,0.30)",
                }}
                title="Allonge des tâches (durée ×F, intensité ÷F, charge constante) pour réduire l'intensité des ressources surchargées"
              >
                Niveler — allonger
              </button>
            </form>
            <form action={clearProjectLevelingAction}>
              <input type="hidden" name="projectId" value={view.aggregate.project.id} />
              <button
                type="submit"
                disabled={!view.metrics.leveledTaskCount}
                className="rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:opacity-80 disabled:opacity-40"
                style={{
                  background: "rgba(244,163,33,0.10)",
                  border: "1px solid rgba(244,163,33,0.25)",
                  color: "#7a4f00",
                }}
              >
                Effacer le nivellement
              </button>
            </form>
          </div>
        </div>
      </SectionPanel>

      {view.resourceSummaries.length ? (
        <>
          {/* KPI tiles */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricTile
              label="Pression ressource"
              value={String(overloadedResourceCount)}
              sub={`ressources en surcharge sur au moins ${monthlyLoad ? "un mois" : "une semaine"}`}
              accent={overloadedResourceCount > 0 ? "red" : "green"}
              delay={0}
            />
            <MetricTile
              label="Travail non affecté"
              value={String(unassignedTaskCount)}
              sub="tâches exécutables encore sans capacité nominative"
              accent={unassignedTaskCount > 0 ? "orange" : "green"}
              delay={80}
            />
            <MetricTile
              label="Ressource la plus chargee"
              value={hottestResource?.resource.name ?? "—"}
              sub={
                hottestResource
                  ? `${formatPercent(hottestResource.maxAllocationPct)} de charge max — ${formatHours(hottestResource.maxAllocatedHours)} sur ${monthlyLoad ? "le mois le plus chargé" : "la semaine la plus chargée"}`
                  : "Aucune affectation planifiée."
              }
              accent="orange"
              delay={160}
            />
            <MetricTile
              label="Heures réelles"
              value={formatHours(view.metrics.totalActualWorkHours)}
              sub="saisies sur les ressources affectees"
              accent="green"
              delay={240}
            />
            <MetricTile
              label="Impact du nivellement"
              value={`${view.metrics.totalLevelingDelayDays}j`}
              sub={`${view.metrics.leveledTaskCount} tâche(s) avec retard de nivellement persistant`}
              accent={view.metrics.totalLevelingDelayDays > 0 ? "orange" : "green"}
              delay={320}
            />
          </div>

          {/* Resource summary cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {view.resourceSummaries.map((summary, i) => (
              <div
                key={summary.resource.id}
                className="relative overflow-hidden rounded-xl animate-velocity-enter"
                style={{
                  background: "white",
                  border: summary.overloadedWeeks > 0
                    ? "1px solid rgba(229,83,83,0.25)"
                    : "1px solid rgba(86,164,91,0.15)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                  animationDelay: `${i * 60}ms`,
                }}
              >
                <div
                  className="h-[3px] w-full"
                  style={{
                    background: summary.overloadedWeeks > 0
                      ? "linear-gradient(90deg, #e55353, #f4a321)"
                      : "linear-gradient(90deg, #56a45b, #3f8f48)",
                  }}
                />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="truncate text-sm font-black" style={{ color: "#0d1f10" }}>
                        {summary.resource.name}
                      </div>
                      <div className="text-[11px]" style={{ color: "rgba(0,0,0,0.45)" }}>
                        {summary.resource.role}
                      </div>
                    </div>
                    <span
                      className="size-3 shrink-0 rounded-full mt-0.5"
                      style={{ backgroundColor: summary.resource.color }}
                    />
                  </div>
                  <div className="mt-4 text-2xl font-black" style={{ color: "#0d1f10", letterSpacing: "-0.02em" }}>
                    {formatPercent(summary.maxAllocationPct)}
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: "rgba(0,0,0,0.45)" }}>
                    intensité {(summary.maxAllocationPct / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {" · "}{formatHours(summary.maxAllocatedHours)} sur {monthlyLoad ? "le mois le plus chargé" : "la semaine la plus chargée"}
                  </div>
                  <div className="mt-3 space-y-0.5 text-[11px]" style={{ color: "rgba(0,0,0,0.50)" }}>
                    <div>{summary.overloadedWeeks} {summary.overloadedWeeks > 1 ? periodPlural : periodNoun} en surcharge / {summary.assignedTaskCount} taches</div>
                    <div>{formatHours(summary.totalAllocatedHours)} charge planifiee totale</div>
                    <div>{formatHours(summary.totalActualHours)} heures reelles saisies</div>
                    {/* Coût planifié/consommé retiré (outil de délai — spec François). */}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Load by week table */}
          <SectionPanel eyebrow="Analyse" title={`Charge par ${periodNoun}`} accentColor="#56a45b" delay={200}>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-1.5">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.38)" }}>
                    <th className="px-3 py-2">Ressource</th>
                    <th className="px-3 py-2">Rôle</th>
                    <th className="px-3 py-2">Charge {periodAdj}</th>
                    <th className="px-3 py-2">Affectations</th>
                  </tr>
                </thead>
                <tbody>
                  {view.resourceSummaries.map((summary) => (
                    <tr key={summary.resource.id} className="rounded-xl" style={{ background: "rgba(0,0,0,0.025)" }}>
                      <td className="rounded-l-xl px-3 py-3 text-sm font-semibold" style={{ color: "#0d1f10" }}>
                        {summary.resource.name}
                      </td>
                      <td className="px-3 py-3 text-[12px]" style={{ color: "rgba(0,0,0,0.50)" }}>
                        {summary.resource.role}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {summary.loadByWeek.length ? (
                            summary.loadByWeek.map((item) => (
                              <span
                                key={`${summary.resource.id}-${item.weekLabel}`}
                                className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                                style={
                                  item.allocationPct > summary.resource.availabilityPct
                                    ? { background: "rgba(229,83,83,0.12)", color: "#b42020", border: "1px solid rgba(229,83,83,0.25)" }
                                    : { background: "rgba(86,164,91,0.10)", color: "#1a4a20", border: "1px solid rgba(86,164,91,0.20)" }
                                }
                              >
                                {item.weekLabel}: {item.allocationPct}% ({formatHours(item.allocatedHours)}/{formatHours(item.capacityHours)})
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px]" style={{ color: "rgba(0,0,0,0.40)" }}>Aucun travail planifie</span>
                          )}
                        </div>
                      </td>
                      <td className="rounded-r-xl px-3 py-3 text-[11px]" style={{ color: "rgba(0,0,0,0.50)" }}>
                        {view.aggregate.assignments
                          .filter((assignment) => assignment.resourceId === summary.resource.id)
                          .map((assignment) => {
                            const task = taskMap.get(assignment.taskId);
                            return task ? `${task.wbsCode} ${task.name}` : null;
                          })
                          .filter(Boolean)
                          .join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionPanel>

          {/* Edit each resource */}
          <div className="grid gap-4 xl:grid-cols-2">
            {view.aggregate.resources.map((resource, i) => (
              <div
                key={resource.id}
                className="relative overflow-hidden rounded-xl animate-velocity-enter"
                style={{
                  background: "white",
                  border: "1px solid rgba(86,164,91,0.15)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
                  animationDelay: `${i * 80}ms`,
                }}
              >
                <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, #56a45b, #f4a321)" }} />
                <div className="p-5">
                  <div className="mb-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "#56a45b" }}>
                      Gestion
                    </div>
                    <h3 className="mt-0.5 text-base font-black" style={{ color: "#0d1f10", letterSpacing: "-0.02em" }}>
                      {resource.name}
                    </h3>
                  </div>
                  <form action={updateResourceDirectAction} className="grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                    <input type="hidden" name="resourceId" value={resource.id} />
                    <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] md:col-span-2" style={{ color: "rgba(0,0,0,0.45)" }}>
                      Nom
                      <Input name="name" defaultValue={resource.name} required className="h-8 text-sm" />
                    </label>
                    <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
                      Role
                      <Input name="role" defaultValue={resource.role} required className="h-8 text-sm" />
                    </label>
                    <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
                      Type
                      <Select name="type" defaultValue={resource.type}>
                        <option value="PERSON">Personne</option>
                        <option value="TEAM">Équipe</option>
                        <option value="EQUIPMENT">Equipement</option>
                      </Select>
                    </label>
                    <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
                      Localisation
                      <Input name="location" defaultValue={resource.location} className="h-8 text-sm" />
                    </label>
                    <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
                      Disponibilite %
                      <Input name="availabilityPct" type="number" min={0} max={100} defaultValue={resource.availabilityPct} className="h-8 text-sm" />
                    </label>
                    <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
                      Capacite (h/j)
                      <Input name="capacityHoursPerDay" type="number" min={1} defaultValue={resource.capacityHoursPerDay} className="h-8 text-sm" />
                    </label>
                    <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
                      Calendrier (h/j)
                      <Input name="resourceCalendarHoursPerDay" type="number" min={1} max={24} defaultValue={resource.calendarHoursPerDay ?? ""} className="h-8 text-sm" />
                    </label>
                    {/* « Taux de coût » retiré (outil de délai — spec François). Valeur conservée en interne. */}
                    <input type="hidden" name="costRate" defaultValue={resource.costRate ?? ""} />
                    <div className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] md:col-span-2" style={{ color: "rgba(0,0,0,0.45)" }}>
                      Semaine de travail
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                        {WORKING_DAY_OPTIONS.map((day) => (
                          <label
                            key={`${resource.id}-${day.value}`}
                            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold"
                            style={{ background: "rgba(86,164,91,0.06)", border: "1px solid rgba(86,164,91,0.12)", color: "#1a4a20" }}
                          >
                            <input
                              type="checkbox"
                              name="resourceCalendarWorkingDays"
                              value={day.value}
                              defaultChecked={resource.calendarWorkingDays.includes(day.value)}
                              className="size-3.5 rounded"
                            />
                            {day.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] md:col-span-2" style={{ color: "rgba(0,0,0,0.45)" }}>
                      Exceptions calendrier
                      <Textarea
                        name="resourceCalendarExceptions"
                        defaultValue={serializeCalendarExceptions(resource.calendarExceptions)}
                        className="min-h-[90px] font-mono text-xs"
                      />
                    </label>
                    <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] md:col-span-2" style={{ color: "rgba(0,0,0,0.45)" }}>
                      Couleur d'accent
                      <Input name="color" type="color" defaultValue={resource.color} className="h-9" />
                    </label>
                    <div
                      className="flex items-center justify-between gap-3 border-t pt-4 md:col-span-2"
                      style={{ borderColor: "rgba(86,164,91,0.15)" }}
                    >
                      <div className="text-[11px]" style={{ color: "rgba(0,0,0,0.40)" }}>
                        {resource.calendarHoursPerDay ?? view.aggregate.calendar.hoursPerDay} h/jour · calendrier de la ressource
                      </div>
                      <button
                        type="submit"
                        className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:opacity-80"
                        style={{
                          background: "rgba(86,164,91,0.12)",
                          border: "1px solid rgba(86,164,91,0.25)",
                          color: "#1a4a20",
                        }}
                      >
                        Sauvegarder
                      </button>
                    </div>
                  </form>
                  <form action={deleteResourceAction} className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(229,83,83,0.15)" }}>
                    <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                    <input type="hidden" name="resourceId" value={resource.id} />
                    <button
                      type="submit"
                      className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:opacity-80"
                      style={{
                        background: "rgba(229,83,83,0.08)",
                        border: "1px solid rgba(229,83,83,0.20)",
                        color: "#b42020",
                      }}
                    >
                      Supprimer la ressource
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          eyebrow="Équipe vide"
          title="Constituez l'équipe de livraison"
          description="Créez des personnes, équipes et equipements pour que les responsables, la chaleur d'allocation et l'equilibrage de charge puissent traverser le planning."
        />
      )}

      {/* Timesheet */}
      <SectionPanel eyebrow="Feuilles de temps" title="Saisie des réels" accentColor="#f4a321" delay={300}>
        <form action={saveTimesheetEntryDirectAction} className="grid gap-3 lg:grid-cols-3">
          <input type="hidden" name="projectId" value={view.aggregate.project.id} />
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Tache
            <Select name="taskId" defaultValue={executableTasks[0]?.id ?? ""}>
              {executableTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.wbsCode} {task.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Ressource
            <Select name="resourceId" defaultValue={view.aggregate.resources[0]?.id ?? ""}>
              <option value="">Sans ressource</option>
              {view.aggregate.resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Date de saisie
            <FrenchDateInput name="entryDate" defaultValue={new Date().toISOString().slice(0, 10)} required={true} />
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Heures travaillees
            <Input name="workHours" type="number" min={0.25} step="0.25" defaultValue={8} className="h-8 text-sm" />
          </label>
          {/* Champ « Coût réel » retiré (outil de délai — spec François). */}
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] lg:col-span-3" style={{ color: "rgba(0,0,0,0.45)" }}>
            Notes
            <Textarea name="notes" className="min-h-[80px] text-sm" />
          </label>
          <div
            className="flex items-center justify-between gap-3 border-t pt-4 lg:col-span-3"
            style={{ borderColor: "rgba(86,164,91,0.15)" }}
          >
            <div className="text-[11px]" style={{ color: "rgba(0,0,0,0.40)" }}>
              Les saisies de temps alimentent la charge consommée et l&apos;avancement du planning.
            </div>
            <button
              type="submit"
              disabled={!executableTasks.length}
              className="shrink-0 rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:opacity-80 disabled:opacity-40"
              style={{
                background: "rgba(244,163,33,0.12)",
                border: "1px solid rgba(244,163,33,0.28)",
                color: "#7a4f00",
              }}
            >
              Saisir les réels
            </button>
          </div>
        </form>

        {timesheetEntries.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-1.5">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.38)" }}>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Tâche</th>
                  <th className="px-3 py-2">Ressource</th>
                  <th className="px-3 py-2">Heures</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {timesheetEntries.map((entry) => {
                  const task = taskMap.get(entry.taskId);
                  const resource = entry.resourceId ? resourceMap.get(entry.resourceId) : null;
                  return (
                    <tr key={entry.id} className="rounded-xl" style={{ background: "rgba(0,0,0,0.025)" }}>
                      <td className="rounded-l-xl px-3 py-3 text-[12px]" style={{ color: "rgba(0,0,0,0.60)" }}>{entry.entryDate}</td>
                      <td className="px-3 py-3 text-[12px]" style={{ color: "rgba(0,0,0,0.60)" }}>
                        {task ? `${task.wbsCode} ${task.name}` : entry.taskId}
                      </td>
                      <td className="px-3 py-3 text-[12px]" style={{ color: "rgba(0,0,0,0.60)" }}>
                        {resource?.name ?? "Sans ressource"}
                      </td>
                      <td className="px-3 py-3 text-[12px]" style={{ color: "rgba(0,0,0,0.60)" }}>
                        {formatHours(entry.workHours)}
                      </td>
                      <td className="px-3 py-3 text-[11px]" style={{ color: "rgba(0,0,0,0.45)" }}>{entry.notes}</td>
                      <td className="rounded-r-xl px-3 py-3">
                        <form action={deleteTimesheetEntryAction}>
                          <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                          <input type="hidden" name="entryId" value={entry.id} />
                          <button
                            type="submit"
                            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 hover:opacity-80"
                            style={{ background: "rgba(229,83,83,0.08)", color: "#b42020", border: "1px solid rgba(229,83,83,0.18)" }}
                          >
                            Retirer
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 text-[12px]" style={{ color: "rgba(0,0,0,0.40)" }}>
            Aucune saisie de temps enregistrée pour le moment.
          </div>
        )}
      </SectionPanel>

      {/* Assignment detail */}
      {view.aggregate.assignments.length ? (
        <SectionPanel eyebrow="Affectations" title="Détail des affectations" accentColor="#56a45b" delay={400}>
          <div className="grid gap-4 lg:grid-cols-2">
            {view.aggregate.assignments.map((assignment, i) => {
              const task = taskMap.get(assignment.taskId);
              const resource = resourceMap.get(assignment.resourceId);
              if (!task || !resource) return null;
              return (
                <div
                  key={assignment.id}
                  className="rounded-xl p-4 animate-velocity-enter"
                  style={{
                    background: "rgba(86,164,91,0.04)",
                    border: "1px solid rgba(86,164,91,0.12)",
                    animationDelay: `${i * 60}ms`,
                  }}
                >
                  <div className="mb-3 space-y-0.5">
                    <div className="text-sm font-bold" style={{ color: "#0d1f10" }}>
                      {task.wbsCode} {task.name}
                    </div>
                    <div className="text-[12px]" style={{ color: "#56a45b" }}>
                      {resource.name} — {resource.role}
                    </div>
                    <div className="text-[11px]" style={{ color: "rgba(0,0,0,0.45)" }}>
                      {task.scheduledStartDate ?? "Non planifie"} &rarr; {task.scheduledFinishDate ?? "Non planifie"}
                    </div>
                    <div className="text-[11px]" style={{ color: "rgba(0,0,0,0.45)" }}>
                      {formatPercent(assignment.allocationPct)} allocation —{" "}
                      {formatHours(getAssignmentDailyWorkHours(assignment, task, view.aggregate))} / j —{" "}
                      {formatHours(task.effortHours ?? 0)} charge planifiee
                    </div>
                    <div className="text-[11px]" style={{ color: "rgba(0,0,0,0.45)" }}>
                      {formatHours(task.actualWorkHours ?? 0)} reels — {formatHours(task.remainingWorkHours ?? 0)} restants
                    </div>
                    {task.levelingDelayDays > 0 && (
                      <div className="text-[11px] font-semibold" style={{ color: "#c87b00" }}>
                        Niveau par {task.levelingDelayDays} jour(s) ouvre(s) pour respecter la capacite ressource
                      </div>
                    )}
                  </div>
                  <form action={saveAssignmentDirectAction} className="grid gap-3">
                    <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                    <input type="hidden" name="taskId" value={assignment.taskId} />
                    <input type="hidden" name="resourceId" value={assignment.resourceId} />
                    <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
                      Allocation %
                      <Input name="allocationPct" type="number" min={0} defaultValue={assignment.allocationPct} className="h-8 text-sm" />
                    </label>
                    <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
                      Notes
                      <Textarea name="notes" defaultValue={assignment.notes ?? ""} className="min-h-[72px] text-sm" />
                    </label>
                    <div
                      className="flex items-center justify-between gap-3 border-t pt-3"
                      style={{ borderColor: "rgba(86,164,91,0.15)" }}
                    >
                      <div className="text-[11px]" style={{ color: "rgba(0,0,0,0.38)" }}>
                        La modification actualise immediatement la charge et les responsables.
                      </div>
                      <button
                        type="submit"
                        className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:opacity-80"
                        style={{ background: "rgba(86,164,91,0.12)", border: "1px solid rgba(86,164,91,0.25)", color: "#1a4a20" }}
                      >
                        Sauvegarder
                      </button>
                    </div>
                  </form>
                  <form action={deleteAssignmentAction} className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(229,83,83,0.12)" }}>
                    <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                    <input type="hidden" name="assignmentId" value={assignment.id} />
                    <button
                      type="submit"
                      className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:opacity-80"
                      style={{ background: "rgba(229,83,83,0.08)", border: "1px solid rgba(229,83,83,0.18)", color: "#b42020" }}
                    >
                      Supprimer l'affectation
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </SectionPanel>
      ) : (
        <EmptyState
          eyebrow="Affectations vides"
          title="Reliez les ressources aux tâches"
          description="Les affectations transforment le planning en plan de livraison utilisable en liant la capacité nominative aux tâches et aux dates."
        />
      )}
    </div>
  );
}
