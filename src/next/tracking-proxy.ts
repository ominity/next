import type { TrackEventRequest } from "./tracking-types.js";
import {
  resolveRequestClientIp,
  resolveRequestForwardedFor,
} from "../server/client-ip.js";

const DEFAULT_OMINITY_BASE_URL = "https://demo.ominity.com/api";

const TRACKING_DEBUG_IP_HEADER_NAMES = [
  "x-ominity-client-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "fastly-client-ip",
  "fly-client-ip",
  "x-vercel-forwarded-for",
  "x-client-ip",
  "x-nf-client-connection-ip",
  "x-real-ip",
  "forwarded",
  "x-forwarded-for",
] as const;

const TRACKING_DEBUG_CONTEXT_HEADER_NAMES = [
  "user-agent",
  "host",
  "origin",
  "referer",
] as const;

const TRACKING_DEBUG_HEADER_NAMES = [
  ...TRACKING_DEBUG_IP_HEADER_NAMES,
  ...TRACKING_DEBUG_CONTEXT_HEADER_NAMES,
] as const;

interface ForwardTrackingResult {
  status: number;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
}

export interface OminityTrackingProxyHandlerConfig {
  readonly ominityApiKey: string;
  readonly ominityBaseUrl?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly onBeforeForward?: (
    payload: TrackEventRequest,
    request: Request,
  ) => Promise<TrackEventRequest | void> | TrackEventRequest | void | undefined;
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
  ) => Promise<Response | ForwardTrackingResult | unknown> | undefined;
}

export interface TrackingProxyDebugSnapshot {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string | null>>;
  readonly ipCandidates: ReadonlyArray<string>;
  readonly resolvedClientIp: string | null;
  readonly resolvedForwardedFor: string | null;
}

export interface OminityTrackingProxyRouteHandlersConfig
  extends Omit<OminityTrackingProxyHandlerConfig, "ominityApiKey"> {
  readonly ominityApiKey?: string | undefined;
  readonly enabled?: boolean | undefined;
  readonly debug?: boolean | undefined;
  readonly logDebugSnapshots?: boolean | undefined;
  readonly disabledReason?:
    | string
    | ReadonlyArray<string>
    | (() => string | ReadonlyArray<string>)
    | undefined;
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

function normalizeIpCandidate(value: string): string | null {
  let normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("\"") && normalized.endsWith("\"")) {
    normalized = normalized.slice(1, -1).trim();
  }

  if (normalized.startsWith("for=")) {
    normalized = normalized.slice(4).trim();
  }

  if (normalized.startsWith("[") && normalized.includes("]")) {
    const closingBracketIndex = normalized.indexOf("]");
    normalized = normalized.slice(1, closingBracketIndex).trim();
  } else {
    const colonCount = (normalized.match(/:/g) ?? []).length;
    if (colonCount === 1 && normalized.includes(".")) {
      const [host] = normalized.split(":");
      normalized = host?.trim() ?? normalized;
    }
  }

  normalized = normalized.replace(/^::ffff:/i, "").trim();

  if (!normalized || normalized.toLowerCase() === "unknown") {
    return null;
  }

  return normalized;
}

function readHeaderCandidates(request: Request, headerName: string): string[] {
  const value = request.headers.get(headerName);
  if (!value) {
    return [];
  }

  if (headerName === "forwarded") {
    return value
      .split(",")
      .flatMap((entry) => entry.split(";"))
      .map((entry) => entry.trim())
      .filter((entry) => entry.toLowerCase().startsWith("for="))
      .map((entry) => normalizeIpCandidate(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  if (headerName === "x-forwarded-for") {
    return value
      .split(",")
      .map((entry) => normalizeIpCandidate(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  const normalized = normalizeIpCandidate(value);
  return normalized ? [normalized] : [];
}

function getClientIpCandidates(request: Request): string[] {
  return TRACKING_DEBUG_IP_HEADER_NAMES.flatMap((headerName) => readHeaderCandidates(request, headerName));
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

function trackingDisabledReason(
  input:
    | string
    | ReadonlyArray<string>
    | (() => string | ReadonlyArray<string>)
    | undefined,
): string {
  const value = typeof input === "function" ? input() : input;

  if (Array.isArray(value)) {
    const reasons = value
      .map((entry) => asNonEmptyString(entry))
      .filter((entry): entry is string => typeof entry === "string");

    return reasons.length > 0
      ? `Tracking is disabled: ${reasons.join(", ")}.`
      : "Tracking is disabled.";
  }

  return asNonEmptyString(value) ?? "Tracking is disabled.";
}

export function buildTrackingProxyDebugSnapshot(request: Request): TrackingProxyDebugSnapshot {
  const headers = Object.fromEntries(
    TRACKING_DEBUG_HEADER_NAMES.map((headerName) => [headerName, request.headers.get(headerName)]),
  );

  const ipCandidates = getClientIpCandidates(request);
  const resolvedClientIp = ipCandidates[0] ?? null;
  const forwarded = readHeaderCandidates(request, "x-forwarded-for");
  const forwardedValues = resolvedClientIp ? [resolvedClientIp, ...forwarded] : forwarded;
  const resolvedForwardedFor = forwardedValues.length > 0
    ? forwardedValues.filter((value, index) => forwardedValues.indexOf(value) === index).join(", ")
    : resolvedClientIp;

  return {
    method: request.method,
    url: request.url,
    headers,
    ipCandidates,
    resolvedClientIp,
    resolvedForwardedFor,
  };
}

export function withTrackingDebugHeaders(
  response: Response,
  snapshot: TrackingProxyDebugSnapshot,
): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Ominity-Tracking-Debug", "1");

  if (snapshot.resolvedClientIp) {
    headers.set("X-Ominity-Debug-Client-IP", snapshot.resolvedClientIp);
  }

  if (snapshot.resolvedForwardedFor) {
    headers.set("X-Ominity-Debug-Forwarded-For", snapshot.resolvedForwardedFor);
  }

  headers.set("X-Ominity-Debug-Candidate-Count", String(snapshot.ipCandidates.length));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

export function createOminityTrackingProxyRouteHandlers(
  config: OminityTrackingProxyRouteHandlersConfig,
): {
  readonly GET: (request: Request) => Promise<Response>;
  readonly POST: (request: Request) => Promise<Response>;
} {
  return {
    async GET(request: Request): Promise<Response> {
      if (config.debug !== true) {
        return new Response(JSON.stringify({ error: "Not Found" }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      }

      const snapshot = buildTrackingProxyDebugSnapshot(request);

      return new Response(JSON.stringify(snapshot, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    },
    async POST(request: Request): Promise<Response> {
      if (config.enabled === false) {
        return jsonResponse(
          {
            error: trackingDisabledReason(config.disabledReason),
          },
          503,
        );
      }

      const debugSnapshot = config.debug === true
        ? buildTrackingProxyDebugSnapshot(request)
        : null;

      if (debugSnapshot && config.logDebugSnapshots !== false) {
        console.info("[ominity tracking proxy debug]", JSON.stringify(debugSnapshot));
      }

      const handler = createOminityTrackingProxyHandler({
        ominityApiKey: config.ominityApiKey ?? "missing-api-key",
        ...(config.ominityBaseUrl ? { ominityBaseUrl: config.ominityBaseUrl } : {}),
        ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
        ...(config.onBeforeForward ? { onBeforeForward: config.onBeforeForward } : {}),
        ...(config.enrichEvent ? { enrichEvent: config.enrichEvent } : {}),
        ...(config.forwardEvent ? { forwardEvent: config.forwardEvent } : {}),
      });

      const response = await handler(request);
      return debugSnapshot ? withTrackingDebugHeaders(response, debugSnapshot) : response;
    },
  };
}
