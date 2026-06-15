import type { TrackEventRequest } from "./tracking-types.js";
import {
  resolveRequestClientIp,
  resolveRequestForwardedFor,
} from "../server/client-ip.js";

const DEFAULT_OMINITY_BASE_URL = "https://demo.ominity.com/api";

interface ForwardTrackingResult {
  status: number;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
}

export interface OminityTrackingProxyHandlerConfig {
  readonly ominityApiKey: string;
  readonly ominityBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly onBeforeForward?: (
    payload: TrackEventRequest,
    request: Request,
  ) => Promise<TrackEventRequest | void> | TrackEventRequest | void;
  readonly enrichEvent?: (
    input: { request: Request; payload: TrackEventRequest },
  ) => Promise<Readonly<Record<string, unknown>> | null | undefined>
    | Readonly<Record<string, unknown>>
    | null
    | undefined;
  readonly forwardEvent?: (
    input: {
      payload: TrackEventRequest;
      request: Request;
      baseUrl: string;
      ominityApiKey: string;
      fetchImpl: typeof fetch;
    },
  ) => Promise<Response | ForwardTrackingResult | unknown>;
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const isForwardTrackingResult = (input: unknown): input is ForwardTrackingResult => {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  return "status" in input && typeof (input as { status?: unknown }).status === "number";
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mergeMetadata(
  payload: TrackEventRequest,
  extraMetadata: Readonly<Record<string, unknown>> | null | undefined,
): TrackEventRequest {
  if (!extraMetadata || Object.keys(extraMetadata).length === 0) {
    return payload;
  }

  const metadata = asRecord(payload.metadata);

  return {
    ...payload,
    metadata: {
      ...metadata,
      ...extraMetadata,
    },
  };
}

function normalizePayload(input: unknown): TrackEventRequest | null {
  const record = asRecord(input);
  const event = asNonEmptyString(record["event"]);
  if (!event) {
    return null;
  }

  const timestamp = record["timestamp"];
  const title = asNonEmptyString(record["title"]);
  const url = asNonEmptyString(record["url"]);
  const userId = typeof record["userId"] === "number" && Number.isFinite(record["userId"])
    ? Math.trunc(record["userId"])
    : undefined;
  const visitorId = asNonEmptyString(record["visitorId"]);
  const referrer = asNonEmptyString(record["referrer"]);
  const metadata = record["metadata"];
  const normalizedMetadata =
    typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
      ? metadata as Readonly<Record<string, unknown>>
      : undefined;
  const utm = record["utm"];
  const normalizedUtm =
    typeof utm === "object" && utm !== null && !Array.isArray(utm)
      ? Object.fromEntries(
        Object.entries(utm as Record<string, unknown>)
          .map(([key, value]) => [key, asNonEmptyString(value)])
          .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
      : undefined;

  return {
    event,
    ...((typeof timestamp === "string" || timestamp instanceof Date) ? { timestamp } : {}),
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
    ...(typeof userId === "number" ? { userId } : {}),
    ...(visitorId ? { visitorId } : {}),
    ...(referrer ? { referrer } : {}),
    ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
    ...(normalizedUtm && Object.keys(normalizedUtm).length > 0 ? { utm: normalizedUtm } : {}),
  };
}

export function createOminityTrackingProxyHandler(
  config: OminityTrackingProxyHandlerConfig,
) {
  const fetchImpl = config.fetchImpl ?? fetch;
  if (!fetchImpl) {
    throw new Error("Fetch implementation is required for tracking proxy handler.");
  }

  const baseUrl = (config.ominityBaseUrl ?? DEFAULT_OMINITY_BASE_URL).replace(/\/$/, "");

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method Not Allowed" }, 405);
    }

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(await request.text());
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    let payload = normalizePayload(rawPayload);
    if (!payload) {
      return jsonResponse({ error: "Invalid tracking payload." }, 400);
    }

    if (config.onBeforeForward) {
      const maybeUpdated = await config.onBeforeForward(payload, request);
      if (maybeUpdated) {
        payload = maybeUpdated;
      }
    }

    if (config.enrichEvent) {
      payload = mergeMetadata(payload, await config.enrichEvent({ request, payload }));
    }

    try {
      if (config.forwardEvent) {
        const forwarded = await config.forwardEvent({
          payload,
          request,
          baseUrl,
          ominityApiKey: config.ominityApiKey,
          fetchImpl,
        });

        if (forwarded instanceof Response) {
          return forwarded;
        }

        if (isForwardTrackingResult(forwarded)) {
          return new Response(JSON.stringify(forwarded.body ?? {}), {
            status: forwarded.status,
            headers: {
              "Content-Type": "application/json",
              ...(forwarded.headers ?? {}),
            },
          });
        }

        return jsonResponse(forwarded ?? {});
      }

      const headers = new Headers({
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ominityApiKey}`,
      });

      const requestId = request.headers.get("x-request-id");
      if (requestId) {
        headers.set("X-Request-Id", requestId);
      }

      const userAgent = request.headers.get("user-agent");
      if (userAgent) {
        headers.set("User-Agent", userAgent);
      }

      const clientIp = resolveRequestClientIp(request);
      const forwardedFor = resolveRequestForwardedFor(request);
      if (forwardedFor) {
        headers.set("X-Forwarded-For", forwardedFor);
      }

      if (clientIp) {
        headers.set("X-Real-IP", clientIp);
        headers.set("X-Ominity-Client-IP", clientIp);
      }

      const ominityResponse = await fetchImpl(`${baseUrl}/v1/tracking/events`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const responseBody = await ominityResponse.text();
      return new Response(responseBody || "{}", {
        status: ominityResponse.status,
        headers: {
          "Content-Type":
            ominityResponse.headers.get("content-type") ?? "application/json",
        },
      });
    } catch (error) {
      return jsonResponse(
        { error: "Failed to forward tracking event to Ominity.", details: `${error}` },
        500,
      );
    }
  };
}
