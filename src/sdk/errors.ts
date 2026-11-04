import {
  ErrorResponse,
  HTTPClientError,
  OminityError,
  SDKValidationError,
} from "@ominity/api-typescript/models/errors";

import { OminityActionError } from "../actions/client.js";

const STATUS_CODES: Readonly<Record<number, string>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  410: "GONE",
  413: "PAYLOAD_TOO_LARGE",
  422: "VALIDATION_FAILED",
  429: "RATE_LIMITED",
};

function statusCode(status: number): string {
  return STATUS_CODES[status] ?? (status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED");
}

/** Seconds to wait from a 429's `Retry-After` header (Ominity also sends `retryAfter` in the body). */
function retryAfterOf(error: OminityError): number | undefined {
  if (error.statusCode !== 429) return undefined;
  const seconds = Number(error.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/**
 * Turns anything an SDK call throws into an `OminityActionError`. `code` is the API's machine-readable reason when it
 * sends one (for example `subscription.next_period_locked`), otherwise one derived from the status; field messages are
 * available as `error.fields`.
 */
export function toOminitySdkError(error: unknown): OminityActionError {
  if (error instanceof OminityActionError) return error;

  if (error instanceof ErrorResponse) {
    return new OminityActionError(error.detail || error.title, error.status, error.code ?? statusCode(error.status), {
      title: error.title,
      ...(error.code ? { reason: error.code } : {}),
      ...(error.fields ? { fields: error.fields } : {}),
      ...(retryAfterOf(error) ? { retryAfter: retryAfterOf(error) } : {}),
    });
  }

  if (error instanceof SDKValidationError) {
    return new OminityActionError(error.message, 400, "INVALID_REQUEST", { cause: error.cause });
  }

  if (error instanceof OminityError) {
    const retryAfter = retryAfterOf(error);
    return new OminityActionError(error.message, error.statusCode, statusCode(error.statusCode), retryAfter ? { retryAfter } : undefined);
  }

  if (error instanceof HTTPClientError) {
    const code = error.name === "RequestTimeoutError"
      ? "TIMEOUT"
      : error.name === "RequestAbortedError" ? "ABORTED" : "NETWORK_ERROR";
    return new OminityActionError(error.message, 0, code);
  }

  if (typeof error === "object" && error !== null) {
    const structured = error as { message?: unknown; status?: unknown; code?: unknown; details?: unknown };
    if (typeof structured.message === "string" && typeof structured.status === "number" && typeof structured.code === "string") {
      return new OminityActionError(structured.message, structured.status, structured.code, structured.details);
    }
  }

  return new OminityActionError(
    error instanceof Error ? error.message : "The request could not be completed.",
    0,
    "REQUEST_FAILED",
  );
}
