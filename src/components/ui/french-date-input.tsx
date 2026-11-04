"use client";

import { useState } from "react";

import { formatDateLabel } from "@/lib/format/formatters";

/**
 * Saisie de date jj/mm/aaaa — même comportement que le `FrenchDateInput` de
 * Cheetah Cost : saisie texte française (« 5/3 », « 05.03.2027 », « 5-3-27 »
 * acceptés), calendrier à côté, valeur ISO transmise au formulaire via un
 * champ caché. Indépendant de la langue du navigateur.
 */

function isValidIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Port fidèle de `parseFrenchDateInput` (Cheetah Cost, src/lib/dates.ts). */
export function parseFrenchDateInput(raw: string, fallbackYear?: number): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (isValidIso(value)) return value;
  const normalized = value.replace(/\s+/g, "").replace(/[.]/g, "/").replace(/-/g, "/");
  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(normalized);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : fallbackYear ?? new Date().getFullYear();
  if (year < 100) year += 2000;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidIso(iso) ? iso : null;
}

export function FrenchDateInput({
  name,
  defaultValue,
  min,
  max,
  disabled,
  label,
  ariaLabel,
  required,
  onChange,
  className,
}: {
  name: string;
  defaultValue?: string | null;
  min?: string;
  max?: string;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
  required?: boolean;
  onChange?: (iso: string) => void;
  className?: string;
}) {
  const initial = defaultValue && isValidIso(defaultValue) ? defaultValue : "";
  const [iso, setIso] = useState(initial);
  const [display, setDisplay] = useState(initial ? formatDateLabel(initial) : "");
  const [error, setError] = useState<string | null>(null);

  const commit = (raw: string) => {
    if (!raw.trim()) {
      setIso("");
      setError(required ? "Date obligatoire." : null);
      return;
    }
    const parsed = parseFrenchDateInput(raw, iso ? Number(iso.slice(0, 4)) : undefined);
    if (!parsed) {
      setError("Date attendue : jj/mm/aaaa.");
      return;
    }
    if (min && parsed < min) {
      setError(`Date avant le minimum (${formatDateLabel(min)}).`);
      setDisplay(formatDateLabel(parsed));
      return;
    }
    if (max && parsed > max) {
      setError(`Date après le maximum (${formatDateLabel(max)}).`);
      setDisplay(formatDateLabel(parsed));
      return;
    }
    setError(null);
    setIso(parsed);
    setDisplay(formatDateLabel(parsed));
    onChange?.(parsed);
  };

  return (
    <div className={className}>
      {label ? <div className="mb-1 text-[11px] text-slate-600">{label}</div> : null}
      <input type="hidden" name={name} value={disabled ? "" : iso} />
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="numeric"
          value={display}
          disabled={disabled}
          placeholder="jj/mm/aaaa"
          aria-label={ariaLabel ?? label}
          aria-invalid={Boolean(error)}
          onChange={(e) => setDisplay(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(e.currentTarget.value);
            }
          }}
          className="input-base h-8 min-w-0 flex-1 text-[12px] disabled:opacity-40"
        />
        <input
          type="date"
          value={iso}
          min={min}
          max={max}
          disabled={disabled}
          tabIndex={-1}
          aria-label={`${ariaLabel ?? label ?? "Date"} — calendrier`}
          onChange={(e) => {
            setError(null);
            setIso(e.target.value);
            setDisplay(e.target.value ? formatDateLabel(e.target.value) : "");
            if (e.target.value) onChange?.(e.target.value);
          }}
          className="h-8 w-[38px] shrink-0 rounded-lg border border-black/[0.13] bg-white px-1 text-transparent disabled:opacity-40"
        />
      </div>
      {error ? <div className="mt-1 text-[11px] text-rose-600">{error}</div> : null}
    </div>
  );
}
