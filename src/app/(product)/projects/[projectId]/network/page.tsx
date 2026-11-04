import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildPertNetwork } from "@/services/advanced-planning";
import { getProjectView } from "@/services/projects";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/ui-kit";

/** Notation FGF (française) des liens : FD / DD / FF / DF (cf. CdC François). */
const LINK_FR: Record<string, string> = { FS: "FD", SS: "DD", FF: "FF", SF: "DF" };
const linkFr = (t: string) => LINK_FR[t] ?? t;

/**
 * Représentation potentiel-tâches « une tâche par ligne » (CdC p. 15) :
 * chaque LT occupe sa ligne ; son petit rectangle est placé horizontalement
 * selon son rang dans l'enchaînement ; les flèches relient prédécesseurs et
 * successeurs (type de lien FD/DD/FF/DF et délai).
 */
function PotentielLineGrid({
  nodes,
  edges,
  pseudo,
}: ReturnType<typeof buildPertNetwork> & { pseudo: Set<string> }) {
  if (!nodes.length) {
    return <div className="py-10 text-center text-sm text-slate-400">Aucune tâche.</div>;
  }
  const LABEL_W = 250, COL_W = 92, BOX_W = 64, ROW_H = 30, BOX_H = 18, PAD = 12;
  // Rang dans l'enchaînement (plus long chemin depuis un LT sans prédécesseur),
  // et non la profondeur WBS : c'est ce qui place chaque LT horizontalement.
  const isSummaryNode = (n: (typeof nodes)[number]) => n.type === "SUMMARY";
  const preds = new Map<string, string[]>();
  for (const e of edges) preds.set(e.target, [...(preds.get(e.target) ?? []), e.source]);
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const rankOf = (id: string): number => {
    if (rank.has(id)) return rank.get(id)!;
    if (visiting.has(id)) return 0; // cycle : on coupe
    visiting.add(id);
    const r = Math.max(-1, ...(preds.get(id) ?? []).map(rankOf)) + 1;
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };
  nodes.forEach((n) => rankOf(n.id));
  const maxRank = Math.max(0, ...nodes.filter((n) => !isSummaryNode(n)).map((n) => rank.get(n.id) ?? 0));
  const depths = Array.from({ length: maxRank + 1 }, (_, i) => i);
  const row = new Map(nodes.map((n, i) => [n.id, i]));
  const xOf = (id: string) => LABEL_W + (rank.get(id) ?? 0) * COL_W + PAD;
  const yOf = (id: string) => PAD + (row.get(id) ?? 0) * ROW_H;
  const W = LABEL_W + depths.length * COL_W + PAD * 2;
  const H = PAD * 2 + nodes.length * ROW_H;
  const colorOf = (n: (typeof nodes)[number]) => (n.critical ? "#e2424a" : pseudo.has(n.id) ? "#f4a321" : "#56a45b");

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grille potentiel-tâches : une tâche par ligne, flèches de précédence">
        <defs>
          <marker id="pl-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#475569" />
          </marker>
          <marker id="pl-arrow-crit" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#e2424a" />
          </marker>
        </defs>
        {nodes.map((n, i) => (
          <g key={`row-${n.id}`}>
            {i % 2 === 0 ? <rect x={0} y={yOf(n.id) - 6} width={W} height={ROW_H} fill="#faf9f5" /> : null}
            <text x={PAD + (isSummaryNode(n) ? 0 : 10)} y={yOf(n.id) + BOX_H / 2 + 4} fontSize="11" fill={isSummaryNode(n) ? "#1a4a20" : "#0f172a"} fontWeight={isSummaryNode(n) ? 800 : n.critical ? 700 : 500}>
              {n.label.length > 36 ? `${n.label.slice(0, 35)}…` : n.label}
            </text>
          </g>
        ))}
        {depths.map((d, i) => (
          <line key={`col-${d}`} x1={LABEL_W + i * COL_W + PAD / 2} x2={LABEL_W + i * COL_W + PAD / 2} y1={0} y2={H} stroke="#ece9e1" />
        ))}
        {edges.map((e) => {
          if (!row.has(e.source) || !row.has(e.target)) return null;
          const src = nodes[row.get(e.source)!];
          const tgt = nodes[row.get(e.target)!];
          const crit = src.critical && tgt.critical;
          const x1 = xOf(e.source) + BOX_W;
          const y1 = yOf(e.source) + BOX_H / 2;
          const x2 = xOf(e.target) - 2;
          const y2 = yOf(e.target) + BOX_H / 2;
          const mx = Math.max(x1 + 8, x2 - 14);
          return (
            <g key={e.id}>
              <path d={`M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`} fill="none" stroke={crit ? "#e2424a" : "#64748b"} strokeWidth={crit ? 1.8 : 1.1} markerEnd={crit ? "url(#pl-arrow-crit)" : "url(#pl-arrow)"} />
              {e.type !== "FS" || e.lagDays ? (
                <text x={mx + 2} y={y2 - 3} fontSize="8" fill="#64748b" fontWeight="700">
                  {linkFr(e.type)}
                  {e.lagDays ? (e.lagDays > 0 ? `+${e.lagDays}j` : `${e.lagDays}j`) : ""}
                </text>
              ) : null}
            </g>
          );
        })}
        {nodes.map((n) => {
          if (isSummaryNode(n)) return null;
          const c = colorOf(n);
          const code = n.label.split(" ")[0];
          return (
            <g key={`box-${n.id}`}>
              <rect x={xOf(n.id)} y={yOf(n.id)} width={BOX_W} height={BOX_H} rx="4" fill="#fff" stroke={c} strokeWidth={n.critical ? 2.2 : 1.4} strokeDasharray={pseudo.has(n.id) ? "3 2" : undefined} />
              <text x={xOf(n.id) + BOX_W / 2} y={yOf(n.id) + BOX_H / 2 + 4} fontSize="10" textAnchor="middle" fill="#0f172a" fontWeight="700">
                {code}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type PtTask = {
  durationDays: number;
  earliestStartDate?: string | null;
  earliestFinishDate?: string | null;
  latestStartDate?: string | null;
  latestFinishDate?: string | null;
  totalSlackDays?: number | null;
};

function PotentielGrid({
  nodes,
  edges,
  pseudo,
  taskById,
}: ReturnType<typeof buildPertNetwork> & {
  pseudo: Set<string>;
  taskById: Map<string, PtTask>;
}) {
  if (!nodes.length) {
    return <div className="py-10 text-center text-sm text-slate-400">Aucune tâche.</div>;
  }
  const BW = 186, BH = 78, COLGAP = 66, ROWGAP = 20, PAD = 20;
  const byDepth = new Map<number, typeof nodes>();
  for (const n of nodes) {
    const bucket = byDepth.get(n.depth) ?? [];
    bucket.push(n);
    byDepth.set(n.depth, bucket);
  }
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const pos = new Map<string, { x: number; y: number }>();
  let maxRows = 0;
  depths.forEach((d, col) => {
    const colNodes = byDepth.get(d) ?? [];
    maxRows = Math.max(maxRows, colNodes.length);
    colNodes.forEach((n, row) => {
      pos.set(n.id, { x: PAD + col * (BW + COLGAP), y: PAD + row * (BH + ROWGAP) });
    });
  });
  const W = PAD * 2 + depths.length * (BW + COLGAP) - COLGAP;
  const H = PAD * 2 + maxRows * (BH + ROWGAP) - ROWGAP;
  const colorOf = (id: string, critical: boolean) =>
    critical ? "#e2424a" : pseudo.has(id) ? "#f4a321" : "#56a45b";
  const dm = (iso?: string | null) =>
    iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${Math.max(H, 140)}`} style={{ minWidth: W, height: Math.max(H, 140) }} className="w-full">
        <defs>
          <marker id="pt-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">
            <path d="M0,0 L0,7 L8,3.5 z" fill="#475569" />
          </marker>
          <marker id="pt-arrow-crit" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">
            <path d="M0,0 L0,7 L8,3.5 z" fill="#e2424a" />
          </marker>
        </defs>
        {edges.map((e) => {
          const s = pos.get(e.source);
          const t = pos.get(e.target);
          if (!s || !t) return null;
          const srcN = nodes.find((n) => n.id === e.source);
          const tgtN = nodes.find((n) => n.id === e.target);
          const crit = Boolean(srcN?.critical && tgtN?.critical);
          const x1 = s.x + BW, y1 = s.y + BH / 2, x2 = t.x - 2, y2 = t.y + BH / 2;
          const mx = x1 + Math.max(16, (x2 - x1) / 2);
          return (
            <g key={e.id}>
              <path
                d={`M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`}
                fill="none"
                stroke={crit ? "#e2424a" : "#475569"}
                strokeWidth={crit ? 2 : 1.5}
                markerEnd={crit ? "url(#pt-arrow-crit)" : "url(#pt-arrow)"}
              />
              <text x={mx + 3} y={(y1 + y2) / 2 - 3} fontSize="8.5" fill="#64748b" fontWeight="600">
                {linkFr(e.type)}
                {e.lagDays ? (e.lagDays > 0 ? `+${e.lagDays}j` : `${e.lagDays}j`) : ""}
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const c = colorOf(n.id, n.critical);
          const isMs = n.type === "MILESTONE";
          const task = taskById.get(n.id);
          const code = n.label.split(" ")[0];
          const name = n.label.slice(n.label.indexOf(" ") + 1);
          const marge = task?.totalSlackDays ?? 0;
          return (
            <g key={n.id}>
              <rect
                x={p.x}
                y={p.y}
                width={BW}
                height={BH}
                rx={isMs ? 12 : 7}
                fill="white"
                stroke={c}
                strokeWidth={n.critical ? 2.4 : 1.5}
                strokeDasharray={pseudo.has(n.id) && !n.critical ? "6 3" : undefined}
              />
              <rect x={p.x} y={p.y} width={5} height={BH} rx={2.5} fill={c} />
              <text x={p.x + 13} y={p.y + 16} fontSize="10.5" fontWeight="800" fill={c}>{code}</text>
              <text x={p.x + 44} y={p.y + 16} fontSize="10" fill="#0f172a" fontWeight="600">
                {name.slice(0, 20)}{name.length > 20 ? "…" : ""}
              </text>
              <line x1={p.x + 9} x2={p.x + BW - 9} y1={p.y + 23} y2={p.y + 23} stroke="#e2e8f0" strokeWidth="1" />
              <text x={p.x + 13} y={p.y + 38} fontSize="9" fill="#334155">
                <tspan fill="#94a3b8">au + tôt </tspan>
                {dm(task?.earliestStartDate)} → {dm(task?.earliestFinishDate)}
              </text>
              <text x={p.x + 13} y={p.y + 52} fontSize="9" fill="#334155">
                <tspan fill="#94a3b8">au + tard </tspan>
                {dm(task?.latestStartDate)} → {dm(task?.latestFinishDate)}
              </text>
              <text x={p.x + 13} y={p.y + 69} fontSize="9" fontWeight="700" fill="#1a4a20">
                durée {task?.durationDays ?? 0} j
                <tspan fill={marge <= 0 ? "#e2424a" : "#64748b"}> · marge {marge} j</tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default async function ProjectNetworkPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const view = await getProjectView(projectId).catch(() => notFound());
  const network = buildPertNetwork(view);
  const taskById = new Map(view.tasks.map((t) => [t.id, t]));

  const criticalEdges = network.edges.filter((edge) => {
    const src = network.nodes.find((n) => n.id === edge.source);
    const tgt = network.nodes.find((n) => n.id === edge.target);
    return src?.critical && tgt?.critical;
  });

  // Chemin pseudo-critique : calculé par le moteur (coefficient réglable dans Paramètres).
  const pseudo = new Set(view.tasks.filter((t) => t.isPseudoCritical).map((t) => t.id));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Représentation potentiel-tâches"
        title="Logique de précédence"
        description={
          <>
            Vue logique indépendante de l&apos;axe temps. Chemin critique en{" "}
            <span className="font-semibold text-rose-500">rouge</span>. Survol = type de lien et décalage.
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span><span className="mr-1 inline-block h-2 w-6 rounded-full bg-rose-300 align-middle" />Chemin critique</span>
            <span><span className="mr-1 inline-block h-2 w-6 rounded-full bg-slate-300 align-middle" />Hors critique</span>
            <span className="font-semibold">{network.nodes.length} tâches · {network.edges.length} liens · {criticalEdges.length} critiques</span>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grille potentiel-tâches — une tâche par ligne</CardTitle>
          <p className="text-xs text-slate-500">
            Représentation du CdC (p. 15) : chaque LT sur sa ligne, placé selon son rang dans l&apos;enchaînement,
            flèches de précédence (FD par défaut ; DD, FF, DF et délais indiqués). Critique en rouge épais,
            pseudo-critique en orange pointillé.
          </p>
        </CardHeader>
        <CardContent className="p-4">
          <PotentielLineGrid nodes={network.nodes} edges={network.edges} pseudo={pseudo} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Potentiel-tâches détaillé (dates et marges)</CardTitle>
          <p className="text-xs text-slate-500">
            Chaque tâche est une boîte (durée, dates au plus tôt / au plus tard, marge) ; les liens de
            précédence sont des <span className="font-semibold">flèches</span>. Colonnes = niveaux de précédence.
            Critique en <span className="font-semibold" style={{ color: "#e2424a" }}>rouge</span>,
            pseudo-critique en <span className="font-semibold" style={{ color: "#f4a321" }}>orange</span>{" "}
            (marge ≤ coefficient du projet × la plus faible marge positive), hors-critique en{" "}
            <span className="font-semibold" style={{ color: "#56a45b" }}>vert</span>.
          </p>
        </CardHeader>
        <CardContent className="p-4">
          <PotentielGrid nodes={network.nodes} edges={network.edges} pseudo={pseudo} taskById={taskById} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Table des liens de dépendance</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Prédécesseur</th>
                <th className="px-4 py-3">Successeur</th>
                <th className="px-4 py-3">Décalage</th>
                <th className="px-4 py-3">Critique</th>
              </tr>
            </thead>
            <tbody>
              {network.edges.map((edge) => {
                const src = network.nodes.find((n) => n.id === edge.source);
                const tgt = network.nodes.find((n) => n.id === edge.target);
                const isCritical = src?.critical && tgt?.critical;
                return (
                  <tr key={edge.id} className={cn("border-b border-slate-100", isCritical && "bg-rose-50/40")}>
                    <td className="px-4 py-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">{linkFr(edge.type)}</span>
                    </td>
                    <td className="px-4 py-2 font-medium text-slate-800">{src?.label ?? edge.source}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">{tgt?.label ?? edge.target}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {edge.lagDays === 0 ? "—" : edge.lagDays > 0 ? `+${edge.lagDays}j` : `${edge.lagDays}j`}
                    </td>
                    <td className="px-4 py-2">
                      {isCritical
                        ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">Oui</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                );
              })}
              {!network.edges.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Aucune dépendance définie.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
