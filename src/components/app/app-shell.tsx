"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import Link from "next/link";

import { BRAND_MENU, BrandSidebar } from "@/components/app/brand-sidebar";
import { CommandPalette } from "@/components/app/command-palette";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/features/auth/actions";
import type { AuthSession } from "@/services/auth";

const DESKTOP_SESSION_ID = "desktop-session";

export function AppShell({
  children,
  session,
  projects = [],
}: {
  children: ReactNode;
  session: AuthSession;
  projects?: { id: string; name: string }[];
}) {
  const search = useSearchParams()?.toString() ?? "";
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

      {/* ══ SIDEBAR — identique à l'écran d'accueil ══ */}
      <BrandSidebar
        search={search}
        showSearch
        footer={
          <div className="rounded-lg px-3 py-2.5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="truncate text-[11.5px] font-bold text-white/85">{session.name}</div>
            <div className="truncate text-[10px] text-white/45">{session.workspaceName}</div>
            {/* POST via server action : un lien GET serait préchargé par Next et déconnecterait. */}
            {session.id !== DESKTOP_SESSION_ID ? (
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="mt-2 block w-full rounded-md px-2 py-1.5 text-center text-[11px] font-semibold text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white"
                  style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  Se déconnecter
                </button>
              </form>
            ) : null}
          </div>
        }
      />

      {/* ══ CONTENU ══ */}
      <main id="contenu" className="flex-1 overflow-y-auto" style={{ background: "#f6f4ee" }}>
        {/* Navigation compacte sur petit écran (la barre latérale est masquée < 768 px). */}
        <nav
          className="flex items-center gap-1 overflow-x-auto px-4 py-2 md:hidden"
          style={{ background: "linear-gradient(160deg, #1a4a20 0%, #0e2714 100%)" }}
          aria-label="Navigation principale"
        >
          <span className="mr-2 text-[14px] font-black text-white">
            Cheetah<span style={{ color: "#f4a321" }}>Time</span>
          </span>
          {BRAND_MENU.map((item) => (
            <Link prefetch={false} key={item.label} href={item.href} className="whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-semibold text-white/75 hover:bg-white/10">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
