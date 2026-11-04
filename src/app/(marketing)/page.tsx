export const dynamic = "force-dynamic";

import Link from "next/link";
import Image from "next/image";
import { FolderOpen, Gauge, List, Plus } from "lucide-react";

import { BrandSidebar } from "@/components/app/brand-sidebar";

/**
 * Page d'accueil — calquée sur celle de CheetahCost (CdC p. 1) :
 * barre latérale sombre + logo central + « Logiciel de planification /
 * Maîtrise des Délais des Projets » + 4 cartes d'action (dont le Tableau de bord PMO).
 * Aucune animation bloquante : l'écran est net dès le premier affichage.
 */

const CARDS = [
  { label: "Projets en cours", desc: "Reprendre un projet actif", href: "/projects", icon: FolderOpen },
  { label: "Nouveau projet", desc: "Créer un projet et sa structure des tâches", href: "/projects/new", icon: Plus },
  { label: "Tous les projets", desc: "Parcourir et ouvrir un projet existant", href: "/projects?vue=tous", icon: List, primary: true },
  { label: "Tableau de bord PMO", desc: "Vue portefeuille : santé, écarts, échéances", href: "/portfolio", icon: Gauge },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen bg-[#f6f4ee]">
      <div className="sticky top-0 hidden h-screen md:block">
        <BrandSidebar />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <div style={{ filter: "drop-shadow(0 6px 28px rgba(30,140,30,0.35))" }}>
            <Image src="/cheetahsoft-logo.jpg" alt="CheetahSoft" width={128} height={128} style={{ borderRadius: "50%" }} priority />
          </div>
          <h1 className="mt-5 text-[26px] font-black tracking-tight text-[#1a4a20]">Logiciel de planification</h1>
          <p className="mt-1 text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-500">Maîtrise des Délais des Projets</p>
          <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
            <div className="h-[2px] w-8 rounded-full" style={{ background: "#56a45b" }} />
            <div className="h-[2px] w-4 rounded-full" style={{ background: "#f4a321" }} />
          </div>
          <div className="mt-3 text-[22px] font-black">
            <span style={{ color: "#1a4a20" }}>Cheetah</span>
            <span style={{ color: "#56a45b" }}>Time</span>
          </div>
        </div>

        <div className="mt-10 grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map(({ label, desc, href, icon: Icon, primary }) => (
            <Link
              key={label}
              href={href}
              className="group elite-lift rounded-2xl p-5 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56a45b]"
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
                <Icon className="size-5" style={{ color: primary ? "white" : "#3f8f48" }} aria-hidden="true" />
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
