import { formatIsoDate, parseIsoDate } from "@/lib/planning/date-utils";
import { validationError } from "@/lib/planning/errors";
import {
  dependencyTypes,
  levelingStrategies,
  projectHealthValues,
  projectStatuses,
  resourceTypes,
  taskCalendarModes,
  taskConstraintTypes,
  taskSchedulingModes,
  taskPriorities,
  taskStatuses,
  taskTypes,
  taskWorkFormulas,
} from "@/types/planning";

export function ensureText(
  value: string,
  label: string,
  {
    maxLength = 160,
    allowEmpty = false,
  }: {
    maxLength?: number;
    allowEmpty?: boolean;
  } = {},
) {
  const normalized = value.trim();

  if (!normalized && !allowEmpty) {
    throw validationError(`${label} : champ obligatoire.`);
  }

  if (normalized.length > maxLength) {
    throw validationError(`${label} : ${maxLength} caractères au maximum.`);
  }

  return normalized;
}

export function ensureOptionalText(
  value: string | null | undefined,
  label: string,
  maxLength = 2000,
) {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw validationError(`${label} : ${maxLength} caractères au maximum.`);
  }

  return normalized;
}

export function ensureInteger(
  value: number,
  label: string,
  {
    min,
    max,
  }: {
    min?: number;
    max?: number;
  } = {},
) {
  if (!Number.isInteger(value)) {
    throw validationError(`${label} : un nombre entier est attendu.`);
  }

  if (min !== undefined && value < min) {
    throw validationError(`${label} : ${min} au minimum.`);
  }

  if (max !== undefined && value > max) {
    throw validationError(`${label} : ${max} au maximum.`);
  }

  return value;
}

export function ensureNumber(
  value: number,
  label: string,
  {
    min,
    max,
  }: {
    min?: number;
    max?: number;
  } = {},
) {
  if (!Number.isFinite(value)) {
    throw validationError(`${label} : un nombre valide est attendu.`);
  }

  if (min !== undefined && value < min) {
    throw validationError(`${label} : ${min} au minimum.`);
  }

  if (max !== undefined && value > max) {
    throw validationError(`${label} : ${max} au maximum.`);
  }

  return value;
}

export function ensureIsoDate(
  value: string | null | undefined,
  label: string,
  { required = true }: { required?: boolean } = {},
) {
  if (!value) {
    if (!required) {
      return null;
    }

    throw validationError(`${label} : champ obligatoire.`);
  }

  const normalized = value.trim();

  try {
    const date = parseIsoDate(normalized);
    if (formatIsoDate(date) !== normalized) {
      throw new Error("invalid");
    }
  } catch {
    throw validationError(`${label} : date attendue au format AAAA-MM-JJ.`);
  }

  return normalized;
}

export function ensureCurrencyCode(value: string) {
  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw validationError("Le code devise doit comporter 3 lettres (ISO).");
  }

  return normalized;
}

export function ensureHexColor(
  value: string | null | undefined,
  label: string,
  fallback: string,
) {
  const normalized = value?.trim() || fallback;

  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    throw validationError(`${label} : couleur hexadécimale à 6 chiffres attendue.`);
  }

  return normalized;
}

export function ensureTimezone(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw validationError("Le fuseau horaire est obligatoire.");
  }

  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_\-+]+)+$/.test(normalized)) {
    throw validationError("Le fuseau horaire doit être au format IANA, par exemple Europe/Paris.");
  }

  return normalized;
}

export function ensureEnum<T extends readonly string[]>(
  value: string,
  allowedValues: T,
  label: string,
): T[number] {
  if (allowedValues.includes(value)) {
    return value as T[number];
  }

  throw validationError(
    `${label} : valeur attendue parmi ${allowedValues.join(", ")}.`,
  );
}

export function ensureProjectStatus(value: string) {
  return ensureEnum(value, projectStatuses, "Project status");
}

export function ensureProjectHealth(value: string) {
  return ensureEnum(value, projectHealthValues, "Project health");
}

export function ensureTaskType(value: string) {
  return ensureEnum(value, taskTypes, "Task type");
}

export function ensureTaskStatus(value: string) {
  return ensureEnum(value, taskStatuses, "Task status");
}

export function ensureTaskPriority(value: string) {
  return ensureEnum(value, taskPriorities, "Task priority");
}

export function ensureTaskConstraintType(value: string) {
  return ensureEnum(value, taskConstraintTypes, "Task constraint type");
}

export function ensureTaskSchedulingMode(value: string) {
  return ensureEnum(value, taskSchedulingModes, "Task scheduling mode");
}

export function ensureTaskWorkFormula(value: string) {
  return ensureEnum(value, taskWorkFormulas, "Task work formula");
}

export function ensureTaskCalendarMode(value: string) {
  return ensureEnum(value, taskCalendarModes, "Task calendar mode");
}

export function ensureDependencyType(value: string) {
  return ensureEnum(value, dependencyTypes, "Dependency type");
}

export function ensureResourceType(value: string) {
  return ensureEnum(value, resourceTypes, "Resource type");
}

export function ensureLevelingStrategy(value: string) {
  return ensureEnum(value, levelingStrategies, "Resource leveling strategy");
}
