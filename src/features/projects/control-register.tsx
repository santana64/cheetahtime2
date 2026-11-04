"use client";

import { useActionState, useState } from "react";

import {
  deleteChangeRequestAction,
  deleteIssueAction,
  saveChangeRequestAction,
  saveIssueAction,
} from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChangeRequest, IssueItem, ScheduledTask } from "@/types/planning";

function StateMessage({ message, status }: { message?: string; status?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p className={cn("text-xs", status === "error" ? "text-rose-600" : "text-emerald-700")}>
      {message}
    </p>
  );
}

function TaskSelect({ tasks, defaultValue = "" }: { tasks: ScheduledTask[]; defaultValue?: string | null }) {
  return (
    <Select name="taskId" defaultValue={defaultValue ?? ""} className="h-9 text-xs">
      <option value="">Projet / non lie a une tache</option>
      {tasks
        .filter((task) => !task.isSummary)
        .map((task) => (
          <option key={task.id} value={task.id}>
            {task.wbsCode} - {task.name}
          </option>
        ))}
    </Select>
  );
}

function DeleteButton({
  label,
  action,
  hidden,
}: {
  label: string;
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
}) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirm(true)}>
        Supprimer
      </Button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <span className="text-xs text-rose-700">{label}</span>
      <Button type="submit" variant="destructive" size="sm">
        Oui
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirm(false)}>
        Non
      </Button>
    </form>
  );
}

function IssueForm({ projectId, tasks }: { projectId: string; tasks: ScheduledTask[] }) {
  const [state, action, pending] = useActionState(saveIssueAction, initialFormState);
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 md:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
        Incident / probleme
        <Input name="title" required placeholder="Ex. Retard fournisseur sur le lot equipement" className="h-9" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Tache liee
        <TaskSelect tasks={tasks} />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Responsable
        <Input name="ownerName" className="h-9" placeholder="Responsable incident" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Gravite
        <Select name="severity" defaultValue="MEDIUM" className="h-9">
          <option value="LOW">Faible</option>
          <option value="MEDIUM">Moyenne</option>
          <option value="HIGH">Elevee</option>
          <option value="CRITICAL">Critique</option>
        </Select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Statut
        <Select name="status" defaultValue="OPEN" className="h-9">
          <option value="OPEN">Ouvert</option>
          <option value="INVESTIGATING">Analyse</option>
          <option value="RESOLVED">Resolu</option>
          <option value="CLOSED">Ferme</option>
        </Select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Echeance
        <Input name="dueDate" type="date" className="h-9" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
        Description
        <Textarea name="description" className="min-h-20" placeholder="Contexte, impact et prochaines actions" />
      </label>
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <StateMessage status={state.status} message={state.message} />
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement..." : "Ajouter l'incident"}
        </Button>
      </div>
    </form>
  );
}

function ChangeForm({ projectId, tasks }: { projectId: string; tasks: ScheduledTask[] }) {
  const [state, action, pending] = useActionState(saveChangeRequestAction, initialFormState);
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 md:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
        Demande de changement
        <Input name="title" required placeholder="Ex. Ajouter un lot de migration complementaire" className="h-9" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Tache impactee
        <TaskSelect tasks={tasks} />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Statut
        <Select name="status" defaultValue="SUBMITTED" className="h-9">
          <option value="DRAFT">Brouillon</option>
          <option value="SUBMITTED">Soumise</option>
          <option value="APPROVED">Approuvee</option>
          <option value="REJECTED">Rejetee</option>
          <option value="IMPLEMENTED">Implementee</option>
        </Select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Impact planning (jours)
        <Input name="scheduleImpactDays" type="number" defaultValue={0} className="h-9" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Impact cout
        <Input name="costImpactAmount" type="number" defaultValue={0} step={0.01} className="h-9" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Niveau d'impact
        <Select name="impactLevel" defaultValue="MEDIUM" className="h-9">
          <option value="LOW">Faible</option>
          <option value="MEDIUM">Moyen</option>
          <option value="HIGH">Eleve</option>
          <option value="CRITICAL">Critique</option>
        </Select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
        Description
        <Textarea name="description" className="min-h-20" placeholder="Portee, justification, decision attendue" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
        Notes de decision
        <Textarea name="decisionNotes" className="min-h-16" placeholder="Decision PMO, arbitrage ou conditions" />
      </label>
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <StateMessage status={state.status} message={state.message} />
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement..." : "Ajouter la demande"}
        </Button>
      </div>
    </form>
  );
}

export function ControlRegister({
  projectId,
  tasks,
  issues,
  changes,
}: {
  projectId: string;
  tasks: ScheduledTask[];
  issues: IssueItem[];
  changes: ChangeRequest[];
}) {
  const openIssues = issues.filter((issue) => issue.status !== "CLOSED");
  const pendingChanges = changes.filter((change) => !["REJECTED", "IMPLEMENTED"].includes(change.status));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Incidents ouverts", openIssues.length],
          ["Incidents critiques", issues.filter((issue) => issue.severity === "CRITICAL" && issue.status !== "CLOSED").length],
          ["Changements en cours", pendingChanges.length],
          ["Impact planning", `${changes.reduce((sum, change) => sum + change.scheduleImpactDays, 0)} j`],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-white/70 bg-white/80 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</div>
            <div className="mt-2 text-2xl font-black text-[#1a4a20]">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incidents / problemes</CardTitle>
            <p className="text-xs text-slate-500">Suivi operationnel des blocages, ecarts et decisions d'action.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <IssueForm projectId={projectId} tasks={tasks} />
            <div className="space-y-2">
              {issues.length ? issues.map((issue) => (
                <div key={issue.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-[11px] font-bold text-slate-400">{issue.code}</div>
                      <div className="font-semibold text-slate-900">{issue.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{issue.description || "Aucune description."}</div>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                      {issue.severity} / {issue.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{issue.ownerName || "Sans responsable"} {issue.dueDate ? `- ${issue.dueDate}` : ""}</span>
                    <DeleteButton label="Confirmer ?" action={deleteIssueAction} hidden={{ projectId, issueId: issue.id }} />
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500">
                  Aucun incident enregistre.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demandes de changement</CardTitle>
            <p className="text-xs text-slate-500">Controle PMO des impacts planning, budget et perimetre.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChangeForm projectId={projectId} tasks={tasks} />
            <div className="space-y-2">
              {changes.length ? changes.map((change) => (
                <div key={change.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-[11px] font-bold text-slate-400">{change.code}</div>
                      <div className="font-semibold text-slate-900">{change.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{change.description || "Aucune description."}</div>
                    </div>
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-800">
                      {change.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{change.scheduleImpactDays} j / {change.costImpactAmount.toLocaleString("fr-FR")} cout</span>
                    <DeleteButton label="Confirmer ?" action={deleteChangeRequestAction} hidden={{ projectId, changeRequestId: change.id }} />
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500">
                  Aucune demande de changement.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
