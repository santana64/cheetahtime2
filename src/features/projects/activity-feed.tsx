"use client";

// NOTE: This file exports ActivityFeed as a conceptually "server-ready" component
// (pure props, no hooks), but the client filter sub-component requires the
// "use client" boundary to be at the file level so useState can be used inside
// ActivityFilterBar. ActivityFeed itself has no hooks and is safe to call from
// async server pages — it simply receives pre-fetched events as props.

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ActivityEvent } from "@/services/activity";

// ─── Helper: relative time ────────────────────────────────────────────────────

function getRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;

  if (diffDays === 0) return `Aujourd'hui a ${time}`;
  if (diffDays === 1) return `Hier a ${time}`;

  const weekdays = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const months = [
    "janvier", "fevrier", "mars", "avril", "mai", "juin",
    "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
  ];
  return `${weekdays[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} a ${time}`;
}

// ─── Helper: day bucket label ─────────────────────────────────────────────────

function getDayLabel(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";

  const weekdays = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const months = [
    "janvier", "fevrier", "mars", "avril", "mai", "juin",
    "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
  ];
  return `${weekdays[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function getDayKey(isoString: string): string {
  return isoString.slice(0, 10); // YYYY-MM-DD
}

// ─── Helper: initials ─────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ─── Helper: avatar color from name hash ─────────────────────────────────────

const AVATAR_PALETTES: [string, string][] = [
  ["#56a45b", "#1a4a20"],
  ["#f4a321", "#7a5010"],
  ["#4e8dc4", "#1a3a5a"],
  ["#c45e7a", "#5a1a2a"],
  ["#7a5ec4", "#2a1a5a"],
  ["#4ec49a", "#1a4a38"],
  ["#c4944e", "#5a3a1a"],
  ["#c47a4e", "#5a2a1a"],
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const [from, to] = AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

// ─── Helper: action label in French ──────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  created: "a cree",
  updated: "a mis a jour",
  deleted: "a supprime",
  commented: "a commente",
  archived: "a archive",
  restored: "a restaure",
  assigned: "a assigne",
  completed: "a complete",
  approved: "a approuve",
  rejected: "a rejete",
  attached: "a joint",
};

const ENTITY_LABELS: Record<string, string> = {
  task: "la tache",
  risk: "le risque",
  comment: "le commentaire",
  baseline: "le referentiel",
  project: "le projet",
  issue: "l'incident",
  change: "la demande de changement",
  attachment: "la piece jointe",
};

function describeAction(event: ActivityEvent): string {
  const actor = event.actorName;
  const verb = ACTION_LABELS[event.action] ?? `a effectue l'action "${event.action}" sur`;
  const entityLabel = ENTITY_LABELS[event.entityType] ?? `l'element (${event.entityType})`;
  const entityName = event.entityName ? ` \u00ab\u00a0${event.entityName}\u00a0\u00bb` : "";

  let base = `${actor} ${verb} ${entityLabel}${entityName}`;

  if (event.action === "updated" && event.fieldName) {
    const field = event.fieldName;
    if (event.oldValue && event.newValue) {
      base += ` : ${field} : ${event.oldValue} \u2192 ${event.newValue}`;
    } else if (event.newValue) {
      base += ` : ${field} defini a ${event.newValue}`;
    }
  }

  return base;
}

// ─── Entity type icons (inline SVG) ──────────────────────────────────────────

function EntityIcon({ entityType }: { entityType: string }) {
  const cls = "size-3.5 shrink-0";

  switch (entityType) {
    case "task":
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "risk":
    case "issue":
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8 6.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
        </svg>
      );
    case "comment":
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H9l-3 2v-2H3a1 1 0 01-1-1V3z"
            stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case "baseline":
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 3.5V2.5a1 1 0 011-1h4a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "change":
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 4h6l4 4-4 4H3V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="6" cy="8" r="1" fill="currentColor" />
        </svg>
      );
    case "attachment":
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 8.5l3.5-3.5a2 2 0 112.8 2.8l-5 5a3 3 0 01-4.2-4.2l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "project":
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 12V6l6-4 6 4v6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <rect x="5" y="8" width="6" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2l2 4H14l-3.5 2.5 1.5 4L8 10l-4 2.5 1.5-4L2 6h4L8 2z"
            stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
  }
}

// ─── Filter pill colors per entityType ───────────────────────────────────────

const ENTITY_FILTER_META: { key: string; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "task", label: "Taches" },
  { key: "risk", label: "Risques" },
  { key: "comment", label: "Commentaires" },
  { key: "issue", label: "Incidents" },
  { key: "change", label: "Changements" },
  { key: "baseline", label: "Referentiels" },
];

// ─── Client sub-component: filter bar ────────────────────────────────────────

function ActivityFilterBar({
  activeFilter,
  onChange,
}: {
  activeFilter: string;
  onChange: (filter: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par type">
      {ENTITY_FILTER_META.map(({ key, label }) => {
        const isActive = activeFilter === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200",
              "border focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            )}
            style={
              isActive
                ? {
                    background: "linear-gradient(135deg, #56a45b 0%, #1a4a20 100%)",
                    border: "1px solid #56a45b",
                    color: "#ffffff",
                    boxShadow: "0 2px 8px rgba(86,164,91,0.35)",
                  }
                : {
                    background: "rgba(255,255,255,0.80)",
                    border: "1px solid rgba(86,164,91,0.22)",
                    color: "#374151",
                  }
            }
            aria-pressed={isActive}
          >
            {key !== "all" && <EntityIcon entityType={key} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Event card ──────────────────────────────────────────────────────────────

function ActivityEventCard({ event }: { event: ActivityEvent }) {
  const initials = getInitials(event.actorName);
  const avatarGradient = getAvatarColor(event.actorName);
  const description = describeAction(event);
  const relTime = getRelativeTime(event.createdAt);

  const iconColorMap: Record<string, string> = {
    task: "#56a45b",
    risk: "#f4a321",
    comment: "#4e8dc4",
    issue: "#dc2626",
    change: "#f4a321",
    attachment: "#64748b",
    baseline: "#7a5ec4",
    project: "#1a4a20",
  };
  const iconColor = iconColorMap[event.entityType] ?? "#9ca3af";

  return (
    <div
      className={cn(
        "group relative flex gap-3 rounded-xl p-3.5 transition-all duration-200",
        "hover:-translate-y-px",
      )}
      style={{
        background: "rgba(255,255,255,0.85)",
        border: "1px solid rgba(86,164,91,0.12)",
        boxShadow: "0 1px 3px rgba(26,74,32,0.06)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 4px 16px rgba(26,74,32,0.12), 0 1px 4px rgba(26,74,32,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 1px 3px rgba(26,74,32,0.06)";
      }}
    >
      {/* Actor avatar */}
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm"
        style={{ background: avatarGradient }}
        aria-label={event.actorName}
        title={event.actorName}
      >
        {initials}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-1">
          <p className="text-[13px] leading-5 text-slate-800">
            {description}
          </p>
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
            style={{ color: iconColor, background: `${iconColor}15` }}
          >
            <EntityIcon entityType={event.entityType} />
            {ENTITY_LABELS[event.entityType] ?? event.entityType}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{relTime}</p>
      </div>
    </div>
  );
}

// ─── Day group ────────────────────────────────────────────────────────────────

function DayGroup({ label, events }: { label: string; events: ActivityEvent[] }) {
  return (
    <div>
      {/* Day header */}
      <div className="mb-3 flex items-center gap-3">
        <span
          className="text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ color: "#56a45b" }}
        >
          {label}
        </span>
        <div className="h-px flex-1" style={{ background: "rgba(86,164,91,0.20)" }} />
      </div>

      {/* Events in this day */}
      <div className="relative pl-5">
        {/* Timeline vertical line */}
        <div
          className="pointer-events-none absolute left-0 top-0 w-px"
          style={{
            height: "calc(100% - 16px)",
            background: "linear-gradient(180deg, #56a45b 0%, rgba(86,164,91,0.15) 100%)",
          }}
          aria-hidden="true"
        />

        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <div key={event.id} className="relative">
              {/* Timeline dot */}
              <div
                className="pointer-events-none absolute -left-5 top-3.5 size-2.5 -translate-x-[calc(50%-0.5px)] rounded-full border-2 border-white"
                style={{ background: "#56a45b", boxShadow: "0 0 0 1.5px rgba(86,164,91,0.35)" }}
                aria-hidden="true"
              />
              <ActivityEventCard event={event} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function ActivityEmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-2xl px-8 py-14 text-center"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.90) 0%, rgba(86,164,91,0.06) 100%)",
        border: "1px dashed rgba(86,164,91,0.28)",
      }}
    >
      {/* Book / journal icon */}
      <div
        className="flex size-14 items-center justify-center rounded-2xl"
        style={{ background: "rgba(86,164,91,0.10)", border: "1px solid rgba(86,164,91,0.18)" }}
      >
        <svg
          className="size-7"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          style={{ color: "#56a45b" }}
        >
          <path
            d="M4 19.5A2.5 2.5 0 016.5 17H20"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path d="M9 7h6M9 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      <div>
        <p className="text-[15px] font-semibold text-slate-700">
          Aucune activite enregistree
        </p>
        <p className="mt-1 max-w-xs text-[13px] leading-5 text-slate-400">
          Les evenements du projet apparaitront ici au fur et a mesure de leur creation.
        </p>
      </div>
    </div>
  );
}

// ─── Inner feed (client shell with filter state) ──────────────────────────────

function ActivityFeedShell({ events }: { events: ActivityEvent[] }) {
  const [activeFilter, setActiveFilter] = useState("all");

  const filtered =
    activeFilter === "all"
      ? events
      : events.filter((e) => e.entityType === activeFilter);

  // Group by day
  const groups: { key: string; label: string; events: ActivityEvent[] }[] = [];
  for (const event of filtered) {
    const key = getDayKey(event.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.events.push(event);
    } else {
      groups.push({ key, label: getDayLabel(event.createdAt), events: [event] });
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div
        className="rounded-xl px-4 py-3"
        style={{
          background: "rgba(255,255,255,0.75)",
          border: "1px solid rgba(86,164,91,0.14)",
          boxShadow: "0 1px 4px rgba(26,74,32,0.06)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#1a4a20" }}>
            Filtrer par type
          </span>
          <ActivityFilterBar activeFilter={activeFilter} onChange={setActiveFilter} />
        </div>
      </div>

      {/* Feed body */}
      {filtered.length === 0 ? (
        <ActivityEmptyState />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <DayGroup key={g.key} label={g.label} events={g.events} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: "linear-gradient(160deg, #f7f8f5 0%, #eef5ee 100%)",
        border: "1px solid rgba(86,164,91,0.16)",
        boxShadow: "0 4px 24px rgba(26,74,32,0.08)",
      }}
    >
      {/* Ambient top accent */}
      <div
        className="h-[3px] w-full"
        style={{
          background: "linear-gradient(90deg, #1a4a20, #56a45b, #f4a321, #56a45b, #1a4a20)",
        }}
      />

      {/* Header */}
      <div
        className="flex items-center justify-between gap-4 px-6 py-4"
        style={{ borderBottom: "1px solid rgba(86,164,91,0.12)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-8 items-center justify-center rounded-lg"
            style={{ background: "rgba(86,164,91,0.12)", border: "1px solid rgba(86,164,91,0.20)" }}
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: "#56a45b" }}>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
              <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-bold tracking-tight" style={{ color: "#1a4a20" }}>
              Journal d&apos;activite
            </h2>
            <p className="text-[11px]" style={{ color: "#56a45b" }}>
              {events.length} evenement{events.length !== 1 ? "s" : ""} enregistre{events.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        <ActivityFeedShell events={events} />
      </div>
    </div>
  );
}
