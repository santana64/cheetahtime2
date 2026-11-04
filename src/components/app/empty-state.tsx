import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaAction?: ReactNode;
}) {
  return (
    <div
      className="relative flex flex-col items-start gap-5 overflow-hidden rounded-2xl p-8"
      style={{
        border: "1px dashed oklch(0.555 0.155 145 / 0.28)",
        background: "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, oklch(0.955 0.018 145 / 0.45) 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.90), 0 4px 24px -8px rgba(22,101,52,0.08)",
      }}
    >
      {/* ── Large ambient glow orbs (floating) ── */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full blur-3xl animate-float opacity-[0.12]"
        style={{ background: "oklch(0.555 0.155 145)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-8 right-16 size-28 rounded-full blur-3xl animate-float-x opacity-[0.09]"
        style={{ background: "oklch(0.670 0.172 52)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-0 bottom-0 size-24 rounded-full blur-2xl animate-float opacity-[0.06]"
        style={{ background: "oklch(0.555 0.155 145)", animationDelay: "1.5s" }}
        aria-hidden="true"
      />

      {/* ── Cheetah spot micro-constellation ── */}
      <div aria-hidden="true">
        <span
          className="pointer-events-none absolute right-6 top-7 block size-[7px] rounded-full animate-spot-1 opacity-25"
          style={{ background: "oklch(0.555 0.155 145)" }}
        />
        <span
          className="pointer-events-none absolute right-16 top-5 block size-[4.5px] rounded-full animate-spot-2 opacity-18"
          style={{ background: "oklch(0.670 0.172 52)" }}
        />
        <span
          className="pointer-events-none absolute right-11 top-11 block size-[3.5px] rounded-full animate-spot-3 opacity-15"
          style={{ background: "oklch(0.555 0.155 145)" }}
        />
        <span
          className="pointer-events-none absolute right-22 top-8 block size-[3px] rounded-full animate-spot-4 opacity-12"
          style={{ background: "oklch(0.670 0.172 52)" }}
        />
        <span
          className="pointer-events-none absolute right-7 top-16 block size-[2.5px] rounded-full animate-spot-2 opacity-10"
          style={{ background: "oklch(0.555 0.155 145)" }}
        />
      </div>

      {/* ── Shimmer animated eyebrow ── */}
      <div className="shimmer-text text-[10px] font-bold uppercase tracking-[0.28em]">
        {eyebrow}
      </div>

      <div className="relative z-10">
        <h3 className="text-[18px] font-bold tracking-tight text-slate-900">
          {title}
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>

      {ctaAction ?? (ctaLabel ? <Button>{ctaLabel}</Button> : null)}
    </div>
  );
}
