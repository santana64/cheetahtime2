"use client";

import { useActionState, useState } from "react";

import {
  deleteProjectAction,
  duplicateProjectAction,
  saveProjectTemplateAction,
  setProjectArchiveStateAction,
  updateProjectCalendarAction,
  updateProjectMetadataAction,
} from "@/features/projects/actions";
import { initialFormState, type FormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ProjectView } from "@/types/planning";

// ---------------------------------------------------------------------------
// Module-scope constants
// ---------------------------------------------------------------------------

const WORKING_DAY_LABELS: (string | null)[] = [
  null,
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

const WORKING_DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

// ---------------------------------------------------------------------------
// Helper sub-components
// ---------------------------------------------------------------------------

type FeedbackProps = {
  state: FormState;
  idleText?: string;
};

function Feedback({ state, idleText }: FeedbackProps) {
  return (
    <p
      className={cn(
        "text-xs",
        state.status === "error" && "text-rose-600",
        state.status === "success" && "text-emerald-600",
        state.status === "idle" && "text-slate-400",
      )}
    >
      {state.message || idleText}
    </p>
  );
}

type FieldLabelProps = {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
};

function FieldLabel({ label, children, wide }: FieldLabelProps) {
  return (
    <label
      className={cn(
        "grid gap-1.5 text-xs font-semibold text-slate-500",
        wide && "md:col-span-2",
      )}
    >
      {label}
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — Informations generales
// ---------------------------------------------------------------------------

type MetadataSectionProps = {
  view: ProjectView;
};

function MetadataSection({ view }: MetadataSectionProps) {
  const [state, action, pending] = useActionState(
    updateProjectMetadataAction,
    initialFormState,
  );
  const proj = view.aggregate.project;

  return (
    <Card>
      <CardHeader className="border-b border-border/40 pb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.20em] text-slate-400">
          Section 1
        </div>
        <CardTitle className="text-base font-bold text-[#1a4a20]">
          Informations generales
        </CardTitle>
        <p className="text-xs text-slate-500">
          Métadonnées du projet — repercutees immediatement sur le tableau de bord et le planning.
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        <form action={action} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="projectId" value={proj.id} />

          <FieldLabel label="Nom du projet" wide>
            <Input
              name="name"
              defaultValue={proj.name}
              required
              className="h-9 text-sm"
            />
          </FieldLabel>

          <FieldLabel label="Client">
            <Input
              name="clientName"
              defaultValue={proj.clientName}
              required
              className="h-9 text-sm"
            />
          </FieldLabel>

          <FieldLabel label="Portefeuille">
            <Input
              name="portfolio"
              defaultValue={proj.portfolio}
              required
              className="h-9 text-sm"
            />
          </FieldLabel>

          <FieldLabel label="Responsable">
            <Input
              name="ownerName"
              defaultValue={proj.ownerName}
              required
              className="h-9 text-sm"
            />
          </FieldLabel>

          {/* Commanditaire / Maître d'Ouvrage retiré (spec François) — valeur conservée en interne. */}
          <input type="hidden" name="sponsorName" defaultValue={proj.sponsorName} />

          <FieldLabel label="Description" wide>
            <Textarea
              name="description"
              defaultValue={proj.description}
              className="min-h-[88px] text-sm"
            />
          </FieldLabel>

          <FieldLabel label="Statut">
            <Select name="status" defaultValue={proj.status} className="h-9 text-sm">
              <option value="PLANNING">Planification</option>
              <option value="ACTIVE">Actif</option>
              <option value="AT_RISK">A risque</option>
              <option value="ON_HOLD">En pause</option>
              <option value="COMPLETED">Terminé</option>
            </Select>
          </FieldLabel>

          <FieldLabel label="Sante">
            <Select name="health" defaultValue={proj.health} className="h-9 text-sm">
              <option value="ON_TRACK">Dans les temps</option>
              <option value="WATCH">Surveillance</option>
              <option value="AT_RISK">A risque</option>
              <option value="OFF_TRACK">En retard</option>
            </Select>
          </FieldLabel>

          <FieldLabel label="Début cible">
            <Input
              name="targetStartDate"
              type="date"
              defaultValue={proj.targetStartDate}
              required
              className="h-9 text-sm"
            />
          </FieldLabel>

          <FieldLabel label="Fin cible">
            <Input
              name="targetFinishDate"
              type="date"
              defaultValue={proj.targetFinishDate ?? ""}
              className="h-9 text-sm"
            />
          </FieldLabel>

          {/* Cheetah Time = outil de délai : ni budget ni coût (spec François). Valeurs conservées en interne. */}
          <input type="hidden" name="budgetAmount" defaultValue={proj.budgetAmount} />
          <input type="hidden" name="currencyCode" defaultValue={proj.currencyCode} />

          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
            <Feedback
              state={state}
              idleText="Les modifications sont enregistrées dans votre planning et votre tableau de bord."
            />
            <Button type="submit" disabled={pending} className="shrink-0">
              {pending ? "Enregistrement..." : "Enregistrer les informations"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Calendrier
// ---------------------------------------------------------------------------

type CalendarSectionProps = {
  view: ProjectView;
};

function CalendarSection({ view }: CalendarSectionProps) {
  const [state, action, pending] = useActionState(
    updateProjectCalendarAction,
    initialFormState,
  );
  const cal = view.aggregate.calendar;
  const proj = view.aggregate.project;

  const exceptionsValue = [...cal.exceptions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (ex) =>
        `${ex.date} | ${ex.label} | ${ex.isWorkingDay ? "working" : "off"}`,
    )
    .join("\n");

  return (
    <Card>
      <CardHeader className="border-b border-border/40 pb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.20em] text-slate-400">
          Section 2
        </div>
        <CardTitle className="text-base font-bold text-[#1a4a20]">
          Calendrier du projet
        </CardTitle>
        <p className="text-xs text-slate-500">
          Les jours ouvres et exceptions reconfigurent immediatement le planning, le chemin critique et les écarts.
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        <form action={action} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="projectId" value={proj.id} />

          <FieldLabel label="Nom du calendrier">
            <Input
              name="calendarName"
              defaultValue={cal.name}
              required
              className="h-9 text-sm"
            />
          </FieldLabel>

          <FieldLabel label="Fuseau horaire">
            <Input
              name="timezone"
              defaultValue={cal.timezone}
              required
              placeholder="Europe/Paris"
              className="h-9 text-sm"
            />
          </FieldLabel>

          <FieldLabel label="Heures par jour">
            <Input
              name="hoursPerDay"
              type="number"
              min={1}
              max={24}
              step={0.5}
              defaultValue={cal.hoursPerDay}
              required
              className="h-9 text-sm"
            />
          </FieldLabel>

          {/* Working days checkboxes */}
          <div className="md:col-span-2 grid gap-2">
            <div className="text-xs font-semibold text-slate-500">
              Jours ouvres
            </div>
            <div className="flex flex-wrap gap-2">
              {WORKING_DAY_OPTIONS.map((dayNum) => {
                const label = WORKING_DAY_LABELS[dayNum];
                return (
                  <label
                    key={dayNum}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                      cal.workingDays.includes(dayNum)
                        ? "border-[#56a45b]/40 bg-[#56a45b]/8 text-[#1a4a20]"
                        : "border-border/60 bg-white text-slate-500 hover:border-[#56a45b]/30 hover:text-slate-700",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="workingDays"
                      value={dayNum}
                      defaultChecked={cal.workingDays.includes(dayNum)}
                      className="size-4 rounded border-slate-300 accent-[#56a45b]"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>

          <FieldLabel label="Strategie de nivellement">
            <Select
              name="levelingStrategy"
              defaultValue={proj.levelingStrategy}
              className="h-9 text-sm"
            >
              <option value="PRIORITY_THEN_SLACK">Priorité puis marge</option>
              <option value="SLACK_THEN_PRIORITY">Marge puis priorité</option>
              <option value="MIN_DELAY">Délai minimal</option>
            </Select>
          </FieldLabel>

          <FieldLabel label="Délai maximum de nivellement (jours)">
            <Input
              name="levelingMaxDelayDays"
              type="number"
              min={0}
              max={3650}
              defaultValue={proj.levelingMaxDelayDays}
              required
              className="h-9 text-sm"
            />
          </FieldLabel>

          <FieldLabel label="Exceptions du calendrier" wide>
            <Textarea
              name="exceptions"
              defaultValue={exceptionsValue}
              className="min-h-[120px] font-mono text-xs"
            />
            <span className="text-[11px] font-normal text-slate-400 leading-5">
              Une exception par ligne : <code className="rounded bg-slate-100 px-1">AAAA-MM-JJ | Libelle | off</code>{" "}
              ou <code className="rounded bg-slate-100 px-1">AAAA-MM-JJ | Libelle | working</code>.
            </span>
          </FieldLabel>

          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
            <Feedback
              state={state}
              idleText="Les modifications reconfigurent le calendrier de planification en temps réel."
            />
            <Button type="submit" disabled={pending} className="shrink-0">
              {pending ? "Enregistrement..." : "Enregistrer le calendrier"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 3 — Zone de danger
// ---------------------------------------------------------------------------

type DangerZoneSectionProps = {
  view: ProjectView;
};

function DangerZoneSection({ view }: DangerZoneSectionProps) {
  const proj = view.aggregate.project;
  const isArchived = Boolean(proj.archivedAt);

  // Archive / restore
  const [archiveState, archiveAction, archivePending] = useActionState(
    setProjectArchiveStateAction,
    initialFormState,
  );

  // Delete
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteProjectAction,
    initialFormState,
  );
  const [confirmName, setConfirmName] = useState("");
  const [archiveChecked, setArchiveChecked] = useState(false);

  // Duplicate
  const [duplicateState, duplicateAction, duplicatePending] = useActionState(
    duplicateProjectAction,
    initialFormState,
  );

  return (
    <Card
      className="border-red-200"
      style={{ background: "#fff8f6" }}
    >
      <CardHeader className="border-b border-red-100 pb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.20em] text-red-400">
          Section 4
        </div>
        <CardTitle className="text-base font-bold text-red-900">
          Zone de danger
        </CardTitle>
        <p className="text-xs text-red-700/70">
          Ces actions sont irreversibles ou a fort impact. Lisez les avertissements avant de continuer.
        </p>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">

        {/* ---- Archive / Restaurer ---- */}
        <form
          action={archiveAction}
          className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 space-y-3"
        >
          <input type="hidden" name="projectId" value={proj.id} />
          <input type="hidden" name="actor" value={proj.ownerName} />
          <input type="hidden" name="archived" value={String(!isArchived)} />

          <div>
            <div className="text-sm font-semibold text-orange-900">
              {isArchived ? "Restaurer dans le portefeuille actif" : "Archiver le projet"}
            </div>
            <p className="mt-1 text-xs text-orange-800/80">
              {isArchived
                ? "La restauration remet le projet dans les vues actives sans modifier le planning."
                : "L'archivage retire le projet du portefeuille actif tout en conservant l'historique complet et l'auditabilite."}
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-orange-900 cursor-pointer">
            <input
              type="checkbox"
              className="size-4 rounded border-orange-300 accent-[#f4a321]"
              checked={archiveChecked}
              onChange={(e) => setArchiveChecked(e.target.checked)}
            />
            {isArchived
              ? "Je comprends que le projet redeviendra visible dans le portefeuille."
              : "Je comprends que le projet sera masque du portefeuille actif."}
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Feedback
              state={archiveState}
              idleText={
                isArchived
                  ? `Archive par ${proj.archivedBy ?? "l'equipe"}.`
                  : "Les projets archives restent accessibles via le filtre \"Archives\"."
              }
            />
            <Button
              type="submit"
              variant="orange"
              disabled={archivePending || !archiveChecked}
              className="shrink-0"
            >
              {archivePending
                ? "Mise à jour..."
                : isArchived
                  ? "Restaurer"
                  : "Archiver"}
            </Button>
          </div>
        </form>

        {/* ---- Dupliquer ---- */}
        <form
          action={duplicateAction}
          className="rounded-xl border border-slate-200 bg-white/70 p-4 space-y-3"
        >
          <input type="hidden" name="projectId" value={proj.id} />
          <input type="hidden" name="duplicatedBy" value={proj.ownerName} />

          <div>
            <div className="text-sm font-semibold text-slate-900">
              Dupliquer le projet
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Cree un bac a sable de planification avec le meme perimetre, la meme logique et les memes ressources. Le projet source reste intact.
            </p>
          </div>

          <FieldLabel label="Nom du projet duplique">
            <Input
              name="duplicateName"
              defaultValue={`${proj.name} - Copie`}
              className="h-9 text-sm bg-white"
            />
          </FieldLabel>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Feedback
              state={duplicateState}
              idleText="La duplication créé un scenario independant avec son propre historique."
            />
            <Button
              type="submit"
              variant="outline"
              disabled={duplicatePending}
              className="shrink-0"
            >
              {duplicatePending ? "Duplication..." : "Dupliquer le projet"}
            </Button>
          </div>
        </form>

        {/* ---- Supprimer ---- */}
        <form
          action={deleteAction}
          className="rounded-xl border border-rose-300 bg-rose-50/80 p-4 space-y-3"
        >
          <input type="hidden" name="projectId" value={proj.id} />

          <div>
            <div className="text-sm font-semibold text-rose-900">
              Supprimer définitivement le projet
            </div>
            <p className="mt-1 text-xs text-rose-800/80">
              Cette operation supprime irrevocablement le projet entier de la base de donnees : taches, dependances, ressources, affectations, baselines et tout l'historique. Cette action ne peut pas etre annulee.
            </p>
          </div>

          <label className="grid gap-1.5 text-xs font-semibold text-rose-900">
            Saisissez{" "}
            <span className="font-bold">{proj.name}</span>{" "}
            pour confirmer la suppression
            <Input
              name="confirmationName"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={proj.name}
              className="h-9 border-rose-300 bg-white text-sm focus:border-rose-400 focus:ring-rose-200"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Feedback
              state={deleteState}
              idleText="N'utilisez la suppression que si le projet doit être retire completement de l'espace de travail."
            />
            <Button
              type="submit"
              variant="destructive"
              disabled={deletePending || confirmName !== proj.name}
              className="shrink-0"
            >
              {deletePending ? "Suppression..." : "Supprimer le projet"}
            </Button>
          </div>
        </form>

      </CardContent>
    </Card>
  );
}

function TemplateSection({ view }: { view: ProjectView }) {
  const [state, action, pending] = useActionState(
    saveProjectTemplateAction,
    initialFormState,
  );
  const proj = view.aggregate.project;

  return (
    <Card>
      <CardHeader className="border-b border-border/40 pb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.20em] text-slate-400">
          Section 3
        </div>
        <CardTitle className="text-base font-bold text-[#1a4a20]">
          Modèle de projet
        </CardTitle>
        <p className="text-xs text-slate-500">
          Capture la structure, le planning, les ressources et les contrôles pour reutilisation sur un nouveau projet.
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        <form action={action} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="projectId" value={proj.id} />
          <FieldLabel label="Nom du modèle">
            <Input
              name="templateName"
              defaultValue={`${proj.name} - Modèle`}
              required
              className="h-9 text-sm"
            />
          </FieldLabel>
          <FieldLabel label="Description">
            <Input
              name="templateDescription"
              defaultValue={`Modèle créé depuis ${proj.name}.`}
              className="h-9 text-sm"
            />
          </FieldLabel>
          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
            <Feedback
              state={state}
              idleText="Le modèle sera disponible depuis la création de projet."
            />
            <Button type="submit" disabled={pending} className="shrink-0">
              {pending ? "Capture..." : "Enregistrer comme modèle"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main export — ProjectSettingsPage
// ---------------------------------------------------------------------------

export function ProjectSettingsPage({ view }: { view: ProjectView }) {
  return (
    <div className="space-y-6 pb-10">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
          Parametres
        </div>
        <h2
          className="text-xl font-black tracking-tight"
          style={{ color: "#1a4a20" }}
        >
          Paramètres du projet
        </h2>
        <p className="text-sm text-slate-500">
          Configurez les informations, le calendrier et le cycle de vie de votre projet.
        </p>
        {/* Brand accent bar */}
        <div className="mt-2 flex items-center gap-1.5">
          <div
            className="h-[3px] w-8 rounded-full"
            style={{ background: "#56a45b" }}
          />
          <div
            className="h-[3px] w-4 rounded-full"
            style={{ background: "#f4a321" }}
          />
        </div>
      </div>

      <MetadataSection view={view} />
      <CalendarSection view={view} />
      <TemplateSection view={view} />
      <DangerZoneSection view={view} />
    </div>
  );
}
