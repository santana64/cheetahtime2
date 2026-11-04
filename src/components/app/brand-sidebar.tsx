"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FolderOpen, Gauge, Home, List, Plus, Search } from "lucide-react";

/**
 * Barre latérale unique de Cheetah Time — reprise À L'IDENTIQUE de l'écran
 * d'accueil (dégradé vert profond, lignes de vitesse, marque Cheetah·Time).
 * Utilisée par l'accueil ET par toutes les pages de l'application.
 * Menu conforme au CdC (p. 1) : Accueil, Projets en cours, Nouveau projet,
 * Tous les projets, Tableau de bord PMO.
 */

export const BRAND_MENU = [
  { label: "Accueil", href: "/", icon: Home },
  { label: "Projets en cours", href: "/projects", icon: FolderOpen },
  { label: "Nouveau projet", href: "/projects/new", icon: Plus },
  { label: "Tous les projets", href: "/projects?vue=tous", icon: List },
  { label: "Tableau de bord PMO", href: "/portfolio", icon: Gauge },
] as const;

function isActive(pathname: string, href: string, search: string) {
  const [path, query] = href.split("?");
  if (path === "/") return pathname === "/";
  if (path === "/projects") {
    if (pathname === "/projects/new") return false;
    const inProjects = pathname === "/projects" || pathname.startsWith("/projects/");
    if (!inProjects) return false;
    const wantsAll = Boolean(query);
    const showsAll = search.includes("vue=tous");
    return pathname === "/projects" ? wantsAll === showsAll : !wantsAll;
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function BrandSidebar({
  footer,
  search = "",
  showSearch = false,
}: {
  footer?: ReactNode;
  search?: string;
  showSearch?: boolean;
}) {
  const pathname = usePathname() ?? "/";

  return (
    <aside
      className="relative hidden h-full w-[244px] flex-shrink-0 flex-col justify-between overflow-hidden px-4 py-5 md:flex"
      style={{
        background: "linear-gradient(160deg, #1a4a20 0%, #0e2714 55%, #0d1f10 100%)",
        borderRight: "1px solid rgba(86,164,91,0.18)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-62deg, transparent, transparent 40px, rgba(255,255,255,0.018) 40px, rgba(255,255,255,0.018) 41px)",
        }}
      />
      <div className="relative min-h-0">
        <Link href="/" className="flex items-center gap-2.5 px-1.5" aria-label="Cheetah Time — accueil">
          <Image src="/cheetahsoft-logo.jpg" alt="" width={34} height={34} style={{ borderRadius: "50%" }} priority />
          <div className="leading-tight">
            <div className="text-[15px] font-black text-white">
              Cheetah<span style={{ color: "#f4a321" }}>Time</span>
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">Planification</div>
          </div>
        </Link>

        <div className="mt-6 px-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">Espace de travail</div>

        <nav className="mt-2 space-y-1" aria-label="Navigation principale">
          {BRAND_MENU.map(({ label, href, icon: Icon }) => {
            const active = isActive(pathname, href, search);
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors hover:bg-white/[0.06] hover:text-white/85"
                style={
                  active
                    ? {
                        background: "linear-gradient(135deg, rgba(86,164,91,0.28), rgba(86,164,91,0.12))",
                        color: "white",
                        border: "1px solid rgba(86,164,91,0.32)",
                      }
                    : { color: "rgba(255,255,255,0.62)", border: "1px solid transparent" }
                }
              >
                <Icon className="size-4" style={{ color: active ? "#8fce95" : "rgba(255,255,255,0.5)" }} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        {showSearch ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("cheetah:command-open"))}
            className="mt-3 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/85"
            style={{ border: "1px solid rgba(255,255,255,0.10)" }}
            title="Recherche et commandes rapides"
          >
            <Search className="size-4 text-white/50" aria-hidden="true" />
            <span className="flex-1 text-left">Rechercher</span>
            <kbd className="rounded px-1 py-0.5 font-mono text-[9px] text-white/40" style={{ background: "rgba(255,255,255,0.06)" }}>
              Ctrl K
            </kbd>
          </button>
        ) : null}
      </div>

      <div className="relative space-y-3">
        {footer}
        <Link
          href="/backup"
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[11px] text-white/55 transition-colors hover:text-white/80"
          title="Enregistrement automatique sur ce poste. Cliquez pour gérer les sauvegardes."
        >
          <span className="inline-block size-2 rounded-full" style={{ background: "#56a45b", boxShadow: "0 0 6px rgba(86,164,91,0.6)" }} />
          Sauvegarde automatique sur ce poste
        </Link>
        <div className="flex items-center gap-2 px-1.5 opacity-40">
          <Image src="/cheetahsoft-logo.jpg" alt="" width={20} height={20} style={{ borderRadius: "50%" }} />
          <span className="leading-tight">
            <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-white/70">CheetahSoft</span>
            <span className="block text-[9px] text-white/60">Maîtrise des délais FGF v1</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
