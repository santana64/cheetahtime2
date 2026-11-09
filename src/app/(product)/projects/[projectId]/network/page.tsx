import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/ui-kit";
import { fromWorkingDays, timeUnitShortLabel } from "@/lib/planning/time-unit";
import { getProjectView } from "@/services/projects";
import type { DependencyType, TimeUnit } from "@/types/planning";

/**
 * Représentation potentiel-tâches (méthode des potentiels / MPM), CdC p. 15 et
 * corrigé du cas sportif (Q1, Q3) :
 *  - une ligne par tâche (les Tâches Hamac ne sont pas des tâches : pas de ligne) ;
 *  - chaque tâche est un petit rectangle placé selon son niveau dans l'enchaînement ;
 *  - flèches de précédence ancrées selon le type de lien :
 *      FD : fin → début · DD : début → début · FF : fin → fin · DF : début → fin ;
 *  - décalages exprimés dans l'unité du projet (« −1 mois ») ;
 *  - seuls les liens logiques saisis sont tracés (les liens ressources créés par
 *    le nivellement ne font pas partie de la logique du projet).
 */

const LINK_FR: Record<DependencyType, string> = { FS: "FD", SS: "DD", FF: "FF", SF: "DF" };
const CRIT = "#e2424a";
const PSEUDO = "#e0902a";
const NORMAL = "#3f8f48";
const LINE = "#64748b";
const MAX_TASKS = 400;

type PtNode = {
  id: string;
  code: string;
  name: string;
  milestone: boolean;
  critical: boolean;
  pseudo: boolean;
  rank: number;
  duration: number;
  es: string | null;
  ef: string | null;
  ls: string | null;
  lf: string | null;
  ml: number | null;
  mt: number | null;
};
type PtEdge = { id: string; from: string; to: string; type: DependencyType; lag: number };

const fmtNum = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const fmtLag = (lag: number, unit: string) => (lag > 0 ? `+${fmtNum(lag)} ${unit}` : `−${fmtNum(-lag)} ${unit}`);
const fmtDate = (iso: string | null) =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "—";
const colorOf = (n: PtNode) => (n.critical ? CRIT : n.pseudo ? PSEUDO : NORMAL);
const edgeLabel = (e: PtEdge, unit: string) =>
  e.type === "FS" && !e.lag ? "" : `${LINK_FR[e.type]}${e.lag ? ` ${fmtLag(e.lag, unit)}` : ""}`;

/** Niveau dans l'enchaînement : plus long chemin depuis une tâche sans prédécesseur. */
function computeRanks(ids: string[], edges: PtEdge[]) {
  const preds = new Map<string, string[]>();
  for (const e of edges) preds.set(e.to, [...(preds.get(e.to) ?? []), e.from]);
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const rankOf = (id: string): number => {
    const known = rank.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // boucle : on coupe
    visiting.add(id);
    const r = Math.max(-1, ...(preds.get(id) ?? []).map(rankOf)) + 1;
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };
  ids.forEach(rankOf);
  return rank;
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * Tracé orthogonal d'une flèche entre deux boîtes, ancré selon le type de lien.
 * Les segments verticaux passent dans les couloirs entre colonnes et le trajet
 * horizontal dans le couloir au-dessus de la ligne d'arrivée : on ne traverse
 * jamais une boîte.
 */
function routeEdge(src: Box, tgt: Box, type: DependencyType, gutter: number, laneY: number) {
  const fromEnd = type === "FS" || type === "FF";
  const toStart = type === "FS" || type === "SS";
  const sy = src.y + src.h / 2;
  const ty = tgt.y + tgt.h / 2;
  const sx = fromEnd ? src.x + src.w : src.x;
  const ex = fromEnd ? sx + gutter : sx - gutter;
  const tx = toStart ? tgt.x - 2 : tgt.x + tgt.w + 2;
  const ax = toStart ? tgt.x - gutter : tgt.x + tgt.w + gutter;
  const d = `M ${sx} ${sy} H ${ex} V ${laneY} H ${ax} V ${ty} H ${tx}`;
  const label = toStart
    ? { x: tgt.x - 5, y: ty - 5, anchor: "end" as const }
    : { x: tgt.x + tgt.w + 5, y: ty - 5, anchor: "start" as const };
  return { d, label };
}

function Defs({ prefix }: { prefix: string }) {
  return (
    <defs>
      <marker id={`${prefix}-a`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L7,3 z" fill={LINE} />
      </marker>
      <marker id={`${prefix}-c`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L7,3 z" fill={CRIT} />
      </marker>
    </defs>
  );
}

function EdgeLabel({ x, y, anchor, text }: { x: number; y: number; anchor: "start" | "end"; text: string }) {
  if (!text) return null;
  const w = text.length * 5.6 + 8;
  const rx = anchor === "end" ? x - w : x;
  return (
    <g>
      <rect x={rx} y={y - 10} width={w} height={13} rx={3} fill="#fff" stroke="#e2e8f0" />
      <text x={rx + 4} y={y} fontSize="9.5" fontWeight="700" fill="#334155">
        {text}
      </text>
    </g>
  );
}

/** Grille du CdC : une tâche par ligne, rectangle placé selon le niveau d'enchaînement. */
function LineGrid({ nodes, edges, unit }: { nodes: PtNode[]; edges: PtEdge[]; unit: string }) {
  const LABEL_W = 270, COL_W = 92, BOX_W = 56, ROW_H = 36, BOX_H = 20, PAD = 14;
  const maxRank = Math.max(0, ...nodes.map((n) => n.rank));
  const row = new Map(nodes.map((n, i) => [n.id, i]));
  const box = (id: string): Box => {
    const n = nodes[row.get(id)!];
    return { x: LABEL_W + n.rank * COL_W + 22, y: PAD + row.get(id)! * ROW_H + (ROW_H - BOX_H) / 2, w: BOX_W, h: BOX_H };
  };
  const W = LABEL_W + (maxRank + 1) * COL_W + 60;
  const H = PAD * 2 + nodes.length * ROW_H;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="overflow-x-auto">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(W, 960), maxWidth: W }} role="img" aria-label="Représentation potentiel-tâches : une tâche par ligne">
        <Defs prefix="pl" />
        {nodes.map((n, i) => (
          <g key={`row-${n.id}`}>
            {i % 2 === 0 ? <rect x={0} y={PAD + i * ROW_H} width={W} height={ROW_H} fill="#faf9f5" /> : null}
            <text x={PAD} y={PAD + i * ROW_H + ROW_H / 2 + 4} fontSize="11.5" fontWeight="800" fill={colorOf(n)}>
              {n.code}
            </text>
            <text x={PAD + 46} y={PAD + i * ROW_H + ROW_H / 2 + 4} fontSize="11.5" fill="#0f172a" fontWeight={n.critical ? 700 : 500}>
              {n.name.length > 32 ? `${n.name.slice(0, 31)}…` : n.name}
            </text>
          </g>
        ))}
        {Array.from({ length: maxRank + 1 }, (_, c) => (
          <line key={`col-${c}`} x1={LABEL_W + c * COL_W} x2={LABEL_W + c * COL_W} y1={PAD} y2={H - PAD} stroke="#ece9e1" />
        ))}
        {edges.map((e) => {
          if (!row.has(e.from) || !row.has(e.to)) return null;
          const src = byId.get(e.from)!;
          const tgt = byId.get(e.to)!;
          const crit = src.critical && tgt.critical;
          const tb = box(e.to);
          const r = routeEdge(box(e.from), tb, e.type, 12, tb.y - (ROW_H - BOX_H) / 2 + 1);
          return (
            <path key={e.id} d={r.d} fill="none" stroke={crit ? CRIT : LINE} strokeWidth={crit ? 1.8 : 1.1} markerEnd={`url(#pl-${crit ? "c" : "a"})`} />
          );
        })}
        {nodes.map((n) => {
          const b = box(n.id);
          const c = colorOf(n);
          return (
            <g key={`box-${n.id}`}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={n.milestone ? 10 : 4} fill="#fff" stroke={c} strokeWidth={n.critical ? 2.2 : 1.4} />
              <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 4} fontSize="10.5" textAnchor="middle" fill="#0f172a" fontWeight="800">
                {n.code}
              </text>
            </g>
          );
        })}
        {edges.map((e) => {
          if (!row.has(e.from) || !row.has(e.to)) return null;
          const tb = box(e.to);
          const r = routeEdge(box(e.from), tb, e.type, 12, tb.y - (ROW_H - BOX_H) / 2 + 1);
          return <EdgeLabel key={`l-${e.id}`} {...r.label} text={edgeLabel(e, unit)} />;
        })}
      </svg>
    </div>
  );
}

/** Réseau détaillé : une colonne par niveau d'enchaînement, boîtes avec dates et marges. */
function DetailedNetwork({ nodes, edges, unit }: { nodes: PtNode[]; edges: PtEdge[]; unit: string }) {
  const BW = 210, BH = 100, COLGAP = 74, ROWGAP = 30, PAD = 22;
  const cols = new Map<number, PtNode[]>();
  for (const n of nodes) cols.set(n.rank, [...(cols.get(n.rank) ?? []), n]);
  const ranks = [...cols.keys()].sort((a, b) => a - b);
  const pos = new Map<string, Box>();
  let maxRows = 0;
  ranks.forEach((r, ci) => {
    const list = cols.get(r)!;
    maxRows = Math.max(maxRows, list.length);
    list.forEach((n, ri) => pos.set(n.id, { x: PAD + ci * (BW + COLGAP), y: PAD + ri * (BH + ROWGAP), w: BW, h: BH }));
  });
  const W = PAD * 2 + ranks.length * (BW + COLGAP);
  const H = PAD * 2 + maxRows * (BH + ROWGAP);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Réseau potentiel-tâches détaillé">
        <Defs prefix="pd" />
        {edges.map((e) => {
          const s = pos.get(e.from);
          const t = pos.get(e.to);
          if (!s || !t) return null;
          const crit = Boolean(byId.get(e.from)?.critical && byId.get(e.to)?.critical);
          const r = routeEdge(s, t, e.type, 16, t.y - ROWGAP / 2);
          return <path key={e.id} d={r.d} fill="none" stroke={crit ? CRIT : LINE} strokeWidth={crit ? 2 : 1.3} markerEnd={`url(#pd-${crit ? "c" : "a"})`} />;
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          const c = colorOf(n);
          const marge = (v: number | null) => (v == null ? "—" : `${fmtNum(v)} ${unit}`);
          return (
            <g key={n.id}>
              <rect x={p.x} y={p.y} width={BW} height={BH} rx={n.milestone ? 14 : 8} fill="#fff" stroke={c} strokeWidth={n.critical ? 2.4 : 1.4} />
              <rect x={p.x} y={p.y} width={5} height={BH} rx={2.5} fill={c} />
              <text x={p.x + 13} y={p.y + 17} fontSize="11.5" fontWeight="800" fill={c}>{n.code}</text>
              <text x={p.x + 50} y={p.y + 17} fontSize="10.5" fontWeight="600" fill="#0f172a">
                {n.name.length > 24 ? `${n.name.slice(0, 23)}…` : n.name}
              </text>
              <line x1={p.x + 10} x2={p.x + BW - 10} y1={p.y + 25} y2={p.y + 25} stroke="#e2e8f0" />
              <text x={p.x + 13} y={p.y + 40} fontSize="9.5" fill="#334155">
                <tspan fill="#94a3b8">Durée </tspan>
                <tspan fontWeight="700">{n.milestone ? "jalon" : `${fmtNum(n.duration)} ${unit}`}</tspan>
              </text>
              <text x={p.x + 13} y={p.y + 55} fontSize="9.5" fill="#334155">
                <tspan fill="#94a3b8">Au plus tôt </tspan>
                {fmtDate(n.es)} → {fmtDate(n.ef)}
              </text>
              <text x={p.x + 13} y={p.y + 70} fontSize="9.5" fill="#334155">
                <tspan fill="#94a3b8">Au plus tard </tspan>
                {fmtDate(n.ls)} → {fmtDate(n.lf)}
              </text>
              <text x={p.x + 13} y={p.y + 88} fontSize="9.5" fontWeight="700" fill="#1a4a20">
                ML {marge(n.ml)}
                <tspan fill={n.mt != null && n.mt <= 0 ? CRIT : "#475569"}>  ·  MT {marge(n.mt)}</tspan>
              </text>
            </g>
          );
        })}
        {edges.map((e) => {
          const s = pos.get(e.from);
          const t = pos.get(e.to);
          if (!s || !t) return null;
          const r = routeEdge(s, t, e.type, 16, t.y - ROWGAP / 2);
          return <EdgeLabel key={`l-${e.id}`} {...r.label} text={edgeLabel(e, unit)} />;
        })}
      </svg>
    </div>
  );
}

function Legend({ unit }: { unit: string }) {
  const item = (color: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-3 w-5 rounded border-2 bg-white" style={{ borderColor: color }} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px] text-slate-600">
      {item(CRIT, "Chemin critique")}
      {item(PSEUDO, "Pseudo-critique")}
      {item(NORMAL, "Non critique")}
      <span>
        Liens : <strong>FD</strong> fin → début (non noté) · <strong>DD</strong> début → début · <strong>FF</strong> fin → fin ·{" "}
        <strong>DF</strong> début → fin · décalages en {unit}
      </span>
    </div>
  );
}

export default async function ProjectNetworkPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => notFound());
  const project = view.aggregate.project;
  const timeUnit: TimeUnit = project.timeUnit ?? "jours";
  const unit = timeUnitShortLabel(timeUnit);
  const hpd = view.aggregate.calendar.hoursPerDay;
  const inUnit = (days: number | null | undefined, units?: number | null) =>
    units != null ? units : days == null ? null : fromWorkingDays(days, timeUnit, hpd);

  const tasks = view.tasks.filter((t) => !t.isSummary);
  const taskIds = new Set(tasks.map((t) => t.id));
  const edges: PtEdge[] = view.dependencyNetwork
    .filter(
      (entry) =>
        entry.dependency.kind !== "RESOURCE" &&
        taskIds.has(entry.predecessor.taskId) &&
        taskIds.has(entry.successor.taskId),
    )
    .map((entry) => ({
      id: entry.dependency.id,
      from: entry.predecessor.taskId,
      to: entry.successor.taskId,
      type: entry.dependency.type,
      lag: inUnit(entry.dependency.lagDays, entry.dependency.lagUnits) ?? 0,
    }));
  const ranks = computeRanks(tasks.map((t) => t.id), edges);
  const nodes: PtNode[] = tasks.map((t) => ({
    id: t.id,
    code: t.code || t.wbsCode,
    name: t.name,
    milestone: t.type === "MILESTONE",
    critical: t.isCritical,
    pseudo: Boolean(t.isPseudoCritical),
    rank: ranks.get(t.id) ?? 0,
    duration: t.type === "MILESTONE" ? 0 : (inUnit(t.durationDays, t.durationUnits) ?? 0),
    es: t.earliestStartDate ?? null,
    ef: t.earliestFinishDate ?? null,
    ls: t.latestStartDate ?? null,
    lf: t.latestFinishDate ?? null,
    ml: inUnit(t.freeSlackDays, t.freeSlackUnits),
    mt: inUnit(t.totalSlackDays, t.totalSlackUnits),
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const tooBig = nodes.length > MAX_TASKS;
  const criticalCount = nodes.filter((n) => n.critical).length;
  const resourceLinks = view.dependencyNetwork.filter((e) => e.dependency.kind === "RESOURCE").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Représentation potentiel-tâches"
        title="Logique de précédence"
        description={
          <>
            {nodes.length} tâche{nodes.length > 1 ? "s" : ""} · {edges.length} lien{edges.length > 1 ? "s" : ""} ·{" "}
            {criticalCount} tâche{criticalCount > 1 ? "s" : ""} critique{criticalCount > 1 ? "s" : ""}. Unité : {timeUnit}.
            {resourceLinks > 0
              ? ` Les ${resourceLinks} liens ressources ajoutés par le nivellement ne sont pas tracés : ils ne font pas partie de la logique saisie.`
              : ""}
          </>
        }
      />

      <section className="ct-card p-5">
        <h2 className="text-[14px] font-bold text-slate-900">Représentation potentiel-tâches — une tâche par ligne</h2>
        <p className="mb-3 mt-1 text-[12px] text-slate-500">
          Chaque tâche occupe sa ligne ; son rectangle est placé selon son rang dans l&apos;enchaînement. Les flèches partent de la
          fin ou du début de la tâche et arrivent au début ou à la fin du successeur, selon le type de lien.
        </p>
        <Legend unit={unit} />
        <div className="mt-3">
          {tooBig ? (
            <p className="rounded-lg bg-slate-50 p-4 text-[12.5px] text-slate-500">
              Le projet compte {nodes.length} tâches : la représentation graphique est limitée à {MAX_TASKS} tâches pour rester
              lisible. Le tableau des marges et des liens ci-dessous reste complet.
            </p>
          ) : nodes.length ? (
            <LineGrid nodes={nodes} edges={edges} unit={unit} />
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">Aucune tâche.</p>
          )}
        </div>
      </section>

      {!tooBig && nodes.length ? (
        <section className="ct-card p-5">
          <h2 className="text-[14px] font-bold text-slate-900">Réseau détaillé — dates et marges</h2>
          <p className="mb-3 mt-1 text-[12px] text-slate-500">
            Une colonne par niveau d&apos;enchaînement. Chaque boîte donne la durée, les dates au plus tôt et au plus tard, la marge
            libre (ML) et la marge totale (MT) en {unit}.
          </p>
          <DetailedNetwork nodes={nodes} edges={edges} unit={unit} />
        </section>
      ) : null}

      <section className="ct-card overflow-hidden p-0">
        <h2 className="px-5 pt-5 text-[14px] font-bold text-slate-900">Tableau des marges</h2>
        <div className="overflow-x-auto p-5 pt-3">
          <table className="w-full min-w-[820px] text-left text-[12.5px]">
            <thead className="border-b text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Tâche</th>
                <th className="px-3 py-2 text-right">Durée ({unit})</th>
                <th className="px-3 py-2">Au plus tôt</th>
                <th className="px-3 py-2">Au plus tard</th>
                <th className="px-3 py-2 text-right">ML ({unit})</th>
                <th className="px-3 py-2 text-right">MT ({unit})</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <tr key={n.id} className="border-b border-slate-100">
                  <td className="ct-num px-3 py-1.5 font-bold" style={{ color: colorOf(n) }}>{n.code}</td>
                  <td className="px-3 py-1.5 text-slate-800">{n.name}</td>
                  <td className="ct-num px-3 py-1.5 text-right">{n.milestone ? "jalon" : fmtNum(n.duration)}</td>
                  <td className="ct-num px-3 py-1.5 text-slate-600">{fmtDate(n.es)} → {fmtDate(n.ef)}</td>
                  <td className="ct-num px-3 py-1.5 text-slate-600">{fmtDate(n.ls)} → {fmtDate(n.lf)}</td>
                  <td className="ct-num px-3 py-1.5 text-right">{n.ml == null ? "—" : fmtNum(n.ml)}</td>
                  <td className="ct-num px-3 py-1.5 text-right font-bold" style={{ color: n.mt != null && n.mt <= 0 ? CRIT : undefined }}>
                    {n.mt == null ? "—" : fmtNum(n.mt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ct-card overflow-hidden p-0">
        <h2 className="px-5 pt-5 text-[14px] font-bold text-slate-900">Liens de précédence</h2>
        <div className="overflow-x-auto p-5 pt-3">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead className="border-b text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-3 py-2">Prédécesseur</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Successeur</th>
                <th className="px-3 py-2">Décalage</th>
                <th className="px-3 py-2">Critique</th>
              </tr>
            </thead>
            <tbody>
              {edges.map((e) => {
                const s = byId.get(e.from)!;
                const t = byId.get(e.to)!;
                const crit = s.critical && t.critical;
                return (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="px-3 py-1.5"><strong>{s.code}</strong> {s.name}</td>
                    <td className="px-3 py-1.5"><span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px]">{LINK_FR[e.type]}</span></td>
                    <td className="px-3 py-1.5"><strong>{t.code}</strong> {t.name}</td>
                    <td className="ct-num px-3 py-1.5 text-slate-600">{e.lag ? fmtLag(e.lag, unit) : "—"}</td>
                    <td className="px-3 py-1.5">
                      {crit ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">Oui</span> : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                );
              })}
              {!edges.length ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Aucun lien de précédence.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
