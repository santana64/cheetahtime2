"use client";

import { useActionState } from "react";

import {
  createResourceAction,
  saveAssignmentAction,
} from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectView } from "@/types/planning";

function PanelCard({
  eyebrow,
  title,
  accentColor,
  children,
}: {
  eyebrow: string;
  title: string;
  accentColor?: string;
  children: React.ReactNode;
}) {
  const color = accentColor ?? "#56a45b";
  return (
    <div
      className="relative overflow-hidden rounded-xl"
      style={{
        background: "white",
        border: "1px solid rgba(86,164,91,0.15)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
      }}
    >
      <div
        className="h-[3px] w-full"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }}
      />
      <div className="p-5">
        <div className="mb-4">
          <div
            className="text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color }}
          >
            {eyebrow}
          </div>
          <h3
            className="mt-0.5 text-base font-black"
            style={{ color: "#0d1f10", letterSpacing: "-0.02em" }}
          >
            {title}
          </h3>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ResourceAdmin({ view }: { view: ProjectView }) {
  const [resourceState, resourceAction, resourcePending] = useActionState(
    createResourceAction,
    initialFormState,
  );
  const [assignmentState, assignmentAction, assignmentPending] = useActionState(
    saveAssignmentAction,
    initialFormState,
  );
  const executableTasks = view.tasks.filter((task) => !task.isSummary);
  const canAssign = executableTasks.length > 0 && view.aggregate.resources.length > 0;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <PanelCard eyebrow="Ressources" title="Ajouter une ressource" accentColor="#56a45b">
        <form action={resourceAction} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="projectId" value={view.aggregate.project.id} />
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] md:col-span-2" style={{ color: "rgba(0,0,0,0.45)" }}>
            Nom
            <Input name="name" placeholder="Nadia Petrova" required className="h-8 text-sm" />
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Role
            <Input name="role" placeholder="Planificateur" required className="h-8 text-sm" />
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Type
            <Select name="type" defaultValue="PERSON">
              <option value="PERSON">Personne</option>
              <option value="TEAM">Equipe</option>
              <option value="EQUIPMENT">Equipement</option>
            </Select>
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Localisation
            <Input name="location" placeholder="Paris" className="h-8 text-sm" />
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Disponibilite %
            <Input name="availabilityPct" type="number" min={0} max={100} defaultValue={100} className="h-8 text-sm" />
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Capacite (h/j)
            <Input name="capacityHoursPerDay" type="number" min={1} defaultValue={8} className="h-8 text-sm" />
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Taux de cout
            <Input name="costRate" type="number" min={0} step="0.01" className="h-8 text-sm" />
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] md:col-span-2" style={{ color: "rgba(0,0,0,0.45)" }}>
            Couleur
            <Input name="color" type="color" defaultValue="#0f766e" className="h-9" />
          </label>
          <div
            className="flex items-center justify-between gap-4 border-t pt-4 md:col-span-2"
            style={{ borderColor: "rgba(86,164,91,0.15)" }}
          >
            <div
              className="text-[11px]"
              style={{
                color:
                  resourceState.status === "error"
                    ? "#e55353"
                    : resourceState.status === "success"
                      ? "#56a45b"
                      : "rgba(0,0,0,0.40)",
              }}
            >
              {resourceState.message ||
                "Les ressources s'integrent directement a l'analyse de charge et aux affectations."}
            </div>
            <button
              type="submit"
              disabled={resourcePending}
              className="shrink-0 rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:opacity-80 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #56a45b, #3f8f48)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.15)",
                boxShadow: "0 2px 8px rgba(86,164,91,0.25)",
              }}
            >
              {resourcePending ? "Ajout..." : "Ajouter la ressource"}
            </button>
          </div>
        </form>
      </PanelCard>

      <PanelCard eyebrow="Affectations" title="Creer une affectation" accentColor="#f4a321">
        <form action={assignmentAction} className="grid gap-3">
          <input type="hidden" name="projectId" value={view.aggregate.project.id} />
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Tache
            <Select name="taskId" defaultValue="" disabled={!canAssign}>
              <option value="" disabled>
                Choisir une tache
              </option>
              {executableTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.wbsCode} {task.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Ressource
            <Select name="resourceId" defaultValue="" disabled={!canAssign}>
              <option value="" disabled>
                Choisir une ressource
              </option>
              {view.aggregate.resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name} ({resource.role})
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Allocation %
            <Input
              name="allocationPct"
              type="number"
              min={0}
              defaultValue={100}
              disabled={!canAssign}
              className="h-8 text-sm"
            />
          </label>
          <label className="grid gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Notes
            <Textarea
              name="notes"
              className="min-h-[80px] text-sm"
              placeholder="Notes facultatives sur l'affectation"
              disabled={!canAssign}
            />
          </label>
          <div
            className="flex items-center justify-between gap-4 border-t pt-4"
            style={{ borderColor: "rgba(86,164,91,0.15)" }}
          >
            <div
              className="text-[11px]"
              style={{
                color:
                  assignmentState.status === "error"
                    ? "#e55353"
                    : assignmentState.status === "success"
                      ? "#56a45b"
                      : "rgba(0,0,0,0.40)",
              }}
            >
              {assignmentState.message ||
                (canAssign
                  ? "Les affectations actualisent immediatement les responsables et la chaleur des ressources."
                  : "Ajoutez au moins une ressource pour creer des affectations.")}
            </div>
            <button
              type="submit"
              disabled={assignmentPending || !canAssign}
              className="shrink-0 rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:opacity-80 disabled:opacity-50"
              style={{
                background: "rgba(244,163,33,0.12)",
                border: "1px solid rgba(244,163,33,0.30)",
                color: "#7a4f00",
              }}
            >
              {assignmentPending ? "Enregistrement..." : "Enregistrer l'affectation"}
            </button>
          </div>
        </form>
      </PanelCard>
    </div>
  );
}
