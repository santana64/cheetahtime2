import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listWorkspaceSmartAlerts } from "@/services/smart-alerts";
import { cn } from "@/lib/utils";
import { requireCurrentSession } from "@/services/auth";

export default async function AlertsPage() {
  
  const alerts = await listWorkspaceSmartAlerts((await requireCurrentSession()).workspaceId);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/70 bg-white/85 p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
          Alertes intelligentes
        </div>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-[#1a4a20]">
          Early Warning System
        </h1>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {(["critical", "warning", "info"] as const).map((severity) => (
          <div key={severity} className="rounded-xl border border-white/70 bg-white/90 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{severity}</div>
            <div className="mt-2 text-3xl font-black text-[#1a4a20]">
              {alerts.filter((alert) => alert.severity === severity).length}
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertes actives</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.map((alert) => (
            <Link
              key={alert.id}
              href={`/projects/${alert.projectId}/planning`}
              className="block rounded-lg border bg-white p-4 transition hover:bg-slate-50"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
                    alert.severity === "critical"
                      ? "bg-rose-100 text-rose-700"
                      : alert.severity === "warning"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600",
                  )}
                >
                  {alert.severity}
                </span>
                <span className="font-mono text-[11px] text-slate-400">{alert.type}</span>
              </div>
              <div className="mt-2 text-sm font-medium text-slate-900">{alert.message}</div>
            </Link>
          ))}
          {!alerts.length ? (
            <div className="rounded-lg bg-emerald-50 p-5 text-sm font-medium text-emerald-700">
              Aucun signal actif sur le portefeuille.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

