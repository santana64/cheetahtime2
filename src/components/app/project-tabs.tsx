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
  const tabs = [
    { href: `/projects/${projectId}/dashboard`, label: "Tableau de bord" },
    { href: `/projects/${projectId}/planning`, label: "Planning" },
    { href: `/projects/${projectId}/lookahead`, label: "Look-ahead" },
    { href: `/projects/${projectId}/network`, label: "Potentiel-tâches" },
    { href: `/projects/${projectId}/analytics`, label: "Analyse" },
    { href: `/projects/${projectId}/resources`, label: "Ressources" },
    { href: `/projects/${projectId}/baselines`, label: "Référentiels" },
    { href: `/projects/${projectId}/b2p`, label: "Bilans B2P" },
    { href: `/projects/${projectId}/risks`, label: "Risques" },
    { href: `/projects/${projectId}/soutenance`, label: "Soutenance" },
    { href: `/projects/${projectId}/activity`, label: "Activité" },
    { href: `/projects/${projectId}/settings`, label: "Paramètres" },
  ];

  return (
    <div className="flex flex-wrap items-center">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative -mb-px border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors duration-100 select-none",
              isActive
                ? "border-[#56a45b] text-[#3f8f48]"
                : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
