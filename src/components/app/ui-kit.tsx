import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Design system partagé de Cheetah Time — aligné « 100 % CheetahCost ».
 *
 * S'appuie sur la couche visuelle CheetahCost portée dans globals.css :
 * `.panel` (carte verre blanc), `.section-label` (intitulé), barres d'accent KPI.
 *
 * - `AccentRule` : signature CheetahSoft (filet vert + orange).
 * - `PageHeader` : en-tête de page unifié.
 * - `Panel`      : carte de section standard (filet d'accent optionnel).
 * - `StatTile` / `StatGrid` : tuiles KPI (barre d'accent gauche façon CheetahCost).
 */

/** Signature CheetahSoft : filet vert + orange. */
export function AccentRule({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)} aria-hidden="true">
      <span className="h-[3px] w-9 rounded-full" style={{ background: "#56a45b" }} />
      <span className="h-[3px] w-4 rounded-full" style={{ background: "#f4a321" }} />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="panel rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="section-label">{eyebrow}</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[#1a4a20]">{title}</h1>
          <AccentRule className="mt-2.5" />
          {description ? (
            <p className="mt-2.5 max-w-3xl text-sm leading-6" style={{ color: "var(--muted, rgba(15,23,42,0.60))" }}>
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  accent,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Couleur du filet supérieur (identité de la section). */
  accent?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("panel overflow-hidden rounded-2xl", className)}>
      {accent ? <div className="h-[2px] w-full" style={{ background: accent }} /> : null}
      {title || actions ? (
        <header
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
          style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}
        >
          <div className="min-w-0">
            {title ? <div className="text-[13px] font-bold text-slate-800">{title}</div> : null}
            {subtitle ? (
              <div className="mt-0.5 text-[11.5px] leading-4" style={{ color: "rgba(15,23,42,0.62)" }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "#56a45b",
  progress,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
  /** Barre de progression 0..1 (optionnelle). */
  progress?: number;
}) {
  return (
    <div className="panel rounded-xl p-4" style={{ borderLeft: `3px solid ${tone}` }}>
      <div className="section-label">{label}</div>
      <div className="mt-2 text-xl font-black leading-none" style={{ color: "#0d1f10" }}>
        {value}
      </div>
      {sub ? (
        <div className="mt-1.5 text-[11px] leading-4" style={{ color: "rgba(15,23,42,0.62)" }}>
          {sub}
        </div>
      ) : null}
      {progress != null ? (
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(15,23,42,0.10)" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, background: tone }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function StatGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>
  );
}
