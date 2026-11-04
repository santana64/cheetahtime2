export type PlanningErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PERSISTENCE";

export class PlanningError extends Error {
  readonly code: PlanningErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: PlanningErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PlanningError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function validationError(
  message: string,
  details?: Record<string, unknown>,
) {
  return new PlanningError("VALIDATION", message, 422, details);
}

export function notFoundError(
  message: string,
  details?: Record<string, unknown>,
) {
  return new PlanningError("NOT_FOUND", message, 404, details);
}

export function conflictError(
  message: string,
  details?: Record<string, unknown>,
) {
  return new PlanningError("CONFLICT", message, 409, details);
}

export function persistenceError(
  message: string,
  details?: Record<string, unknown>,
) {
  return new PlanningError("PERSISTENCE", message, 503, details);
}

export function isPlanningError(error: unknown): error is PlanningError {
  return error instanceof PlanningError;
}

export function getErrorMessage(
  error: unknown,
  fallback = "Unexpected planning error.",
) {
  return error instanceof Error ? error.message : fallback;
}

export function getErrorStatus(error: unknown, fallback = 500) {
  if (isPlanningError(error)) {
    return error.status;
  }
  // Other typed errors (e.g. AuthError) carry their own HTTP status.
  if (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 600
  ) {
    return error.status;
  }
  return fallback;
}

export function getErrorDetails(error: unknown) {
  return isPlanningError(error) ? error.details : undefined;
}
