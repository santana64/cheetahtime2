"use client";

import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TaskOption = { id: string; label: string };

interface WhatIfResult {
  projectFinishDate: string | null;
  simulatedFinishDate: string | null;
  finishDeltaDays: number;
  plannedCostDelta: number;
  costOfDelayDelta: number;
  criticalPathTaskIds: string[];
  changedTaskIds: string[];
  summary: string;
}

function formatDay(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function WhatIfSimulator({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: TaskOption[];
}) {
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [days, setDays] = useState(5);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/what-if`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shiftTask: { taskId, days } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult((await res.json()) as WhatIfResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de simulation");
    } finally {
      setLoading(false);
    }
  }

  const dateTone =
    result == null || result.finishDeltaDays === 0
      ? "var(--foreground)"
      : result.finishDeltaDays > 0
        ? "var(--c-ecart-pos)"
        : "var(--c-ecart-neg)";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Simulateur what-if FGF</CardTitle>
        <p className="text-xs text-slate-500">
          « Et si cette tâche glisse de X jours ? » — impact instantané sur la date
          de fin du projet et le chemin critique.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-semibold text-slate-600">
            Tâche
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900"
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-28 flex-col gap-1 text-xs font-semibold text-slate-600">
            Glissement (j)
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900"
            />
          </label>
          <button
            onClick={run}
            disabled={loading || !taskId}
            className="h-9 rounded-lg px-4 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #56a45b, #3f8f48)",
              boxShadow: "0 4px 16px rgba(86,164,91,0.35)",
            }}
          >
            {loading ? "Calcul…" : "Simuler"}
          </button>
        </div>

        {error && (
          <p className="text-xs font-semibold text-rose-600">{error}</p>
        )}

        {result && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Nouvelle fin
                </div>
                <div className="mt-1 text-lg font-black" style={{ color: dateTone }}>
                  {formatDay(result.simulatedFinishDate)}
                </div>
                <div className="text-[10px] text-slate-500">
                  base {formatDay(result.projectFinishDate)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Impact délai
                </div>
                <div className="mt-1 text-lg font-black" style={{ color: dateTone }}>
                  {result.finishDeltaDays > 0 ? "+" : ""}
                  {result.finishDeltaDays} j
                </div>
              </div>
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              {result.summary}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
