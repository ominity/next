import { HTTPClient, type Fetcher } from "@ominity/api-typescript";

import { appendOminityDebugEntry } from "./store.js";
import type { OminityDebugSource } from "./types.js";

const DEFAULT_BODY_PREVIEW_LIMIT = 4000;
const DEFAULT_SENSITIVE_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "proxy-authorization",
] as const;

export interface OminityDebugFetcherOptions {
  readonly source: OminityDebugSource;
  readonly enabled?: boolean;
  readonly bodyPreviewLimit?: number;
  readonly sensitiveHeaders?: ReadonlyArray<string>;
}

export interface OminityDebugHttpClientOptions extends OminityDebugFetcherOptions {
  readonly cache?: boolean;
}

const fetcherCache = new Map<string, Fetcher>();
const httpClientCache = new Map<string, HTTPClient>();

function cacheKey(input: OminityDebugFetcherOptions): string {
  return [
    input.source,
    input.enabled === false ? "0" : "1",
    input.bodyPreviewLimit ?? DEFAULT_BODY_PREVIEW_LIMIT,
    (input.sensitiveHeaders ?? DEFAULT_SENSITIVE_HEADERS).join(","),
  ].join("|");
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeHeaderValue(
  headerName: string,
  headerValue: string,
  sensitiveHeaders: ReadonlySet<string>,
): string {
  return sensitiveHeaders.has(headerName.toLowerCase()) ? "[redacted]" : headerValue;
}

function headersToRecord(
  headers: Headers,
  sensitiveHeaders: ReadonlySet<string>,
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [name, value] of headers.entries()) {
    output[name] = sanitizeHeaderValue(name, value, sensitiveHeaders);
  }

  return output;
}

function previewBody(text: string, bodyPreviewLimit: number): string {
  if (text.length <= bodyPreviewLimit) {
    return text;
  }

  return `${text.slice(0, bodyPreviewLimit)} …(${text.length - bodyPreviewLimit} more chars)`;
}

function isBodyTextLike(contentType: string | null): boolean {
  if (typeof contentType !== "string" || contentType.length === 0) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return normalized.includes("json")
    || normalized.startsWith("text/")
    || normalized.includes("xml")
    || normalized.includes("x-www-form-urlencoded");
}

async function readRequestBody(
  request: Request,
  bodyPreviewLimit: number,
): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  if (!isBodyTextLike(request.headers.get("content-type"))) {
    return undefined;
  }

  try {
    const text = await request.text();
    return text.length > 0 ? previewBody(text, bodyPreviewLimit) : undefined;
  } catch {
    return undefined;
  }
}

async function readResponseBody(
  response: Response,
  bodyPreviewLimit: number,
): Promise<string | undefined> {
  if (!isBodyTextLike(response.headers.get("content-type"))) {
    return undefined;
  }

  try {
    const text = await response.text();
    return text.length > 0 ? previewBody(text, bodyPreviewLimit) : undefined;
  } catch {
    return undefined;
  }
}

function messageFromError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown request error";
}

function asRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request && typeof init === "undefined") {
    return input;
  }

  return new Request(input, init);
}

export function createOminityDebugFetcher(options: OminityDebugFetcherOptions): Fetcher | undefined {
  if (options.enabled === false) {
    return undefined;
  }

  const source = options.source;
  const bodyPreviewLimit = Number.isFinite(options.bodyPreviewLimit)
    && (options.bodyPreviewLimit ?? 0) > 0
    ? Math.floor(options.bodyPreviewLimit!)
    : DEFAULT_BODY_PREVIEW_LIMIT;
  const sensitiveHeaders = new Set(
    (options.sensitiveHeaders ?? DEFAULT_SENSITIVE_HEADERS).map((header) => header.toLowerCase()),
  );

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = asRequest(input, init);
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    const id = randomId();
    const requestHeaders = headersToRecord(request.headers, sensitiveHeaders);
    const requestBody = await readRequestBody(request.clone(), bodyPreviewLimit);
    const path = (() => {
      try {
        const parsed = new URL(request.url);
        return `${parsed.pathname}${parsed.search}`;
      } catch {
        return request.url;
      }
    })();

    try {
      const response = await fetch(request);
      const durationMs = Date.now() - started;

      appendOminityDebugEntry({
        id,
        source,
        startedAt,
        durationMs,
        method: request.method.toUpperCase(),
        url: request.url,
        path,
        ok: response.ok,
        status: response.status,
        requestHeaders,
        responseHeaders: headersToRecord(response.headers, sensitiveHeaders),
        ...(requestBody ? { requestBody } : {}),
        ...(await (async () => {
          const responseBody = await readResponseBody(response.clone(), bodyPreviewLimit);
          return responseBody ? { responseBody } : {};
        })()),
      });

      return response;
    } catch (error) {
      appendOminityDebugEntry({
        id,
        source,
        startedAt,
        durationMs: Date.now() - started,
        method: request.method.toUpperCase(),
        url: request.url,
        path,
        ok: false,
        requestHeaders,
        ...(requestBody ? { requestBody } : {}),
        error: messageFromError(error),
      });

      throw error;
    }
  };
}

export function getCachedOminityDebugFetcher(options: OminityDebugFetcherOptions): Fetcher | undefined {
  if (options.enabled === false) {
    return undefined;
  }

  const key = cacheKey(options);
  const cached = fetcherCache.get(key);
  if (cached) {
    return cached;
  }

  const created = createOminityDebugFetcher(options);
  if (!created) {
    return undefined;
  }

  fetcherCache.set(key, created);
  return created;
}

export function createOminityDebugHttpClient(
  options: OminityDebugHttpClientOptions,
): HTTPClient | undefined {
  const fetcher = createOminityDebugFetcher(options);
  if (!fetcher) {
    return undefined;
  }

  return new HTTPClient({ fetcher });
}

export function getCachedOminityDebugHttpClient(
  options: OminityDebugHttpClientOptions,
): HTTPClient | undefined {
  if (options.enabled === false) {
    return undefined;
  }

  const key = cacheKey(options);
  const cached = httpClientCache.get(key);
  if (cached) {
    return cached;
  }

  const created = createOminityDebugHttpClient(options);
  if (!created) {
    return undefined;
  }

  httpClientCache.set(key, created);
  return created;
}
