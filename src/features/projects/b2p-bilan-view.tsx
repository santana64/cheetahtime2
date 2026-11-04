"use client";

import { useActionState, useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveB2PNoteAction, saveB2PScenarioAction } from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { PageHeader } from "@/components/app/ui-kit";
import { formatDateLabel } from "@/lib/format/formatters";
import type { B2PPlanningReview } from "@/lib/fgf/b2p-review";

const STATUT_STYLE: Record<string, { color: string; bg: string }> = {
  "Terminé": { color: "#047857", bg: "rgba(5,150,105,0.10)" },
  "En cours": { color: "#b45309", bg: "rgba(244,163,33,0.12)" },
  "Non démarré": { color: "rgba(15,23,42,0.55)", bg: "rgba(15,23,42,0.05)" },
};

type DelaiSynthese = {
  finInitiale: string | null;
  finPrevisionnelle: string | null;
  dateActuelle: string;
  glissementJours: number;
};

export function B2PBilanView({
  projectId,
  dates,
  cadenceLabel,
  review,
  notes,
  scenarios,
  delai,
}: {
  projectId: string;
  dates: string[];
  cadenceLabel: string;
  review: B2PPlanningReview;
  notes: Record<string, string>;
  scenarios: Record<string, string>;
  delai: DelaiSynthese;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultIndex = Math.max(0, dates.findIndex((d) => d >= today));
  const [index, setIndex] = useState(defaultIndex === -1 ? 0 : defaultIndex);
  const selectedDate = dates[index] ?? dates[0] ?? "";

  const [state, action, pending] = useActionState(saveB2PNoteAction, initialFormState);
  const [note, setNote] = useState(notes[selectedDate] ?? "");
  useEffect(() => {
    setNote(notes[selectedDate] ?? "");
  }, [selectedDate, notes]);

  const [scenState, scenAction, scenPending] = useActionState(saveB2PScenarioAction, initialFormState);
  const [scenario, setScenario] = useState(scenarios[selectedDate] ?? "");
  useEffect(() => {
    setScenario(scenarios[selectedDate] ?? "");
  }, [selectedDate, scenarios]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Méthode FGF · revue planning"
        title="Bilans B2P — durée"
        description={
          <>
            À chaque B2P, point d&apos;étape sur l&apos;avancement, les dates et le glissement par lot.
            Cadence : <strong>{cadenceLabel}</strong>.
          </>
        }
      />

      {/* Sélecteur de B2P */}
      <div className="flex flex-wrap gap-2">
        {dates.map((date, i) => {
          const isSel = i === index;
          const isPast = date < today;
          return (
            <button
              key={`${i}-${date}`}
              type="button"
              onClick={() => setIndex(i)}
              className="flex flex-col rounded-xl px-3 py-2 text-left transition-all"
              style={
                isSel
                  ? { background: "linear-gradient(135deg, rgba(86,164,91,0.20), rgba(86,164,91,0.08))", border: "1px solid rgba(86,164,91,0.45)" }
                  : { background: "rgba(15,23,42,0.03)", border: "1px solid rgba(0,0,0,0.07)" }
              }
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                {i === 0 ? "B2P0" : `B2P${i}`}{isPast ? " ✓" : ""}
                {notes[date] ? " · 📝" : ""}
              </span>
              <span className="text-[12.5px] font-bold text-slate-900">{formatDateLabel(date)}</span>
            </button>
          );
        })}
      </div>

      {/* Synthèse */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/70 bg-white/90 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Avancement global</div>
          <div className="mt-1 text-xl font-black text-[#1a4a20]">{review.avancementGlobal}%</div>
        </div>
        <div className="rounded-xl border border-white/70 bg-white/90 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Glissement projet</div>
          <div className="mt-1 text-xl font-black" style={{ color: review.glissementProjet > 0 ? "var(--c-ecart-pos)" : "var(--c-ecart-neg)" }}>
            {review.glissementProjet > 0 ? `+${review.glissementProjet} j` : "0 j"}
          </div>
        </div>
        <div className="rounded-xl border border-white/70 bg-white/90 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">B2P sélectionné</div>
          <div className="mt-1 text-xl font-black text-slate-900">{formatDateLabel(selectedDate)}</div>
        </div>
      </div>

      {/* Synthèse délai (lentille temps) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Synthèse délai — lentille temps</CardTitle>
          <p className="text-xs text-slate-500">
Fin Initiale, Fin Prévisionnelle, date actuelle et glissement (en jours) au B2P sélectionné.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { k: "Fin Initiale", v: formatDateLabel(delai.finInitiale), tone: "#111827" },
              { k: "Date actuelle", v: formatDateLabel(delai.dateActuelle), tone: "#3730a3" },
              { k: "Fin Prévisionnelle", v: formatDateLabel(delai.finPrevisionnelle), tone: "#047857" },
              {
                k: "Écart (glissement)",
                v: delai.glissementJours > 0 ? `+${delai.glissementJours} j` : "0 j",
                tone: delai.glissementJours > 0 ? "var(--c-ecart-pos)" : "var(--c-ecart-neg)",
              },
            ].map((c) => (
              <div key={c.k} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{c.k}</div>
                <div className="mt-1 text-base font-black" style={{ color: c.tone }}>{c.v}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tableau par lot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revue par lot — délai</CardTitle>
          <p className="text-xs text-slate-500">État courant du planning au B2P sélectionné.</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  <th className="px-3 py-2">Lot de tâches</th>
                  <th className="px-3 py-2 text-right">Avancement</th>
                  <th className="px-3 py-2">Fin prévue</th>
                  <th className="px-3 py-2 text-right">Glissement</th>
                  <th className="px-3 py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {review.lots.map((lot) => {
                  const st = STATUT_STYLE[lot.statut] ?? STATUT_STYLE["Non démarré"];
                  return (
                    <tr key={lot.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-900">{lot.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{lot.avancement}%</td>
                      <td className="px-3 py-2 text-slate-600">{formatDateLabel(lot.finPrevue)}</td>
                      <td
                        className="px-3 py-2 text-right tabular-nums font-semibold"
                        style={{ color: lot.glissementJours > 0 ? "var(--c-ecart-pos)" : "var(--c-ecart-neg)" }}
                      >
                        {lot.glissementJours > 0 ? `+${lot.glissementJours} j` : "0 j"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: st.color, background: st.bg }}>
                          {lot.statut}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Note de bilan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Note de bilan — {dates[index] ? (index === 0 ? "B2P0" : `B2P${index}`) : "B2P"}</CardTitle>
          <p className="text-xs text-slate-500">Décisions et points d&apos;attention planning consignés à ce B2P.</p>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="date" value={selectedDate} />
            <textarea
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Ex : glissement du lot Lots techniques, action de rattrapage décidée…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none focus:border-[#56a45b]"
            />
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Enregistrement…" : "Enregistrer la note"}
              </Button>
              {state.status === "success" && <span className="text-xs font-semibold text-emerald-700">{state.message}</span>}
              {state.status === "error" && <span className="text-xs font-semibold text-rose-600">{state.message}</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Scénarios correctifs (spec FGF B2) — envisagés / retenu, stockés par B2P */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scénarios correctifs — {dates[index] ? (index === 0 ? "B2P0" : `B2P${index}`) : "B2P"}</CardTitle>
          <p className="text-xs text-slate-500">
            En cas de retard : jeux de LT / plannings <strong>envisagés</strong> puis <strong>retenu</strong> à ce B2P (LT ajoutés/supprimés/modifiés, délais, intensités).
          </p>
        </CardHeader>
        <CardContent>
          <form action={scenAction} className="space-y-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="date" value={selectedDate} />
            <textarea
              name="scenario"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              rows={5}
              placeholder={"Ex :\n• Envisagé A : +1 équipe sur B4 (intensité 2) → −1 mois\n• Envisagé B : chevaucher B5/B6 (lien DD) → −0,5 mois\n• RETENU : A (rattrapage 1 mois, coût accepté)"}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none focus:border-[#56a45b]"
            />
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={scenPending}>
                {scenPending ? "Enregistrement…" : "Enregistrer les scénarios"}
              </Button>
              {scenState.status === "success" && <span className="text-xs font-semibold text-emerald-700">{scenState.message}</span>}
              {scenState.status === "error" && <span className="text-xs font-semibold text-rose-600">{scenState.message}</span>}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
