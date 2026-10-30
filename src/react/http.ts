import { OminityActionError } from "../actions/client.js";

/**
 * Calls one of the package's own server routes (`/api/auth/*`, `/api/commerce/*`). Failures become an
 * `OminityActionError` with the route's `code` and field messages.
 */
export async function requestRoute<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // An empty body is fine for successful requests; failures are reported below.
  }

  if (!response.ok) {
    const record = (typeof payload === "object" && payload !== null ? payload : {}) as {
      readonly error?: unknown;
      readonly code?: unknown;
      readonly details?: unknown;
    };
    throw new OminityActionError(
      typeof record.error === "string" ? record.error : `Request failed (${response.status}).`,
      response.status,
      typeof record.code === "string" ? record.code : "REQUEST_FAILED",
      record.details,
    );
  }

  return payload as T;
}

export function jsonBody(value: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(value) };
}
