"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { CommandPalette } from "@/components/app/command-palette";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/features/auth/actions";
import type { AuthSession } from "@/services/auth";

const DESKTOP_SESSION_ID = "desktop-session";

/* ── Icônes inline (feather) — pas de dépendance react-icons ── */
function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M9 22V12h6v10" />
      </>
    ),
    folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
    plus: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </>
    ),
    list: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 13h6M9 17h6" />
      </>
    ),
    code: <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
  };
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

type NavItem = { label: string; href: string; icon: string; shortcut?: string };

// Menu conforme à la maquette François (CdC) — pas d'entrées hors périmètre, pas de PMO.
const items: NavItem[] = [
  { label: "Accueil", href: "/", icon: "home" },
  { label: "Projets en cours", href: "/projects", icon: "folder" },
  { label: "Nouveau projet", href: "/projects/new", icon: "plus" },
  { label: "Tous les projets", href: "/projects", icon: "list" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/projects") {
    return pathname === "/projects" || (pathname.startsWith("/projects/") && pathname !== "/projects/new");
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({
  children,
  session,
  projects = [],
}: {
  children: ReactNode;
  session: AuthSession;
  projects?: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  const [meeting, setMeeting] = useState(false);

  useEffect(() => {
    function toggle() {
      setMeeting((v) => {
        const next = !v;
        if (next) document.documentElement.requestFullscreen?.().catch(() => {});
        else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        return next;
      });
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMeeting(false);
    }
    window.addEventListener("cheetah:meeting-toggle", toggle);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("cheetah:meeting-toggle", toggle);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className={cn("flex h-screen overflow-hidden app-shell", meeting && "meeting-mode")}>
      <CommandPalette projects={projects} />
      {meeting && (
        <button
          onClick={() => setMeeting(false)}
          className="fixed right-4 top-4 z-[10001] rounded-lg px-3 py-1.5 text-[12px] font-bold text-white shadow-lg"
          style={{ background: "linear-gradient(135deg, #56a45b, #3f8f48)" }}
        >
          Quitter le mode réunion (Échap)
        </button>
      )}

      {/* ══ SIDEBAR — identité CheetahSoft (jumeau de CheetahCost) ══ */}
      <aside
        className="flex h-full w-[220px] flex-shrink-0 flex-col overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #162c1e 0%, #1a3525 100%)",
          borderRight: "1px solid rgba(0,0,0,0.25)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
            <Image src="/cheetahsoft-logo.jpg" alt="CheetahSoft" width={40} height={40} className="h-10 w-10 rounded-full object-cover" priority />
          </div>
          <div className="leading-tight">
            <div className="text-[13.5px] font-bold tracking-tight text-white">Cheetah Time</div>
            <div className="text-[9.5px] font-medium" style={{ color: "rgba(255,255,255,0.34)" }}>
              Maîtrise des délais
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col px-3 pt-4 pb-3">
          <div className="mb-3 px-1.5 text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.18)" }}>
            Espace de travail
          </div>

          <div className="flex flex-col gap-0.5">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group relative flex items-center gap-2.5 rounded-lg py-2.5 pl-3.5 pr-2.5 transition-all duration-150"
                  style={{
                    color: active ? "#ffffff" : "rgba(255,255,255,0.50)",
                    background: active ? "rgba(86,164,91,0.13)" : "transparent",
                    boxShadow: active ? "inset 0 0 0 1px rgba(86,164,91,0.18)" : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.055)";
                      (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.78)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                      (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.50)";
                    }
                  }}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width: 3, height: 20, background: "#56a45b" }} />
                  )}
                  <span className="flex-shrink-0 transition-colors duration-150" style={{ color: active ? "#7fcf80" : "rgba(255,255,255,0.26)" }}>
                    <Icon name={item.icon} />
                  </span>
                  <span className="flex-1 text-[12.5px] font-medium leading-tight">{item.label}</span>
                  {item.shortcut && (
                    <span
                      className="flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-mono opacity-0 transition-opacity duration-100 group-hover:opacity-100"
                      style={{ color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.06)" }}
                    >
                      {item.shortcut}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Recherche ⌘K */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("cheetah:command-open"))}
            className="mt-2 flex items-center gap-2.5 rounded-lg py-2.5 pl-3.5 pr-2.5 text-[12.5px] font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.50)", border: "1px solid rgba(255,255,255,0.10)" }}
            title="Recherche & commandes rapides"
          >
            <span style={{ color: "rgba(255,255,255,0.26)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </span>
            <span className="flex-1 text-left">Rechercher</span>
            <kbd className="rounded px-1 py-0.5 text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.30)", background: "rgba(255,255,255,0.06)" }}>⌘K</kbd>
          </button>

          <div className="my-4 mx-1.5" style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

          {/* Statut sauvegarde — cliquable vers la page Sauvegarde & restauration */}
          <Link
            href="/backup"
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors"
            style={{
              background: isActive(pathname, "/backup") ? "rgba(86,164,91,0.14)" : "rgba(86,164,91,0.07)",
              border: "1px solid rgba(86,164,91,0.12)",
            }}
            title="Enregistrement automatique sur ce poste, y compris à la fermeture. Cliquez pour gérer les sauvegardes (export, restauration, dossier externe). Aucun serveur, aucun cloud."
          >
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: "#56a45b", boxShadow: "0 0 6px rgba(86,164,91,0.8)" }} />
            <span className="flex-1 text-[10.5px] font-medium" style={{ color: "rgba(255,255,255,0.42)" }}>
              Sauvegarde automatique
            </span>
            <span className="text-[10px] font-bold" style={{ color: "rgba(255,255,255,0.30)" }}>gérer →</span>
          </Link>

          <div className="flex-1" />

          {/* Compte + déconnexion */}
          <div className="rounded-lg px-3 py-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="truncate text-[11px] font-bold text-white/80">{session.name}</div>
            <div className="truncate text-[9.5px]" style={{ color: "rgba(255,255,255,0.35)" }}>{session.workspaceName}</div>
            {/* POST via server action: a GET link would be prefetched by Next and log the user out. */}
            {session.id !== DESKTOP_SESSION_ID ? (
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="mt-2 block w-full rounded-md px-2 py-1.5 text-center text-[11px] font-semibold transition-colors"
                  style={{ color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.10)" }}
                >
                  Déconnexion
                </button>
              </form>
            ) : null}
          </div>
        </nav>

        {/* Footer marque */}
        <div className="flex items-center gap-2.5 px-4 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
            <Image src="/cheetahsoft-logo.jpg" alt="CheetahSoft" width={24} height={24} className="h-6 w-6 rounded-full object-cover" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.32)" }}>CheetahSoft</div>
            <div className="truncate text-[9px]" style={{ color: "rgba(255,255,255,0.16)" }}>Maîtrise des Délais FGF v1</div>
          </div>
        </div>
      </aside>

      {/* ══ CONTENU ══ */}
      <main className="flex-1 overflow-y-auto scroll-smooth">
        <div className="mx-auto max-w-[1600px] px-6 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
