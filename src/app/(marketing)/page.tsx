export const dynamic = "force-dynamic";

import Link from "next/link";
import Image from "next/image";
import { FolderOpen, Home, List, Plus } from "lucide-react";

/**
 * Page d'accueil — calquée sur celle de CheetahCost (spec François) :
 * barre latérale sombre + logo central + « Logiciel de planification /
 * Maîtrise des Délais des Projets » + 4 cartes d'action.
 */

const MENU = [
  { label: "Accueil", href: "/", icon: Home, active: true },
  { label: "Projets en cours", href: "/projects", icon: FolderOpen },
  { label: "Nouveau projet", href: "/projects/new", icon: Plus },
  { label: "Tous les projets", href: "/projects", icon: List },
];

const CARDS = [
  { label: "Projets en cours", desc: "Reprendre un projet actif", href: "/projects", icon: FolderOpen },
  { label: "Nouveau projet", desc: "Créer un projet et sa structure des tâches", href: "/projects/new", icon: Plus },
  { label: "Tous les projets", desc: "Parcourir et ouvrir un projet existant", href: "/projects", icon: List, primary: true },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen bg-[#f6f4ee]">
      {/* ── Barre latérale sombre ── */}
      <aside
        className="relative hidden w-[260px] flex-col justify-between overflow-hidden px-4 py-5 md:flex"
        style={{ background: "linear-gradient(160deg, #1a4a20 0%, #0e2714 55%, #0d1f10 100%)", borderRight: "1px solid rgba(86,164,91,0.18)" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{ backgroundImage: "repeating-linear-gradient(-62deg, transparent, transparent 40px, rgba(255,255,255,0.018) 40px, rgba(255,255,255,0.018) 41px)" }}
        />
        <div className="relative">
          {/* Marque */}
          <div className="flex items-center gap-2.5 px-1.5">
            <Image src="/cheetahsoft-logo.jpg" alt="CheetahSoft" width={34} height={34} style={{ borderRadius: "50%" }} priority />
            <div className="leading-tight">
              <div className="text-[15px] font-black text-white">
                Cheetah<span style={{ color: "#f4a321" }}>Time</span>
              </div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">Planification</div>
            </div>
          </div>

          <div className="mt-6 px-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">Espace de travail</div>

          <nav className="mt-2 space-y-1">
            {MENU.map(({ label, href, icon: Icon, active }) => (
              <Link
                key={label}
                href={href}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors"
                style={
                  active
                    ? { background: "linear-gradient(135deg, rgba(86,164,91,0.28), rgba(86,164,91,0.12))", color: "white", border: "1px solid rgba(86,164,91,0.32)" }
                    : { color: "rgba(255,255,255,0.55)", border: "1px solid transparent" }
                }
              >
                <Icon className="size-4" style={{ color: active ? "#8fce95" : "rgba(255,255,255,0.5)" }} />
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 px-1.5 text-[11px] text-white/45">
            <span className="inline-block size-2 rounded-full" style={{ background: "#56a45b", boxShadow: "0 0 6px rgba(86,164,91,0.6)" }} />
            Sauvegarde automatique sur ce poste
          </div>
          <div className="mt-3 flex items-center gap-2 px-1.5 opacity-40">
            <Image src="/cheetahsoft-logo.jpg" alt="CheetahSoft" width={20} height={20} style={{ borderRadius: "50%" }} />
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/70">CheetahSoft</span>
          </div>
        </div>
      </aside>

      {/* ── Zone centrale ── */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="flex flex-col items-center text-center animate-velocity-enter">
          <div className="logo-breathe" style={{ filter: "drop-shadow(0 6px 28px rgba(30,140,30,0.35))" }}>
            <Image src="/cheetahsoft-logo.jpg" alt="CheetahSoft" width={128} height={128} style={{ borderRadius: "50%" }} priority />
          </div>
          <h1 className="mt-5 text-[26px] font-black tracking-tight text-[#1a4a20]">Logiciel de planification</h1>
          <p className="mt-1 text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-500">Maîtrise des Délais des Projets</p>
          <div className="mt-3 flex items-center gap-1.5">
            <div className="h-[2px] w-8 rounded-full" style={{ background: "#56a45b" }} />
            <div className="h-[2px] w-4 rounded-full" style={{ background: "#f4a321" }} />
          </div>
          <div className="mt-3 text-[22px] font-black">
            <span style={{ color: "#1a4a20" }}>Cheetah</span><span style={{ color: "#56a45b" }}>Time</span>
          </div>
        </div>

        {/* 4 cartes d'action */}
        <div className="mt-10 grid w-full max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map(({ label, desc, href, icon: Icon, primary }) => (
            <Link
              key={label}
              href={href}
              className="group elite-lift rounded-2xl p-5 transition-all animate-slide-spring"
              style={
                primary
                  ? { background: "linear-gradient(135deg, #56a45b, #3f8f48)", boxShadow: "0 12px 30px -12px rgba(86,164,91,0.6)", border: "1px solid rgba(255,255,255,0.18)" }
                  : { background: "white", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 6px 22px -12px rgba(22,101,52,0.18)" }
              }
            >
              <div
                className="flex size-11 items-center justify-center rounded-xl"
                style={primary ? { background: "rgba(255,255,255,0.18)" } : { background: "rgba(86,164,91,0.12)", border: "1px solid rgba(86,164,91,0.22)" }}
              >
                <Icon className="size-5" style={{ color: primary ? "white" : "#3f8f48" }} />
              </div>
              <div className="mt-3 text-[15px] font-black" style={{ color: primary ? "white" : "#0d1f10" }}>{label}</div>
              <div className="mt-1 text-[12px] leading-5" style={{ color: primary ? "rgba(255,255,255,0.85)" : "#64748b" }}>{desc}</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
