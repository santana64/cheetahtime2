"use client";

import { useActionState, useEffect, useState } from "react";

import {
  createRiskAction,
  updateRiskAction,
  deleteRiskAction,
} from "@/features/projects/actions";
import { initialFormState, type FormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { RiskItem, RiskCategory, RiskLevel, RiskStatus } from "@/services/risks";

// ---------------------------------------------------------------------------
// Level numeric weights
// ---------------------------------------------------------------------------

type LevelWeight = 1 | 2 | 3 | 4;

const LEVEL_WEIGHT: Record<RiskLevel, LevelWeight> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function riskScore(probability: RiskLevel, impact: RiskLevel): number {
  return LEVEL_WEIGHT[probability] * LEVEL_WEIGHT[impact];
}

type ScoreBand = "LOW" | "MEDIUM" | "HIGH";

function scoreBand(score: number): ScoreBand {
  if (score <= 4) return "LOW";
  if (score <= 8) return "MEDIUM";
  return "HIGH";
}

// ---------------------------------------------------------------------------
// Label maps (French)
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<RiskCategory, string> = {
  TECHNICAL: "Technique",
  SCHEDULE: "Planning",
  COST: "Cout",
  RESOURCE: "Ressource",
  EXTERNAL: "Externe",
  LEGAL: "Juridique",
  OTHER: "Autre",
};

const LEVEL_LABELS: Record<RiskLevel, string> = {
  LOW: "Faible",
  MEDIUM: "Moyen",
  HIGH: "Eleve",
  CRITICAL: "Critique",
};

const STATUS_LABELS: Record<RiskStatus, string> = {
  OPEN: "Ouvert",
  MITIGATED: "Attenuation",
  ACCEPTED: "Accepte",
  CLOSED: "Ferme",
  ESCALATED: "Escalade",
};

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const SCORE_BORDER: Record<ScoreBand, string> = {
  LOW: "border-l-[#56a45b]",
  MEDIUM: "border-l-[#f4a321]",
  HIGH: "border-l-rose-600",
};

const SCORE_PILL: Record<ScoreBand, string> = {
  LOW: "bg-[#56a45b]/12 text-[#1a4a20]",
  MEDIUM: "bg-[#f4a321]/15 text-amber-800",
  HIGH: "bg-rose-100 text-rose-800",
};

const LEVEL_PILL: Record<RiskLevel, string> = {
  LOW: "bg-[#56a45b]/12 text-[#1a4a20]",
  MEDIUM: "bg-[#f4a321]/15 text-amber-800",
  HIGH: "bg-rose-100 text-rose-800",
  CRITICAL: "bg-rose-200 text-rose-900",
};

const STATUS_PILL: Record<RiskStatus, string> = {
  OPEN: "bg-sky-100 text-sky-800",
  MITIGATED: "bg-[#56a45b]/12 text-[#1a4a20]",
  ACCEPTED: "bg-slate-100 text-slate-700",
  CLOSED: "bg-slate-200 text-slate-600",
  ESCALATED: "bg-rose-100 text-rose-800",
};

const CATEGORY_PILL: Record<RiskCategory, string> = {
  TECHNICAL: "bg-violet-100 text-violet-800",
  SCHEDULE: "bg-sky-100 text-sky-800",
  COST: "bg-amber-100 text-amber-800",
  RESOURCE: "bg-teal-100 text-teal-800",
  EXTERNAL: "bg-indigo-100 text-indigo-800",
  LEGAL: "bg-rose-100 text-rose-800",
  OTHER: "bg-slate-100 text-slate-700",
};

// ---------------------------------------------------------------------------
// Shared Pill component
// ---------------------------------------------------------------------------

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

type StatCardProps = {
  label: string;
  value: number;
  accent?: string;
};

function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <Card className="border-white/70 bg-white/95">
      <CardContent className="flex flex-col gap-1 py-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.20em] text-slate-500">
          {label}
        </div>
        <div
          className="text-3xl font-black leading-none"
          style={{ color: accent ?? "#1a4a20" }}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-[#56a45b]/30 bg-white/60 py-16 text-center">
      <svg
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#56a45b"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <circle cx="12" cy="16" r="0.5" fill="#56a45b" />
      </svg>
      <div>
        <p className="text-base font-semibold text-slate-800">Aucun risque enregistre</p>
        <p className="mt-1 text-sm text-slate-500">
          Commencez par identifier les risques de ce projet.
        </p>
      </div>
      <Button onClick={onNew} size="lg">
        Nouveau risque
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form fields shared by create + edit
// ---------------------------------------------------------------------------

type DrawerFormBodyProps = {
  risk?: RiskItem | null;
  pending: boolean;
  state: FormState;
  projectId: string;
};

function DrawerFormBody({ risk, pending, state, projectId }: DrawerFormBodyProps) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      {risk ? (
        <>
          <input type="hidden" name="riskId" value={risk.id} />
          <input type="hidden" name="projectId" value={projectId} />
        </>
      ) : (
        <input type="hidden" name="projectId" value={projectId} />
      )}

      {/* Title */}
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
        Titre <span className="font-normal text-rose-500">*</span>
        <Input
          name="title"
          required
          defaultValue={risk?.title ?? ""}
          placeholder="Intitule court du risque"
        />
      </label>

      {/* Description */}
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
        Description
        <Textarea
          name="description"
          defaultValue={risk?.description ?? ""}
          placeholder="Description detaillee du risque"
          className="min-h-[80px]"
        />
      </label>

      {/* Category + Status */}
      <div className="grid grid-cols-2 gap-4">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Categorie
          <Select name="category" defaultValue={risk?.category ?? "TECHNICAL"}>
            {(Object.keys(CATEGORY_LABELS) as RiskCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </Select>
        </label>

        {risk ? (
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Statut
            <Select name="status" defaultValue={risk.status}>
              {(Object.keys(STATUS_LABELS) as RiskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>

      {/* Probability + Impact */}
      <div className="grid grid-cols-2 gap-4">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Probabilite
          <Select name="probability" defaultValue={risk?.probability ?? "MEDIUM"}>
            {(Object.keys(LEVEL_LABELS) as RiskLevel[]).map((lvl) => (
              <option key={lvl} value={lvl}>
                {LEVEL_LABELS[lvl]}
              </option>
            ))}
          </Select>
        </label>

        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Impact
          <Select name="impact" defaultValue={risk?.impact ?? "MEDIUM"}>
            {(Object.keys(LEVEL_LABELS) as RiskLevel[]).map((lvl) => (
              <option key={lvl} value={lvl}>
                {LEVEL_LABELS[lvl]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {/* Owner */}
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
        Responsable
        <Input
          name="ownerName"
          defaultValue={risk?.ownerName ?? ""}
          placeholder="Nom du responsable du risque"
        />
      </label>

      {/* Mitigation */}
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
        Plan d&apos;attenuation
        <Textarea
          name="mitigation"
          defaultValue={risk?.mitigation ?? ""}
          placeholder="Actions preventives pour reduire la probabilite ou l'impact"
          className="min-h-[80px]"
        />
      </label>

      {/* Contingency */}
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
        Plan de contingence
        <Textarea
          name="contingency"
          defaultValue={risk?.contingency ?? ""}
          placeholder="Actions correctives si le risque se materialise"
          className="min-h-[80px]"
        />
      </label>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Date d&apos;identification
          <Input
            type="date"
            name="identifiedDate"
            defaultValue={risk?.identifiedDate ?? today}
          />
        </label>

        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Date cible
          <Input
            type="date"
            name="targetDate"
            defaultValue={risk?.targetDate ?? ""}
          />
        </label>
      </div>

      {/* Feedback */}
      {state.status !== "idle" ? (
        <div
          className={cn(
            "rounded-xl px-4 py-3 text-sm font-medium",
            state.status === "success"
              ? "bg-[#56a45b]/10 text-[#1a4a20]"
              : "bg-rose-50 text-rose-700",
          )}
        >
          {state.message}
        </div>
      ) : null}

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" size="lg" disabled={pending}>
          {pending
            ? "Enregistrement..."
            : risk
              ? "Mettre a jour"
              : "Creer le risque"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm row state
// ---------------------------------------------------------------------------

type DeleteRowProps = {
  risk: RiskItem;
  projectId: string;
};

function DeleteRow({ risk, projectId }: DeleteRowProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setConfirming(true)}
        aria-label="Supprimer ce risque"
      >
        Supprimer
      </Button>
    );
  }

  return (
    <form action={deleteRiskAction} className="flex items-center gap-1.5">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="riskId" value={risk.id} />
      <span className="text-xs font-medium text-rose-700">Confirmer ?</span>
      <Button type="submit" variant="destructive" size="sm">
        Oui
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setConfirming(false)}
      >
        Non
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Right drawer panel
// ---------------------------------------------------------------------------

type PanelMode = "create" | "edit";

type DrawerProps = {
  open: boolean;
  mode: PanelMode;
  risk: RiskItem | null;
  projectId: string;
  onClose: () => void;
};

function RiskDrawer({ open, mode, risk, projectId, onClose }: DrawerProps) {
  const [createState, createAction, createPending] = useActionState(
    createRiskAction,
    initialFormState,
  );
  const [editState, editAction, editPending] = useActionState(
    updateRiskAction,
    initialFormState,
  );

  useEffect(() => {
    if (createState.status === "success" || editState.status === "success") {
      onClose();
    }
  }, [createState.status, editState.status, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col",
          "shadow-2xl transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-modal="true"
        role="dialog"
        aria-label={mode === "create" ? "Creer un risque" : "Modifier le risque"}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ background: "#1a4a20" }}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#56a45b]">
              Registre des risques
            </div>
            <h2 className="mt-0.5 text-base font-black text-white" style={{ letterSpacing: "-0.02em" }}>
              {mode === "create" ? "Nouveau risque" : "Modifier le risque"}
            </h2>
            {risk ? (
              <div className="mt-0.5 text-xs text-white/60">{risk.code}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
            aria-label="Fermer le panneau"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto bg-white">
          {mode === "create" ? (
            <form action={createAction}>
              <DrawerFormBody
                risk={null}
                pending={createPending}
                state={createState}
                projectId={projectId}
              />
            </form>
          ) : (
            <form action={editAction}>
              <DrawerFormBody
                risk={risk}
                pending={editPending}
                state={editState}
                projectId={projectId}
              />
            </form>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main RiskRegister component
// ---------------------------------------------------------------------------

type DrawerState = {
  open: boolean;
  mode: PanelMode;
  risk: RiskItem | null;
};

const DRAWER_CLOSED: DrawerState = { open: false, mode: "create", risk: null };

export function RiskRegister({
  projectId,
  risks,
}: {
  projectId: string;
  risks: RiskItem[];
}) {
  const [drawer, setDrawer] = useState<DrawerState>(DRAWER_CLOSED);

  function openCreate() {
    setDrawer({ open: true, mode: "create", risk: null });
  }

  function openEdit(risk: RiskItem) {
    setDrawer({ open: true, mode: "edit", risk });
  }

  function closeDrawer() {
    setDrawer(DRAWER_CLOSED);
  }

  // Statistics
  const total = risks.length;
  const openCount = risks.filter((r) => r.status === "OPEN").length;
  const closedCount = risks.filter((r) => r.status === "CLOSED").length;
  const criticalCount = risks.filter(
    (r) => scoreBand(riskScore(r.probability, r.impact)) === "HIGH",
  ).length;

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.980 0.004 85)" }}>
      {/* Page header */}
      <div className="border-b border-[#56a45b]/15 bg-white/80 px-6 py-5 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <h1
              className="text-xl font-black"
              style={{ color: "#1a4a20", letterSpacing: "-0.025em" }}
            >
              Registre des risques
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Identifiez, evaluez et gerez les risques du projet.
            </p>
          </div>
          <Button onClick={openCreate} size="lg">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nouveau risque
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total" value={total} />
          <StatCard label="Ouverts" value={openCount} accent="#1a6bcc" />
          <StatCard label="Score critique" value={criticalCount} accent="#b91c1c" />
          <StatCard label="Fermes" value={closedCount} accent="#56a45b" />
        </div>

        {/* Table or empty state */}
        {risks.length === 0 ? (
          <EmptyState onNew={openCreate} />
        ) : (
          <Card className="overflow-hidden border-white/70 bg-white/95">
            <CardHeader className="border-b border-[#56a45b]/12">
              <CardTitle>
                {total} risque{total !== 1 ? "s" : ""} identifies
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        Code
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        Risque
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        Categorie
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        Prob.
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        Impact
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        Score
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        Statut
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        Responsable
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        Echeance
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {risks.map((risk) => {
                      const score = riskScore(risk.probability, risk.impact);
                      const band = scoreBand(score);
                      const isActive =
                        drawer.open && drawer.risk?.id === risk.id;

                      return (
                        <tr
                          key={risk.id}
                          className={cn(
                            "border-b border-slate-50 border-l-4 transition-colors",
                            SCORE_BORDER[band],
                            isActive
                              ? "bg-[#56a45b]/6"
                              : "hover:bg-slate-50/70",
                          )}
                        >
                          <td className="px-4 py-3 font-mono text-[11px] font-semibold text-slate-600">
                            {risk.code}
                          </td>
                          <td className="px-4 py-3">
                            <div className="max-w-[200px]">
                              <div className="font-semibold text-slate-900 leading-snug line-clamp-2">
                                {risk.title}
                              </div>
                              {risk.ownerName ? (
                                <div className="mt-0.5 text-xs text-slate-400 truncate">
                                  {risk.ownerName}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Pill className={CATEGORY_PILL[risk.category]}>
                              {CATEGORY_LABELS[risk.category]}
                            </Pill>
                          </td>
                          <td className="px-4 py-3">
                            <Pill className={LEVEL_PILL[risk.probability]}>
                              {LEVEL_LABELS[risk.probability]}
                            </Pill>
                          </td>
                          <td className="px-4 py-3">
                            <Pill className={LEVEL_PILL[risk.impact]}>
                              {LEVEL_LABELS[risk.impact]}
                            </Pill>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black",
                                SCORE_PILL[band],
                              )}
                            >
                              {score}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Pill className={STATUS_PILL[risk.status]}>
                              {STATUS_LABELS[risk.status]}
                            </Pill>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {risk.ownerName || (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {risk.targetDate
                              ? new Date(risk.targetDate).toLocaleDateString("fr-FR", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })
                              : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(risk)}
                              >
                                Modifier
                              </Button>
                              <DeleteRow risk={risk} projectId={projectId} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Drawer */}
      <RiskDrawer
        open={drawer.open}
        mode={drawer.mode}
        risk={drawer.risk}
        projectId={projectId}
        onClose={closeDrawer}
      />
    </div>
  );
}
