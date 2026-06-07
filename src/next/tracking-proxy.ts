import type { TrackEventRequest } from "./tracking-types.js";

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

function isPublicIpv4(ip: string): boolean {
  const octets = ip.split(".").map((value) => Number.parseInt(value, 10));
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }

  const first = octets[0];
  const second = octets[1];

  if (typeof first !== "number" || typeof second !== "number") {
    return false;
  }

  if (first === 10 || first === 127 || first === 0) {
    return false;
  }

  if (first === 169 && second === 254) {
    return false;
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return false;
  }

  if (first === 192 && second === 168) {
    return false;
  }

  if (first >= 224) {
    return false;
  }

  return true;
}

function isPublicIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::1" || normalized === "::") {
    return false;
  }

  const first = normalized[0];
  const second = normalized[1];
  const third = normalized[2];

  if (first === "f" && (second === "c" || second === "d")) {
    return false;
  }

  if (first === "f" && second === "e" && typeof third === "string" && ["8", "9", "a", "b"].includes(third)) {
    return false;
  }

  return true;
}

function isPublicIp(ip: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    return isPublicIpv4(ip);
  }

  if (ip.includes(":")) {
    return isPublicIpv6(ip);
  }

  return false;
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
  const headerNames = [
    "x-ominity-client-ip",
    "x-vercel-forwarded-for",
    "cf-connecting-ip",
    "true-client-ip",
    "fastly-client-ip",
    "fly-client-ip",
    "x-client-ip",
    "x-nf-client-connection-ip",
    "x-real-ip",
    "forwarded",
    "x-forwarded-for",
  ];

  return headerNames.flatMap((headerName) => readHeaderCandidates(request, headerName));
}

function getClientIp(request: Request): string | null {
  const candidates = getClientIpCandidates(request);

  for (const candidate of candidates) {
    if (isPublicIp(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? null;
}

function getForwardedForChain(request: Request, clientIp: string | null): string | null {
  const forwarded = readHeaderCandidates(request, "x-forwarded-for");
  const values = clientIp ? [clientIp, ...forwarded] : forwarded;
  const unique = values.filter((value, index) => values.indexOf(value) === index);
  if (unique.length > 0) {
    return unique.join(", ");
  }

  return clientIp;
}

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

      const clientIp = getClientIp(request);
      const forwardedFor = getForwardedForChain(request, clientIp);
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
