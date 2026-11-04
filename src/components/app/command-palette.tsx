"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Command = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  href?: string;
  action?: () => void;
  keywords?: string;
};

type ProjectLink = { id: string; name: string };

/**
 * Palette de commandes ⌘K / Ctrl+K.
 * Navigation instantanée vers les projets et les vues, plus le mode réunion.
 * 100 % interne à Cheetah Time.
 */
export function CommandPalette({ projects = [] }: { projects?: ProjectLink[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: "nav-projects", label: "Portefeuille", group: "Navigation", href: "/projects", keywords: "projets accueil" },
      { id: "nav-portfolio", label: "Portfolio+", group: "Navigation", href: "/portfolio" },
      { id: "nav-alerts", label: "Alertes", group: "Navigation", href: "/alerts" },
      { id: "nav-reports", label: "Rapports", group: "Navigation", href: "/reports" },
      { id: "nav-settings", label: "Paramètres", group: "Navigation", href: "/settings" },
      { id: "nav-new", label: "Nouveau projet", group: "Navigation", href: "/projects/new", hint: "Créer" },
    ];

    const projectCmds: Command[] = projects.flatMap((p) => [
      { id: `p-${p.id}-dash`, label: p.name, hint: "Alerte", group: "Projets", href: `/projects/${p.id}/dashboard`, keywords: p.id },
      { id: `p-${p.id}-plan`, label: `${p.name} · Planning`, group: "Projets", href: `/projects/${p.id}/planning`, keywords: p.id },
      { id: `p-${p.id}-ana`, label: `${p.name} · Analyse`, group: "Projets", href: `/projects/${p.id}/analytics`, keywords: p.id },
    ]);

    const actions: Command[] = [
      {
        id: "meeting-mode",
        label: "Mode réunion (plein écran épuré)",
        hint: "Présentation",
        group: "Actions",
        keywords: "presentation videoprojecteur focus",
        action: () => {
          window.dispatchEvent(new CustomEvent("cheetah:meeting-toggle"));
        },
      },
    ];

    return [...nav, ...projectCmds, ...actions];
  }, [projects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.hint ?? ""} ${c.group} ${c.keywords ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function openEvt() { setOpen(true); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("cheetah:command-open", openEvt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cheetah:command-open", openEvt);
    };
  }, []);

  // Réinitialisation à l'ouverture, faite pendant le rendu (pas dans un effet).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActive(0);
    }
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  function run(cmd?: Command) {
    if (!cmd) return;
    setOpen(false);
    if (cmd.action) cmd.action();
    else if (cmd.href) router.push(cmd.href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center p-4 pt-[12vh]"
      style={{ background: "rgba(8,18,10,0.55)", backdropFilter: "blur(4px)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ border: "1px solid rgba(0,0,0,0.08)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <span className="text-slate-400">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); run(filtered[active]); }
            }}
            placeholder="Rechercher un projet, une vue, une action…"
            className="h-12 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-400">Aucun résultat.</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(cmd)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
              style={{ background: i === active ? "rgba(86,164,91,0.10)" : "transparent" }}
            >
              <span className="flex items-center gap-2 truncate">
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  {cmd.group}
                </span>
                <span className="truncate text-sm font-semibold text-slate-800">{cmd.label}</span>
              </span>
              {cmd.hint && (
                <span className="flex-shrink-0 text-[11px] text-slate-400">{cmd.hint}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
