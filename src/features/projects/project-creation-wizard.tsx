"use client";

import { FrenchDateInput } from "@/components/ui/french-date-input";
import { startTransition, useActionState, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createGuidedProjectAction, updateProjectStructureAction } from "@/features/projects/actions";
import type { ProjectEditData } from "@/services/projects";
import { initialFormState } from "@/features/projects/form-state";
import { buildRecommendedB2PDates } from "@/lib/fgf/b2p";
import { timeUnitShortLabel } from "@/lib/planning/time-unit";
import { projetPhases, timeUnits, type TimeUnit } from "@/types/planning";

/* ════════════════════════════════════════════════════════════════════
   Wizard de création — spec FGF complète :
   1. Identité (nom, phase, dates, UNITÉ DE TEMPS)
   2. Ressources (R01…, calendrier 7 h/j lun→ven modifiable)
   3. Lots de Tâches (code, nom, durée, prédécesseurs + lien + délai,
      ressources + intensité) — PT (Provision de Temps) systématique, ajoutables
   4. Tâches Hamac (TH01…, LT regroupés)
   5. Planning B2P (règle FGF, identique à la coûtenance)
════════════════════════════════════════════════════════════════════ */

type LinkType = "FS" | "SS" | "FF" | "SF";
type Pred = { code: string; type: LinkType; lag: string };
type Asg = { resourceCode: string; intensity: string };
type LotType = "DUREE" | "CHARGE" | "INTENSITE";
type ImposedKind = "" | "SNET" | "SNLT" | "FNET" | "FNLT";
type LotRow = {
  id: string;
  code: string;
  name: string;
  duration: string;
  budget: string;
  isPto: boolean;
  preds: Pred[];
  asgs: Asg[];
  lotType: LotType;
  charge: string;
  impKind: ImposedKind;
  impDate: string;
};

const LOT_TYPES: { value: LotType; label: string; hint: string }[] = [
  { value: "DUREE", label: "Durée", hint: "Saisie directe de la durée (unité de temps)" },
  { value: "CHARGE", label: "Charge", hint: "Durée = charge / intensité affectée (ressource × unité)" },
  { value: "INTENSITE", label: "Intensité", hint: "Le LT est borné par ses liens ; l'intensité pilote la charge" },
];
const IMPOSED_KINDS: { value: ImposedKind; label: string }[] = [
  { value: "", label: "Aucune date imposée" },
  { value: "SNET", label: "Ne pas commencer avant le" },
  { value: "SNLT", label: "Ne pas commencer après le" },
  { value: "FNET", label: "Ne pas finir avant le" },
  { value: "FNLT", label: "Ne pas finir après le" },
];
type ResRow = { id: string; code: string; name: string; hoursPerDay: string; days: number[] };
type ThRow = { id: string; code: string; name: string; lotCodes: string[] };
type JalonRow = { id: string; code: string; name: string; preds: Pred[] };

/** Spec FGF : 9 jalons au maximum. */
const MAX_JALONS = 9;

const LINK_TYPES: { value: LinkType; label: string; hint: string }[] = [
  { value: "FS", label: "FD", hint: "Fin → Début (le plus courant)" },
  { value: "SS", label: "DD", hint: "Début → Début" },
  { value: "FF", label: "FF", hint: "Fin → Fin" },
  { value: "SF", label: "DF", hint: "Début → Fin" },
];

const WEEKDAYS: { n: number; label: string }[] = [
  { n: 1, label: "L" }, { n: 2, label: "Ma" }, { n: 3, label: "Me" },
  { n: 4, label: "J" }, { n: 5, label: "V" }, { n: 6, label: "S" }, { n: 0, label: "D" },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function num(raw: string) {
  const v = Number(String(raw).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}
function nextCode(prefix: string, rows: { code: string }[]) {
  const used = new Set(rows.map((r) => r.code));
  for (let i = 1; i < 999; i++) {
    const code = `${prefix}${String(i).padStart(2, "0")}`;
    if (!used.has(code)) return code;
  }
  return `${prefix}${rows.length + 1}`;
}

/** Conversion de la saisie d'un projet existant vers les lignes de l'assistant. */
function editRows(data: ProjectEditData) {
  const st = data.structure;
  const preds = (list?: { code: string; type?: string; lag?: number }[]): Pred[] =>
    (list ?? []).map((p) => ({ code: p.code, type: (p.type as LinkType) ?? "FS", lag: p.lag ? String(p.lag) : "" }));
  return {
    resources: st.resources.map<ResRow>((r) => ({
      id: uid(),
      code: r.code,
      name: r.name,
      hoursPerDay: String(r.hoursPerDay ?? 7),
      days: r.workingDays?.length ? r.workingDays : [1, 2, 3, 4, 5],
    })),
    lots: st.lots.map<LotRow>((l) => ({
      id: uid(),
      code: l.code,
      name: l.name,
      duration: String(l.duration ?? 0),
      budget: String(l.budgetAmount ?? 0),
      isPto: Boolean(l.isPto),
      preds: preds(l.predecessors),
      asgs: (l.assignments ?? []).map((a) => ({ resourceCode: a.resourceCode, intensity: String(a.intensity) })),
      lotType: "DUREE",
      charge: "0",
      impKind: (l.imposed?.kind ?? "") as ImposedKind,
      impDate: l.imposed?.date ?? "",
    })),
    jalons: (st.jalons ?? []).map<JalonRow>((j) => ({ id: uid(), code: j.code, name: j.name, preds: preds(j.predecessors) })),
    hammocks: st.hammocks.map<ThRow>((h) => ({ id: uid(), code: h.code, name: h.name, lotCodes: h.lotCodes })),
  };
}

/** Pastille d'étape (1→5) — progression visible, façon cockpit CheetahCost. */
function StepChip({ n }: { n: number }) {
  return (
    <span
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-[12px] font-black"
      style={{
        background: "rgba(86,164,91,0.12)",
        border: "1px solid rgba(86,164,91,0.30)",
        color: "#2a6b30",
      }}
      aria-hidden="true"
    >
      {n}
    </span>
  );
}

const labelCls = "mb-1 block text-[11px] font-semibold text-slate-600";
const fieldCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none focus:border-[#56a45b]";
const cellCls =
  "w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12.5px] text-slate-900 outline-none focus:border-[#56a45b]";
const miniSelectCls =
  "rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-700 outline-none focus:border-[#56a45b]";
const chipBtnCls =
  "flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-500";

export function ProjectCreationWizard({ edit }: { edit?: { projectId: string; data: ProjectEditData } } = {}) {
  const [state, action, pending] = useActionState(
    edit ? updateProjectStructureAction : createGuidedProjectAction,
    initialFormState,
  );
  const [initialRows] = useState(() => (edit ? editRows(edit.data) : null));

  /* ── 1. Identité ── */
  const [name, setName] = useState(edit?.data.name ?? "");
  const [nameError, setNameError] = useState(false);
  const [phase, setPhase] = useState<string>(edit?.data.phase ?? "Réalisation");
  const [clientName, setClientName] = useState(edit?.data.clientName ?? "");
  const [currencyCode] = useState("EUR");
  const [timeUnit, setTimeUnit] = useState<TimeUnit>(edit?.data.structure.timeUnit ?? "jours");
  const [startDate, setStartDate] = useState(edit?.data.targetStartDate ?? todayIso());
  const [finishDate, setFinishDate] = useState(
    edit ? (edit.data.targetFinishDate ?? addDaysIso(edit.data.targetStartDate, 45)) : addDaysIso(todayIso(), 45),
  );
  const fixedFinish = useMemo(
    () => (finishDate < startDate ? startDate : finishDate),
    [finishDate, startDate],
  );
  const unitLabel = timeUnitShortLabel(timeUnit);

  /* ── 2. Ressources ── */
  const [resources, setResources] = useState<ResRow[]>(initialRows?.resources ?? [
    { id: uid(), code: "R01", name: "Chef de projet", hoursPerDay: "7", days: [1, 2, 3, 4, 5] },
  ]);

  /* ── 3. Lots de Tâches (PT — Provision de Temps — systématique) ── */
  const [lots, setLots] = useState<LotRow[]>(initialRows?.lots ?? [
    { id: uid(), code: "LT01", name: "", duration: "5", budget: "0", isPto: false, preds: [], asgs: [], lotType: "DUREE", charge: "0", impKind: "", impDate: "" },
    { id: uid(), code: "PT01", name: "Provision de Temps", duration: "0", budget: "0", isPto: true, preds: [], asgs: [], lotType: "DUREE", charge: "0", impKind: "", impDate: "" },
  ]);

  /* ── Élaboration du Planning Initial : conservé pour la reprise de brouillon ── */
  const [actionDesiree, setActionDesiree] = useState<"A" | "B" | "C">("B");

  /* ── 4. Jalons (J1…J9, durée nulle) ── */
  const [jalons, setJalons] = useState<JalonRow[]>(initialRows?.jalons ?? []);

  /* ── 5. Tâches Hamac ── */
  const [hammocks, setHammocks] = useState<ThRow[]>(initialRows?.hammocks ?? []);

  /* ── 5. Planning B2P ── */
  const recommended = useMemo(
    () => buildRecommendedB2PDates({ dateDebut: startDate, dateFin: fixedFinish }),
    [startDate, fixedFinish],
  );
  const [b2pDates, setB2pDates] = useState<string[]>(recommended);
  const recoKey = recommended.join("|");
  useEffect(() => {
    setB2pDates(recommended);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoKey]);

  /* ── Sauvegarde de secours anti-coupure ──────────────────────────────
     La saisie est enregistrée en continu dans le stockage local du poste.
     En cas d'arrêt anormal (batterie vide, plantage), elle est restaurée à
     la réouverture — plus aucune perte de saisie (demande François). */
  // En correction, un brouillon propre à chaque projet (jamais mélangé à une création).
  const WIZARD_DRAFT_KEY = edit ? `cheetah-time:wizard-edit:${edit.projectId}:v1` : "cheetah-time:wizard-draft:v1";
  const [hydrated, setHydrated] = useState(false);
  const [draftRecovered, setDraftRecovered] = useState(false);

  const draftSnapshot = () =>
    JSON.stringify({
      name, phase, clientName, timeUnit, startDate, finishDate,
      resources, lots, actionDesiree, jalons, hammocks, b2pDates,
    });

  // Restauration au montage (une seule fois).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WIZARD_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const meaningful =
          (typeof d.name === "string" && d.name.trim()) ||
          (typeof d.clientName === "string" && d.clientName.trim()) ||
          (Array.isArray(d.lots) && d.lots.some((l: LotRow) => l?.name && l.name.trim())) ||
          (Array.isArray(d.resources) && d.resources.length > 1);
        if (meaningful) {
          if (typeof d.name === "string") setName(d.name);
          if (typeof d.phase === "string") setPhase(d.phase);
          if (typeof d.clientName === "string") setClientName(d.clientName);
          if (typeof d.timeUnit === "string") setTimeUnit(d.timeUnit);
          if (typeof d.startDate === "string") setStartDate(d.startDate);
          if (typeof d.finishDate === "string") setFinishDate(d.finishDate);
          if (Array.isArray(d.resources)) setResources(d.resources);
          if (Array.isArray(d.lots)) setLots(d.lots);
          if (d.actionDesiree === "A" || d.actionDesiree === "B" || d.actionDesiree === "C") setActionDesiree(d.actionDesiree);
          if (Array.isArray(d.jalons)) setJalons(d.jalons);
          if (Array.isArray(d.hammocks)) setHammocks(d.hammocks);
          if (Array.isArray(d.b2pDates)) setB2pDates(d.b2pDates);
          setDraftRecovered(true);
        }
      }
    } catch {
      /* stockage inaccessible : on ignore */
    }
    setHydrated(true);
  }, [WIZARD_DRAFT_KEY]);

  // Enregistrement continu (après restauration seulement, pour ne pas écraser).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(WIZARD_DRAFT_KEY, draftSnapshot());
    } catch {
      /* quota/inaccessible : on ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, name, phase, clientName, timeUnit, startDate, finishDate, resources, lots, actionDesiree, jalons, hammocks, b2pDates]);

  // Si la création échoue (retour serveur en erreur), on rétablit le brouillon
  // (il a été effacé à la soumission) — la saisie n'est jamais perdue.
  useEffect(() => {
    if (state.status === "error" && hydrated) {
      try {
        localStorage.setItem(WIZARD_DRAFT_KEY, draftSnapshot());
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function clearDraft() {
    try {
      localStorage.removeItem(WIZARD_DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }
  function discardDraft() {
    clearDraft();
    if (typeof window !== "undefined") window.location.reload();
  }

  // Soumission MANUELLE (spec François, bug b22) : on n'utilise plus <form action={action}>
  // qui, en React 19, réinitialise le formulaire après l'action — ce qui vidait le nom et
  // remettait Phase/Unité à leur 1re option (« Faisabilité »/« heures »), bloquant la création.
  // Ici : on valide le nom côté client, on garde toute la saisie, et on n'efface le brouillon
  // que si l'envoi part réellement.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      const field = event.currentTarget.querySelector<HTMLInputElement>('input[name="name"]');
      field?.focus();
      field?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setNameError(false);
    const formData = new FormData(event.currentTarget);
    clearDraft();
    startTransition(() => action(formData));
  }

  /* ── Dérivés ── */
  const ltOnly = lots.filter((l) => !l.isPto);
  const ptoCount = lots.length - ltOnly.length;
  // Intensité (spec FGF) : un LT « Intensité » doit être borné par 2 prédécesseurs,
  // l'un DD/FD (début) et l'autre DF/FF (fin). Sinon on avertit (non bloquant).
  const intensityWarnings = lots
    .filter((l) => !l.isPto && l.lotType === "INTENSITE")
    .filter((l) => {
      const types = l.preds.filter((p) => p.code).map((p) => p.type);
      const hasStart = types.some((t) => t === "SS" || t === "FS");
      const hasEnd = types.some((t) => t === "FF" || t === "SF");
      return !(hasStart && hasEnd);
    })
    .map((l) => l.code);
  const lotCodesInTh = useMemo(() => {
    const map = new Map<string, string>();
    for (const th of hammocks) for (const c of th.lotCodes) if (!map.has(c)) map.set(c, th.code);
    return map;
  }, [hammocks]);

  const structurePayload = useMemo(
    () =>
      JSON.stringify({
        timeUnit,
        actionDesiree,
        resources: resources.map((r) => ({
          code: r.code,
          name: r.name,
          hoursPerDay: num(r.hoursPerDay) || 7,
          workingDays: r.days,
        })),
        lots: lots.map((l) => ({
          code: l.code,
          name: l.name,
          duration: num(l.duration),
          budgetAmount: num(l.budget),
          isPto: l.isPto,
          lotType: l.lotType,
          charge: num(l.charge),
          imposed: l.impKind && /^\d{4}-\d{2}-\d{2}$/.test(l.impDate) ? { kind: l.impKind, date: l.impDate } : null,
          predecessors: l.preds
            .filter((p) => p.code)
            .map((p) => ({ code: p.code, type: p.type, lag: num(p.lag) })),
          assignments: l.asgs
            .filter((a) => a.resourceCode)
            .map((a) => ({ resourceCode: a.resourceCode, intensity: num(a.intensity) })),
        })),
        hammocks: hammocks.map((th) => ({ code: th.code, name: th.name, lotCodes: th.lotCodes })),
        jalons: jalons.map((j) => ({
          code: j.code,
          name: j.name,
          predecessors: j.preds
            .filter((p) => p.code)
            .map((p) => ({ code: p.code, type: p.type, lag: num(p.lag) })),
        })),
      }),
    [timeUnit, actionDesiree, resources, lots, hammocks, jalons],
  );

  /* ── Mutations ── */
  const patchLot = (id: string, patch: Partial<LotRow>) =>
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLT = () =>
    setLots((prev) => {
      const row: LotRow = { id: uid(), code: nextCode("LT", prev), name: "", duration: "5", budget: "0", isPto: false, preds: [], asgs: [], lotType: "DUREE", charge: "0", impKind: "", impDate: "" };
      const firstPto = prev.findIndex((l) => l.isPto);
      return firstPto === -1 ? [...prev, row] : [...prev.slice(0, firstPto), row, ...prev.slice(firstPto)];
    });
  const addPTO = () =>
    setLots((prev) => [
      ...prev,
      { id: uid(), code: nextCode("PT", prev), name: "Provision de Temps", duration: "0", budget: "0", isPto: true, preds: [], asgs: [], lotType: "DUREE", charge: "0", impKind: "", impDate: "" },
    ]);
  const removeLot = (id: string) => {
    const lot = lots.find((l) => l.id === id);
    setLots((prev) => prev.filter((l) => l.id !== id));
    if (lot) {
      setLots((prev) => prev.map((l) => ({ ...l, preds: l.preds.filter((p) => p.code !== lot.code) })));
      setHammocks((prev) => prev.map((t) => ({ ...t, lotCodes: t.lotCodes.filter((c) => c !== lot.code) })));
    }
  };

  const patchRes = (id: string, patch: Partial<ResRow>) =>
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRes = () =>
    setResources((prev) => [...prev, { id: uid(), code: nextCode("R", prev), name: "", hoursPerDay: "7", days: [1, 2, 3, 4, 5] }]);
  const removeRes = (id: string) => {
    const res = resources.find((r) => r.id === id);
    setResources((prev) => prev.filter((r) => r.id !== id));
    if (res) setLots((prev) => prev.map((l) => ({ ...l, asgs: l.asgs.filter((a) => a.resourceCode !== res.code) })));
  };

  const addJalon = () =>
    setJalons((prev) =>
      prev.length >= MAX_JALONS
        ? prev
        : [...prev, { id: uid(), code: `J${prev.length + 1}`, name: "", preds: [] }],
    );
  const patchJalon = (id: string, patch: Partial<JalonRow>) =>
    setJalons((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  const removeJalon = (id: string) => {
    const jalon = jalons.find((j) => j.id === id);
    setJalons((prev) => prev.filter((j) => j.id !== id));
    if (jalon) {
      setLots((prev) => prev.map((l) => ({ ...l, preds: l.preds.filter((p) => p.code !== jalon.code) })));
      setJalons((prev) => prev.map((j) => ({ ...j, preds: j.preds.filter((p) => p.code !== jalon.code) })));
    }
  };

  const addTh = () =>
    setHammocks((prev) => [...prev, { id: uid(), code: nextCode("TH", prev), name: "", lotCodes: [] }]);
  const patchTh = (id: string, patch: Partial<ThRow>) =>
    setHammocks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const toggleThLot = (id: string, lotCode: string) =>
    setHammocks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const has = t.lotCodes.includes(lotCode);
        return { ...t, lotCodes: has ? t.lotCodes.filter((c) => c !== lotCode) : [...t.lotCodes, lotCode] };
      }),
    );

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {draftRecovered && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5"
          style={{ borderColor: "rgba(244,163,33,0.40)", background: "rgba(244,163,33,0.10)" }}>
          <div className="text-[12.5px] text-slate-700">
            <strong>Brouillon récupéré.</strong> Votre saisie précédente a été restaurée automatiquement
            (sauvegarde locale, anti-coupure).
          </div>
          <button type="button" onClick={discardDraft} className="toolbar-btn shrink-0">
            Repartir de zéro
          </button>
        </div>
      )}
      {edit ? (
        <div className="rounded-xl border px-4 py-3 text-[12.5px] text-slate-700"
          style={{ borderColor: "rgba(86,164,91,0.35)", background: "rgba(86,164,91,0.08)" }}>
          <strong>Correction de la saisie.</strong> Modifiez ce qui est faux (durées, liens, délais, ressources,
          intensités, Tâches Hamac…) puis enregistrez. Les LT dont le code ne change pas gardent leur avancement.
          Une version « Avant correction de la saisie » est enregistrée automatiquement : vous pouvez revenir en
          arrière depuis Fichier ▸ Historique du projet.
          {edit.data.hasLeveling ? (
            <> Le nivellement actuel sera retiré : relancez-le après la correction.</>
          ) : null}
        </div>
      ) : null}
      {edit ? <input type="hidden" name="projectId" value={edit.projectId} /> : null}
      <input type="hidden" name="phase" value={phase} />
      <input type="hidden" name="actionDesiree" value={actionDesiree} />
      <input type="hidden" name="targetStartDate" value={startDate} />
      {/* Fin initiale calculée par Cheetah Time (durées + liens) : on n'envoie AUCUNE échéance
          arbitraire — sinon les dates au plus tard et les marges seraient calculées à rebours
          depuis une fausse date de fin. En correction, la fin cible existante est conservée. */}
      <input type="hidden" name="targetFinishDate" value="" />
      <input type="hidden" name="currencyCode" value={currencyCode} />
      <input type="hidden" name="clientName" value={clientName} />
      <input type="hidden" name="structure" value={structurePayload} />
      {/* Les B2P sont datés à la désignation du Planning Initial (règle FGF sur la fin calculée). */}
      <input type="hidden" name="b2pDates" value="[]" />

      {/* ════ 1. Identité ════ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <StepChip n={1} />
            <CardTitle className="text-base">Identité du projet</CardTitle>
          </div>
          <p className="text-xs text-slate-500">
            Nom, phase, durée et <strong>unité de temps</strong> — les durées des LT seront saisies dans cette unité.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_220px_150px]">
            <div>
              <label className={labelCls}>Nom du projet *</label>
              <Input name="name" value={name}
                onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }}
                aria-invalid={nameError}
                style={nameError ? { borderColor: "#e2424a" } : undefined}
                placeholder="Ex : Réhabilitation Groupe Scolaire Jean Moulin" />
              {nameError && (
                <p className="mt-1 text-xs font-semibold text-rose-600">
                  Le nom du projet est obligatoire pour créer le projet.
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Phase</label>
              <select value={phase} onChange={(e) => setPhase(e.target.value)} className={fieldCls}>
                {projetPhases.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Unité de temps</label>
              <select value={timeUnit} onChange={(e) => setTimeUnit(e.target.value as TimeUnit)} className={fieldCls}>
                {timeUnits.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Date de début</label>
              <FrenchDateInput name="_date" key={startDate} defaultValue={startDate} onChange={(iso: string) => setStartDate(iso)} />
            </div>
            <div>
              <label className={labelCls}>Date de fin initiale</label>
              <div
                className={`${fieldCls} flex items-center text-slate-400`}
                title="Calculée automatiquement par Cheetah Time à partir des durées et liens des LT"
              >
                Calculée par Cheetah Time
              </div>
            </div>
          </div>

          {/* Élaboration du Planning Initial (remplace « Action désirée » — spec François 23/08) */}
          {edit ? null : <div className="rounded-xl border px-4 py-3" style={{ borderColor: "rgba(86,164,91,0.30)", background: "rgba(86,164,91,0.05)" }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#3f8f48]">Élaboration du Planning Initial</div>
            <p className="mt-1 text-[12px] leading-5 text-slate-600">
              Vous construisez ici votre planning (LT, liens, ressources, jalons). En créant le projet, ce planning devient
              un <strong>Nouveau Planning</strong> modifiable. Depuis l&apos;onglet <strong>Planning</strong>, enregistrez
              une ou plusieurs <strong>variantes (P01 → P99)</strong> puis <strong>désignez-en une comme Planning Initial (PI)</strong> :
              la <strong>date de fin initiale</strong> et les <strong>B2P</strong> sont alors datés, et le
              <strong> Pilotage du Temps</strong> (Bilans B2P) devient accessible.
            </p>
          </div>}
        </CardContent>
      </Card>

      {/* ════ 2. Ressources ════ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <StepChip n={2} />
              <CardTitle className="text-base">Ressources</CardTitle>
            </div>
            <p className="text-xs text-slate-500">Code, nom et calendrier de travail (7 h/jour, lundi → vendredi, modifiable).</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addRes}>+ Ajouter une ressource</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[64px_1fr_88px_auto_40px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              <div>Code</div><div>Nom</div><div className="text-right">h / jour</div><div>Jours travaillés</div><div />
            </div>
            <div className="divide-y divide-slate-100">
              {resources.map((r) => (
                <div key={r.id} className="grid grid-cols-[64px_1fr_88px_auto_40px] items-center gap-2 px-3 py-2">
                  <input value={r.code} onChange={(e) => patchRes(r.id, { code: e.target.value })}
                    className={`${cellCls} font-mono font-semibold`} />
                  <input value={r.name} onChange={(e) => patchRes(r.id, { name: e.target.value })}
                    placeholder="Ex : Développeur, Chef de projet…" className={cellCls} />
                  <input value={r.hoursPerDay} inputMode="decimal"
                    onChange={(e) => patchRes(r.id, { hoursPerDay: e.target.value })}
                    className={`${cellCls} text-right tabular-nums`} />
                  <div className="flex gap-1">
                    {WEEKDAYS.map((d) => {
                      const on = r.days.includes(d.n);
                      return (
                        <button key={d.n} type="button"
                          onClick={() => patchRes(r.id, { days: on ? r.days.filter((x) => x !== d.n) : [...r.days, d.n] })}
                          className="rounded-md px-1.5 py-1 text-[10px] font-bold transition-colors"
                          style={on
                            ? { background: "rgba(86,164,91,0.14)", border: "1px solid rgba(86,164,91,0.35)", color: "#2a6b30" }
                            : { background: "rgba(15,23,42,0.03)", border: "1px solid rgba(0,0,0,0.08)", color: "rgba(15,23,42,0.40)" }}
                          title={on ? "Jour travaillé" : "Jour chômé"}>
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => removeRes(r.id)} className={chipBtnCls} aria-label={`Supprimer la ressource ${r.code}`} title="Supprimer">×</button>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Les jours fériés du calendrier projet s&apos;appliquent automatiquement.</p>
        </CardContent>
      </Card>

      {/* ════ 3. Lots de Tâches ════ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <StepChip n={3} />
              <CardTitle className="text-base">Lots de Tâches (LT)</CardTitle>
            </div>
            <p className="text-xs text-slate-500">
              Code, nom, durée ({timeUnit}), prédécesseurs (type de lien + délai ±) et ressources avec intensité.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={addLT}>+ LT</Button>
            <Button type="button" size="sm" variant="outline" onClick={addPTO}
              title="Provision de Temps — plusieurs PT possibles, réparties dans le projet (max 9)">
              + PT
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Aide de saisie — pour que chaque information LT soit trouvable */}
          <div className="rounded-lg border border-[#56a45b]/30 bg-[#56a45b]/[0.06] px-3 py-2 text-[11.5px] leading-5 text-slate-700">
            Pour chaque LT : saisissez <strong>Code</strong>, <strong>Libellé</strong> et <strong>Durée</strong> sur la ligne.
            Puis, juste en dessous&#160;: <strong>Préd.</strong> → bouton <em>+ prédécesseur</em> — <strong>un LT peut en avoir plusieurs</strong> (cliquez autant de fois que nécessaire),
            chacun avec son type <strong>FD/DD/FF/DF</strong> et son délai&#160;±,
            <strong> Ress.</strong> → <em>+ ressource</em> (ressource + intensité), <strong>Type</strong> (Durée / Charge / Intensité),
            <strong> Date imp.</strong> (date imposée).
          </div>
          {/* En-tête des colonnes */}
          <div className="grid grid-cols-[72px_1fr_120px_40px] items-center gap-2 px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            <span>Code</span>
            <span>Libellé</span>
            <span className="pr-2 text-right">Durée</span>
            <span />
          </div>
          {lots.map((lot) => {
            const thCode = lotCodesInTh.get(lot.code);
            // Un LT peut dépendre d'un autre LT, d'une PTO ou d'un Jalon.
            const predOptions = [...lots.filter((o) => o.id !== lot.id), ...jalons];
            return (
              <div key={lot.id} className="rounded-xl border p-2.5"
                style={lot.isPto
                  ? { borderColor: "rgba(244,163,33,0.40)", background: "rgba(244,163,33,0.05)" }
                  : { borderColor: "rgba(0,0,0,0.09)", background: "white" }}>
                {/* Ligne principale — outil de délai : pas de montant/budget (cf. CdC) */}
                <div className="grid grid-cols-[72px_1fr_120px_40px] items-center gap-2">
                  <input value={lot.code} onChange={(e) => patchLot(lot.id, { code: e.target.value })}
                    aria-label="Code du lot" className={`${cellCls} font-mono font-semibold`} />
                  <input value={lot.name} onChange={(e) => patchLot(lot.id, { name: e.target.value })}
                    placeholder={lot.isPto ? "Provision de Temps" : "Ex : Management du projet, Définition…"}
                    className={cellCls} />
                  <div className="relative">
                    <input value={lot.duration} inputMode="decimal" aria-label={`Durée de ${lot.code}`}
                      onChange={(e) => patchLot(lot.id, { duration: e.target.value })}
                      className={`${cellCls} pr-9 text-right tabular-nums`}
                      title={lot.isPto ? "Durée de la Provision de Temps" : `Durée en ${timeUnit}`} />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                      {unitLabel}
                    </span>
                  </div>
                  <button type="button" onClick={() => removeLot(lot.id)} className={chipBtnCls} aria-label={`Supprimer ${lot.code}`} title="Supprimer">×</button>
                </div>

                {/* Sous-ligne : détails LT (prédécesseurs, ressources, type, date imposée) */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-[11.5px]">
                  {/* Prédécesseurs — un LT peut en avoir PLUSIEURS (ligne dédiée, spec François) */}
                  <div className="flex w-full flex-wrap items-center gap-1.5">
                    <span className="font-bold uppercase tracking-[0.12em] text-[#3f8f48]" title="Un LT peut avoir plusieurs prédécesseurs : ajoutez-en autant que nécessaire.">Préd.</span>
                    {lot.preds.map((p, pi) => (
                      <span key={pi} className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5">
                        <select value={p.code} className={miniSelectCls}
                          onChange={(e) => patchLot(lot.id, { preds: lot.preds.map((x, xi) => xi === pi ? { ...x, code: e.target.value } : x) })}>
                          {predOptions.map((o) => <option key={o.id} value={o.code}>{o.code}</option>)}
                        </select>
                        <select value={p.type} className={miniSelectCls}
                          title={LINK_TYPES.find((t) => t.value === p.type)?.hint}
                          onChange={(e) => patchLot(lot.id, { preds: lot.preds.map((x, xi) => xi === pi ? { ...x, type: e.target.value as LinkType } : x) })}>
                          {LINK_TYPES.map((t) => <option key={t.value} value={t.value} title={t.hint}>{t.label}</option>)}
                        </select>
                        <input value={p.lag} inputMode="decimal" placeholder="±0"
                          title={`Délai sur lien en ${timeUnit} (positif ou négatif)`}
                          onChange={(e) => patchLot(lot.id, { preds: lot.preds.map((x, xi) => xi === pi ? { ...x, lag: e.target.value } : x) })}
                          className="w-11 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-right text-[11px] tabular-nums outline-none focus:border-[#56a45b]" />
                        <button type="button" className="text-slate-400 hover:text-rose-500"
                          onClick={() => patchLot(lot.id, { preds: lot.preds.filter((_, xi) => xi !== pi) })}>×</button>
                      </span>
                    ))}
                    {predOptions.length > 0 && (
                      <button type="button"
                        onClick={() => patchLot(lot.id, { preds: [...lot.preds, { code: predOptions[0].code, type: "FS", lag: "0" }] })}
                        className="rounded-full border border-dashed border-[#56a45b]/50 px-2 py-0.5 font-semibold text-[#2a6b30] transition hover:border-[#56a45b] hover:bg-[#56a45b]/10">
                        + prédécesseur
                      </button>
                    )}
                    {lot.preds.length === 0 && <span className="text-slate-400">aucun — cliquez «&#160;+ prédécesseur&#160;» (plusieurs possibles)</span>}
                  </div>

                  {/* Ressources */}
                  {!lot.isPto && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold uppercase tracking-[0.12em] text-[#3f8f48]">Ress.</span>
                      {lot.asgs.map((a, ai) => (
                        <span key={ai} className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5">
                          <select value={a.resourceCode} className={miniSelectCls}
                            onChange={(e) => patchLot(lot.id, { asgs: lot.asgs.map((x, xi) => xi === ai ? { ...x, resourceCode: e.target.value } : x) })}>
                            {resources.map((r) => <option key={r.id} value={r.code}>{r.code}</option>)}
                          </select>
                          <input value={a.intensity} inputMode="decimal" placeholder="1,00"
                            title="Intensité (0,25 chef de projet · 2,00 développeurs…)"
                            onChange={(e) => patchLot(lot.id, { asgs: lot.asgs.map((x, xi) => xi === ai ? { ...x, intensity: e.target.value } : x) })}
                            className="w-12 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-right text-[11px] tabular-nums outline-none focus:border-[#56a45b]" />
                          <button type="button" className="text-slate-400 hover:text-rose-500"
                            onClick={() => patchLot(lot.id, { asgs: lot.asgs.filter((_, xi) => xi !== ai) })}>×</button>
                        </span>
                      ))}
                      {resources.length > 0 && (
                        <button type="button"
                          onClick={() => patchLot(lot.id, { asgs: [...lot.asgs, { resourceCode: resources[0].code, intensity: "1" }] })}
                          className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-slate-400 transition hover:border-[#56a45b] hover:text-[#2a6b30]">
                          + ressource
                        </button>
                      )}
                    </div>
                  )}

                  {/* Type de saisie (Durée / Charge / Intensité) */}
                  {!lot.isPto && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold uppercase tracking-[0.12em] text-[#3f8f48]">Type</span>
                      <select value={lot.lotType} className={miniSelectCls}
                        onChange={(e) => patchLot(lot.id, { lotType: e.target.value as LotType })}>
                        {LOT_TYPES.map((t) => <option key={t.value} value={t.value} title={t.hint}>{t.label}</option>)}
                      </select>
                      {lot.lotType === "CHARGE" && (
                        <input value={lot.charge} inputMode="decimal" placeholder="charge"
                          title={`Charge (ressource × ${timeUnit}) — durée = charge / intensité affectée`}
                          onChange={(e) => patchLot(lot.id, { charge: e.target.value })}
                          className="w-16 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-right text-[11px] tabular-nums outline-none focus:border-[#56a45b]" />
                      )}
                    </div>
                  )}

                  {/* Date imposée (SNET / SNLT / FNET / FNLT) */}
                  {!lot.isPto && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold uppercase tracking-[0.12em] text-[#3f8f48]">Date imp.</span>
                      <select value={lot.impKind} className={miniSelectCls}
                        onChange={(e) => patchLot(lot.id, { impKind: e.target.value as ImposedKind })}>
                        {IMPOSED_KINDS.map((k) => <option key={k.value || "none"} value={k.value}>{k.label}</option>)}
                      </select>
                      {lot.impKind && (
                        <FrenchDateInput name="_date" key={lot.impDate} defaultValue={lot.impDate} onChange={(iso: string) => patchLot(lot.id, { impDate: iso })} min={startDate} />
                      )}
                    </div>
                  )}

                  {thCode && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: "rgba(86,164,91,0.10)", border: "1px solid rgba(86,164,91,0.25)", color: "#2a6b30" }}>
                      ∈ {thCode}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <span className="text-[11px] text-slate-500">
              {ltOnly.length} LT · {ptoCount} PT
            </span>
            <span className="text-[11px] text-slate-500">
              Durées en {timeUnit}
            </span>
          </div>
          {intensityWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              <span className="font-semibold">Intensité — liens à compléter</span> : le·s LT{" "}
              <strong>{intensityWarnings.join(", ")}</strong> devraient avoir 2 prédécesseurs — un{" "}
              <strong>DD/FD</strong> (début) et un <strong>DF/FF</strong> (fin) — pour être bornés dans le
              temps. Vous pouvez continuer sans (non bloquant).
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════ 4. Jalons ════ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <StepChip n={4} />
              <CardTitle className="text-base">Jalons (J1…J9)</CardTitle>
            </div>
            <p className="text-xs text-slate-500">
              LT à durée nulle — « Définition terminée », « Dalle coulée »… 9 au maximum.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addJalon} disabled={jalons.length >= MAX_JALONS}>
            + Jalon {jalons.length >= MAX_JALONS ? "(max 9)" : ""}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {jalons.length === 0 && (
            <p className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-[12px] text-slate-400">
              Aucun jalon — optionnel ({MAX_JALONS} au maximum).
            </p>
          )}
          {jalons.map((jalon) => {
            const predOptions = [...lots, ...jalons.filter((o) => o.id !== jalon.id)];
            return (
              <div key={jalon.id} className="rounded-xl border border-slate-200 bg-white p-2.5">
                <div className="grid grid-cols-[72px_1fr_96px_40px] items-center gap-2">
                  <input value={jalon.code} onChange={(e) => patchJalon(jalon.id, { code: e.target.value })}
                    className={`${cellCls} font-mono font-semibold`} />
                  <input value={jalon.name} onChange={(e) => patchJalon(jalon.id, { name: e.target.value })}
                    placeholder="Ex : Définition terminée, Dalle coulée…" className={cellCls} />
                  <div className="text-right text-[11px] font-semibold text-slate-400" title="Durée nulle systématique">
                    durée 0
                  </div>
                  <button type="button" onClick={() => removeJalon(jalon.id)} className={chipBtnCls}
                    aria-label={`Supprimer ${jalon.code}`} title="Supprimer">×</button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[72px] text-[11px]">
                  <span className="font-bold uppercase tracking-[0.12em] text-[#3f8f48]">Préd.</span>
                  {jalon.preds.map((p, pi) => (
                    <span key={pi} className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5">
                      <select value={p.code} className={miniSelectCls}
                        onChange={(e) => patchJalon(jalon.id, { preds: jalon.preds.map((x, xi) => xi === pi ? { ...x, code: e.target.value } : x) })}>
                        {predOptions.map((o) => <option key={o.id} value={o.code}>{o.code}</option>)}
                      </select>
                      <select value={p.type} className={miniSelectCls}
                        title={LINK_TYPES.find((t) => t.value === p.type)?.hint}
                        onChange={(e) => patchJalon(jalon.id, { preds: jalon.preds.map((x, xi) => xi === pi ? { ...x, type: e.target.value as LinkType } : x) })}>
                        {LINK_TYPES.map((t) => <option key={t.value} value={t.value} title={t.hint}>{t.label}</option>)}
                      </select>
                      <input value={p.lag} inputMode="decimal" placeholder="±0"
                        title={`Délai sur lien en ${timeUnit} (positif ou négatif)`}
                        onChange={(e) => patchJalon(jalon.id, { preds: jalon.preds.map((x, xi) => xi === pi ? { ...x, lag: e.target.value } : x) })}
                        className="w-11 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-right text-[11px] tabular-nums outline-none focus:border-[#56a45b]" />
                      <button type="button" className="text-slate-400 hover:text-rose-500"
                        onClick={() => patchJalon(jalon.id, { preds: jalon.preds.filter((_, xi) => xi !== pi) })}>×</button>
                    </span>
                  ))}
                  {predOptions.length > 0 && (
                    <button type="button"
                      onClick={() => patchJalon(jalon.id, { preds: [...jalon.preds, { code: predOptions[0].code, type: "FS", lag: "0" }] })}
                      className="rounded-full border border-dashed border-[#56a45b]/50 px-2 py-0.5 font-semibold text-[#2a6b30] transition hover:border-[#56a45b] hover:bg-[#56a45b]/10">
                      + prédécesseur
                    </button>
                  )}
                  {jalon.preds.length === 0 && <span className="text-slate-400">aucun — cliquez «&#160;+ prédécesseur&#160;» (plusieurs possibles)</span>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ════ 5. Tâches Hamac ════ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <StepChip n={5} />
              <CardTitle className="text-base">Tâches Hamac (TH)</CardTitle>
            </div>
            <p className="text-xs text-slate-500">
              Tâches de synthèse regroupant des LT — ex. « Maçonnerie » pour fondations, dalle et élévation des murs.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addTh}>+ Tâche Hamac</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {hammocks.length === 0 && (
            <p className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-[12px] text-slate-400">
              Aucune Tâche Hamac — optionnel.
            </p>
          )}
          {hammocks.map((th) => (
            <div key={th.id} className="rounded-xl border border-slate-200 bg-white p-2.5">
              <div className="grid grid-cols-[72px_1fr_40px] items-center gap-2">
                <input value={th.code} onChange={(e) => patchTh(th.id, { code: e.target.value })}
                  className={`${cellCls} font-mono font-semibold`} />
                <input value={th.name} onChange={(e) => patchTh(th.id, { name: e.target.value })}
                  placeholder="Ex : Maçonnerie" className={cellCls} />
                <button type="button" onClick={() => setHammocks((prev) => prev.filter((t) => t.id !== th.id))} className={chipBtnCls} aria-label={`Supprimer ${th.code}`} title="Supprimer">×</button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[72px]">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">LT inclus</span>
                {ltOnly.map((lot) => {
                  const inThis = th.lotCodes.includes(lot.code);
                  const elsewhere = !inThis && lotCodesInTh.has(lot.code);
                  return (
                    <button key={lot.id} type="button" disabled={elsewhere}
                      onClick={() => toggleThLot(th.id, lot.code)}
                      title={elsewhere ? `Déjà dans ${lotCodesInTh.get(lot.code)}` : lot.name || lot.code}
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35"
                      style={inThis
                        ? { background: "rgba(86,164,91,0.14)", border: "1px solid rgba(86,164,91,0.40)", color: "#2a6b30" }
                        : { background: "rgba(15,23,42,0.03)", border: "1px solid rgba(0,0,0,0.08)", color: "rgba(15,23,42,0.50)" }}>
                      {lot.code}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* La section « Planning B2P » n'apparaît PLUS pendant l'élaboration (spec François
          23/08) : les B2P sont datés quand une variante de planning est désignée comme PI,
          depuis l'onglet Planning. */}

      {state.status === "error" && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          {state.message}
        </p>
      )}

      {/* ── Barre d'action ── */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 py-3 pl-4 pr-20 shadow-lg backdrop-blur">
        <div className="text-[12px] text-slate-600">
          <strong>{ltOnly.length}</strong> LT · <strong>{ptoCount}</strong> PT · <strong>{jalons.length}</strong> jalon(s) ·{" "}
          <strong>{hammocks.length}</strong> TH · <strong>{resources.length}</strong> ressource(s)
        </div>
        <Button
          type="submit"
          disabled={pending || !name.trim() || !recommended.length}
          style={{
            background: "linear-gradient(135deg, #56a45b, #3f8f48)",
            boxShadow: "0 4px 16px rgba(86,164,91,0.35)",
            color: "white",
          }}
        >
          {edit
            ? pending ? "Enregistrement…" : "Enregistrer les corrections →"
            : pending ? "Création…" : "Créer le projet →"}
        </Button>
      </div>
    </form>
  );
}
