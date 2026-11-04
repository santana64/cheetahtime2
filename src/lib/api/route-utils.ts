import {
  getErrorDetails,
  getErrorMessage,
  getErrorStatus,
} from "@/lib/planning/errors";

export function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function jsonError(
  message: string,
  status = 400,
  details?: Record<string, unknown>,
) {
  return Response.json(
    {
      error: message,
      ...details,
    },
    { status },
  );
}

export function getString(
  source: Record<string, unknown>,
  key: string,
): string;
export function getString(
  source: Record<string, unknown>,
  key: string,
  required: true,
): string;
export function getString(
  source: Record<string, unknown>,
  key: string,
  required: false,
): string | null;
export function getString(
  source: Record<string, unknown>,
  key: string,
  required = true,
) {
  const value = source[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (required) {
    throw new Error(`Missing required field: ${key}`);
  }

  return null;
}

export function getNumber(
  source: Record<string, unknown>,
  key: string,
  fallback = 0,
) {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export async function parseJsonBody(request: Request) {
  const body = (await request.json()) as unknown;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  return body as Record<string, unknown>;
}

export function jsonErrorFromUnknown(
  error: unknown,
  fallbackMessage: string,
  fallbackStatus = 400,
) {
  return jsonError(
    getErrorMessage(error, fallbackMessage),
    getErrorStatus(error, fallbackStatus),
    getErrorDetails(error),
  );
}
