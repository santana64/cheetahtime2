"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

/* ─────────────────────────────────────────────────────────────
   Logo officiel CheetahSoft (JPG → /public/cheetahsoft-logo.jpg)
───────────────────────────────────────────────────────────── */
export function CheetahSoftOfficialLogo({ size = 120 }: { size?: number }) {
  return (
    <Image
      src="/cheetahsoft-logo.jpg"
      alt="CheetahSoft — Project Management Software"
      width={size}
      height={size}
      style={{ borderRadius: "50%", display: "block" }}
      priority
    />
  );
}

/* ─────────────────────────────────────────────────────────────
   BRAND MARK — composant public
   variant="nav"  → logo rond + texte produit sur fond sombre
   variant="hero" → logo grand format
───────────────────────────────────────────────────────────── */
export function BrandMark({
  href = "/",
  compact = false,
  variant = "nav",
}: {
  href?: string;
  compact?: boolean;
  variant?: "nav" | "hero";
}) {
  const [isLunging, setIsLunging] = useState(false);

  function handleMouseEnter() {
    setIsLunging(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setIsLunging(true)));
  }

  if (variant === "hero") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div
          className="logo-breathe"
          style={{ filter: "drop-shadow(0 4px 24px rgba(30,140,30,0.40))" }}
        >
          <CheetahSoftOfficialLogo size={120} />
        </div>
        {!compact && (
          <div className="text-center">
            <div
              className="text-[10px] font-black uppercase tracking-[0.28em]"
              style={{ color: "rgba(86,164,91,0.85)" }}
            >
              CheetahSoft
            </div>
            <div
              className="mt-0.5 text-[18px] font-black tracking-tight text-white"
              style={{ letterSpacing: "-0.02em" }}
            >
              Cheetah Time
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-3 rounded-xl px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#56a45b]/60"
      onMouseEnter={handleMouseEnter}
    >
      <span
        className={[
          "relative flex shrink-0 items-center justify-center transition-[filter,transform] duration-300",
          "group-hover:[filter:drop-shadow(0_0_14px_rgba(30,140,30,0.70))]",
          isLunging ? "animate-cheetah-lunge" : "logo-breathe",
        ].join(" ")}
        onAnimationEnd={(e) => {
          if (e.animationName === "cheetah-lunge") setIsLunging(false);
        }}
      >
        <CheetahSoftOfficialLogo size={46} />
      </span>

      {!compact && (
        <span className="flex flex-col leading-none select-none">
          <span
            className="text-[9px] font-black uppercase tracking-[0.28em]"
            style={{ color: "rgba(86,164,91,0.85)" }}
          >
            CheetahSoft
          </span>
          <span
            className="mt-0.5 text-[13.5px] font-black tracking-tight text-white transition-colors duration-200 group-hover:text-[#7ddf83]"
            style={{ letterSpacing: "-0.02em" }}
          >
            Cheetah Time
          </span>
        </span>
      )}
    </Link>
  );
}
