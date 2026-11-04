import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildPertNetwork } from "@/services/advanced-planning";
import { getProjectView } from "@/services/projects";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/ui-kit";

/** Notation FGF (française) des liens : FD / DD / FF / DF (cf. CdC François). */
const LINK_FR: Record<string, string> = { FS: "FD", SS: "DD", FF: "FF", SF: "DF" };
const linkFr = (t: string) => LINK_FR[t] ?? t;

const NODE_W = 200;
const NODE_H = 54;
const COL_GAP = 80;
const ROW_GAP = 18;

function layoutNodes(nodes: ReturnType<typeof buildPertNetwork>["nodes"]) {
  const byDepth = new Map<number, typeof nodes>();
  for (const node of nodes) {
    const bucket = byDepth.get(node.depth) ?? [];
    bucket.push(node);
    byDepth.set(node.depth, bucket);
  }

  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const positions = new Map<string, { x: number; y: number }>();

  for (const depth of depths) {
    const col = depths.indexOf(depth);
    const colNodes = byDepth.get(depth) ?? [];
    const totalH = colNodes.length * NODE_H + (colNodes.length - 1) * ROW_GAP;
    let y = -totalH / 2;
    for (const node of colNodes) {
      positions.set(node.id, { x: col * (NODE_W + COL_GAP), y });
      y += NODE_H + ROW_GAP;
    }
  }

  return { positions, colCount: depths.length };
}

function PertDiagram({ nodes, edges }: ReturnType<typeof buildPertNetwork>) {
  const { positions, colCount } = layoutNodes(nodes);

  if (!nodes.length) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">
        Aucune tâche dans ce projet.
      </div>
    );
  }

  const allY = [...positions.values()].map((p) => p.y);
  const minY = Math.min(...allY) - 20;
  const maxY = Math.max(...allY) + NODE_H + 20;
  const totalW = colCount * (NODE_W + COL_GAP) + 40;
  const totalH = maxY - minY;
  const offsetY = -minY;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        style={{ minWidth: totalW, height: Math.max(totalH, 200) }}
        className="w-full"
      >
        {/* Arrow marker */}
        <defs>
          <marker id="arrow-pert" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
          </marker>
          <marker id="arrow-pert-critical" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#f87171" />
          </marker>
        </defs>

        {/* Edges first (behind nodes) */}
        {edges.map((edge) => {
          const src = positions.get(edge.source);
          const tgt = positions.get(edge.target);
          if (!src || !tgt) return null;

          const srcNode = nodes.find((n) => n.id === edge.source);
          const tgtNode = nodes.find((n) => n.id === edge.target);
          const isCritical = srcNode?.critical && tgtNode?.critical;

          const x1 = src.x + NODE_W;
          const y1 = src.y + offsetY + NODE_H / 2;
          const x2 = tgt.x - 4;
          const y2 = tgt.y + offsetY + NODE_H / 2;
          const mx = (x1 + x2) / 2;

          return (
            <g key={edge.id}>
              <path
                d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
                fill="none"
                stroke={isCritical ? "#f87171" : "#cbd5e1"}
                strokeWidth={isCritical ? 2.5 : 1.5}
                markerEnd={isCritical ? "url(#arrow-pert-critical)" : "url(#arrow-pert)"}
              />
              {edge.lagDays !== 0 && (
                <text
                  x={mx}
                  y={(y1 + y2) / 2 - 4}
                  fontSize="10"
                  fill="#94a3b8"
                  textAnchor="middle"
                >
                  {linkFr(edge.type)}{edge.lagDays > 0 ? `+${edge.lagDays}j` : `${edge.lagDays}j`}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const x = pos.x;
          const y = pos.y + offsetY;
          const isMilestone = node.type === "MILESTONE";
          const isSummary = node.type === "SUMMARY";

          return (
            <g key={node.id}>
              <rect
                x={x}
                y={y}
                width={NODE_W}
                height={NODE_H}
                rx={isMilestone ? 27 : 8}
                fill={node.critical ? "#fff1f2" : isSummary ? "#f8fafc" : "white"}
                stroke={node.critical ? "#fca5a5" : isSummary ? "#94a3b8" : "#e2e8f0"}
                strokeWidth={node.critical ? 2 : 1}
              />
              {/* WBS chip */}
              <rect
                x={x + 6}
                y={y + 6}
                width={34}
                height={16}
                rx={4}
                fill={node.critical ? "#fecdd3" : "#f1f5f9"}
              />
              <text
                x={x + 23}
                y={y + 18}
                fontSize="9"
                fontWeight="bold"
                fill={node.critical ? "#be123c" : "#64748b"}
                textAnchor="middle"
              >
                {node.label.split(" ")[0]}
              </text>
              {/* Name */}
              <text
                x={x + 46}
                y={y + 22}
                fontSize="11"
                fontWeight={node.critical ? "700" : "500"}
                fill={node.critical ? "#9f1239" : "#0f172a"}
              >
                {node.label.slice(node.label.indexOf(" ") + 1).slice(0, 22)}
                {node.label.slice(node.label.indexOf(" ") + 1).length > 22 ? "…" : ""}
              </text>
              {/* Type badge */}
              <text
                x={x + 46}
                y={y + 36}
                fontSize="9"
                fill={node.critical ? "#e11d48" : "#94a3b8"}
                fontWeight="600"
              >
                {isMilestone ? "◆ JALON" : isSummary ? "▶ LOT" : "▪ TÂCHE"}
                {node.critical ? " — CRITIQUE" : ""}
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

/**
 * Représentation « potentiel-tâches » (méthode MPM/FGF) — refonte spec François 29/08 :
 * chaque tâche est une BOÎTE (durée, dates au plus tôt / au plus tard, marge) et les liens
 * de précédence sont de vraies FLÈCHES. Colonnes = niveaux de précédence.
 */
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

  // Chemin pseudo-critique : marge totale faible (< 1,3 × la plus petite marge positive).
  const positiveSlacks = view.tasks
    .filter((t) => !t.isSummary && (t.totalSlackDays ?? 0) > 0)
    .map((t) => t.totalSlackDays as number);
  const minPositive = positiveSlacks.length ? Math.min(...positiveSlacks) : 0;
  const pseudoThreshold = minPositive > 0 ? 1.3 * minPositive : 0;
  const pseudo = new Set(
    view.tasks
      .filter(
        (t) =>
          !t.isCritical &&
          (t.totalSlackDays ?? 0) > 0 &&
          (t.totalSlackDays as number) <= pseudoThreshold,
      )
      .map((t) => t.id),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Diagramme réseau PERT"
        title="Logique de dépendances"
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
          <CardTitle className="text-base">Potentiel-tâches (méthode MPM)</CardTitle>
          <p className="text-xs text-slate-500">
            Chaque tâche est une boîte (durée, dates au plus tôt / au plus tard, marge) ; les liens de
            précédence sont des <span className="font-semibold">flèches</span>. Colonnes = niveaux de précédence.
            Critique en <span className="font-semibold" style={{ color: "#e2424a" }}>rouge</span>,
            pseudo-critique en <span className="font-semibold" style={{ color: "#f4a321" }}>orange</span>{" "}
            (marge &lt; 1,3× la plus faible), hors-critique en{" "}
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
