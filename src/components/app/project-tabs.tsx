"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Barre d'onglets projet — style CheetahCost : soulignement vert à l'actif,
 * texte slate sinon (léger, sur fond blanc). Plus de pills sombres.
 */
export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  // Mêmes onglets, même ordre que Cheetah Cost (Tableaux B2P, Alerte, Dates des B2P,
  // Structure, Rapports), transposés en délai (CdC p. 12), puis les onglets propres
  // à la planification (Planning, Ressources, Potentiel-tâches…).
  const tabs = [
    { href: `/projects/${projectId}/b2p`, label: "Tableaux B2P" },
    { href: `/projects/${projectId}/dashboard`, label: "Alerte" },
    { href: `/projects/${projectId}/dates-b2p`, label: "Dates des B2P" },
    { href: `/projects/${projectId}/structure`, label: "Structure" },
    { href: `/projects/${projectId}/rapports`, label: "Rapports de délais" },
    { href: `/projects/${projectId}/planning`, label: "Planning" },
    { href: `/projects/${projectId}/resources`, label: "Ressources" },
    { href: `/projects/${projectId}/network`, label: "Potentiel-tâches" },
    { href: `/projects/${projectId}/lookahead`, label: "À venir" },
    { href: `/projects/${projectId}/baselines`, label: "Référentiels" },
    { href: `/projects/${projectId}/risks`, label: "Risques" },
    { href: `/projects/${projectId}/activity`, label: "Activité" },
    { href: `/projects/${projectId}/settings`, label: "Paramètres" },
  ];


  return (
    <nav className="-mb-px flex items-center overflow-x-auto" aria-label="Onglets du projet">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative border-b-2 px-2.5 py-2.5 text-[12px] font-bold whitespace-nowrap transition-colors duration-100 select-none",
              isActive
                ? "border-[#56a45b] text-[#3f8f48]"
                : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
