import {
  readOminityAuthSession,
  type OminityAuthRouteHandlerConfig,
} from "../../auth/server/route-handlers.js";
import { resolveRequestForwardedFor } from "../../server/client-ip.js";
import {
  asNonEmptyString,
  createRequestLanguageResolver,
} from "../../server/route-utils.js";
import { DEFAULT_OMINITY_SDK_GATEWAY_PATH } from "../client.js";

const DEFAULT_OMINITY_BASE_URL = "https://demo.ominity.com/api";
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_MEMBERSHIP_CACHE_SECONDS = 60;
const MAX_MEMBERSHIP_CACHE_ENTRIES = 1000;
const ERROR_DOCUMENTATION_URL = "https://docs.ominity.com/overview/handling-errors";
const RESPONSE_HEADERS = ["content-type", "content-disposition", "deprecation", "sunset", "retry-after"] as const;
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

export type OminitySdkGatewayMethod = typeof METHODS[number];

/**
 * A route the browser may call through the gateway. `path` is matched against the path after the API version:
 * `{self}` is the signed-in user's id, `{customer}` a customer the signed-in user belongs to, `*` one segment and
 * `**` one or more segments.
 */
export interface OminitySdkGatewayRule {
  readonly path: string;
  /** Defaults to every method. */
  readonly methods?: ReadonlyArray<OminitySdkGatewayMethod>;
  /**
   * `user` (default): only for a signed-in user, sent with the user's own access token.
   * `public`: also for anonymous visitors, sent with the server API key when nobody is signed in. Only use it for
   * data any visitor may see; rules with `{self}` or `{customer}` always require a signed-in user.
   */
  readonly access?: "user" | "public";
}

export interface OminitySdkGatewaySession {
  readonly accessToken: string;
  readonly userId?: number | undefined;
}

export interface OminitySdkGatewayConfig extends OminityAuthRouteHandlerConfig {
  /** Where the gateway route is mounted. Defaults to `/api/ominity`. */
  readonly basePath?: string | undefined;
  /** Routes the browser may call. Defaults to `OMINITY_SDK_GATEWAY_DEFAULT_RULES`; spread those to extend them. */
  readonly rules?: ReadonlyArray<OminitySdkGatewayRule> | undefined;
  /** Routes that are always refused, checked before `rules`. Defaults to `OMINITY_SDK_GATEWAY_DEFAULT_DENY_RULES`. */
  readonly denyRules?: ReadonlyArray<OminitySdkGatewayRule> | undefined;
  /** Largest request body forwarded, in bytes. Defaults to 1 MiB. */
  readonly maxBodyBytes?: number | undefined;
  /** How long a confirmed customer membership is remembered, in seconds. Defaults to 60; 0 disables caching. */
  readonly membershipCacheSeconds?: number | undefined;
  /** Replaces reading the encrypted auth session cookie, e.g. for a custom auth setup. */
  readonly resolveSession?: ((request: Request) => Promise<OminitySdkGatewaySession | null>) | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

export type OminitySdkGatewayRouteHandlers = Readonly<
  Record<OminitySdkGatewayMethod, (request: Request) => Promise<Response>>
>;

/**
 * The signed-in user's own account and the customers they belong to. The Ominity API checks the user's customer
 * permissions on every customer route; the gateway additionally confirms the membership itself.
 */
export const OMINITY_SDK_GATEWAY_DEFAULT_RULES: ReadonlyArray<OminitySdkGatewayRule> = [
  { path: "me", methods: ["GET"] },
  { path: "users/{self}", methods: ["GET", "PATCH"] },
  { path: "users/{self}/**" },
  { path: "commerce/customers/{customer}", methods: ["GET", "PATCH"] },
  { path: "commerce/customers/{customer}/**" },
  { path: "commerce/customers/users/permissions", methods: ["GET"] },
  { path: "commerce/customers/users/roles", methods: ["GET"] },
  { path: "commerce/customers/users/roles/*", methods: ["GET"] },
];

/** Admin-only routes below otherwise allowed paths. */
export const OMINITY_SDK_GATEWAY_DEFAULT_DENY_RULES: ReadonlyArray<OminitySdkGatewayRule> = [
  { path: "users/{self}/token" },
];

interface CompiledRule {
  readonly segments: ReadonlyArray<string>;
  readonly methods: ReadonlySet<string>;
  readonly access: "user" | "public";
  readonly scoped: boolean;
}

interface RuleMatch {
  readonly rule: CompiledRule;
  readonly self: ReadonlyArray<string>;
  readonly customers: ReadonlyArray<string>;
}

function compileRule(rule: OminitySdkGatewayRule): CompiledRule {
  const segments = rule.path.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new TypeError("An Ominity SDK gateway rule needs a path.");
  }
  if (segments.slice(0, -1).includes("**")) {
    throw new TypeError(`"**" can only end an Ominity SDK gateway rule: ${rule.path}`);
  }

  return {
    segments,
    methods: new Set(rule.methods ?? METHODS),
    access: rule.access ?? "user",
    scoped: segments.includes("{self}") || segments.includes("{customer}"),
  };
}

function matchRule(rule: CompiledRule, method: string, path: ReadonlyArray<string>): RuleMatch | null {
  if (!rule.methods.has(method)) return null;

  const self: string[] = [];
  const customers: string[] = [];
  for (const [index, pattern] of rule.segments.entries()) {
    if (pattern === "**") {
      return path.length > index ? { rule, self, customers } : null;
    }
    const segment = path[index];
    if (segment === undefined) return null;
    if (pattern === "{self}") self.push(segment);
    else if (pattern === "{customer}") {
      if (!/^[1-9]\d*$/.test(segment)) return null;
      customers.push(segment);
    } else if (pattern !== "*" && pattern !== segment) return null;
  }

  return path.length === rule.segments.length ? { rule, self, customers } : null;
}

function findMatch(rules: ReadonlyArray<CompiledRule>, method: string, path: ReadonlyArray<string>): RuleMatch | null {
  for (const rule of rules) {
    const match = matchRule(rule, method, path);
    if (match) return match;
  }
  return null;
}

function normalizedBasePath(value: string | undefined): string {
  const path = (value ?? DEFAULT_OMINITY_SDK_GATEWAY_PATH).trim();
  if (!path.startsWith("/")) {
    throw new TypeError("Ominity SDK gateway basePath must start with a slash.");
  }

  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** Segments after the base path, decoded; null when the path is not a plain API path. */
function routeSegments(pathname: string, basePath: string): string[] | null {
  if (!pathname.startsWith(`${basePath}/`)) return null;

  try {
    const segments = pathname.slice(basePath.length + 1).split("/").map(decodeURIComponent);
    const unsafe = segments.some((segment) => segment.length === 0
      || segment === "."
      || segment === ".."
      || /[/\\]/.test(segment)
      || Array.from(segment).some((character) => character.charCodeAt(0) < 0x20));
    return unsafe ? null : segments;
  } catch {
    return null;
  }
}

/** Errors in the Ominity API's own shape, so the SDK raises them as `ErrorResponse`. */
function gatewayError(status: number, code: string, detail: string): Response {
  return new Response(JSON.stringify({
    status,
    title: status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : status === 404 ? "Not Found" : status === 413 ? "Payload Too Large" : "Bad Gateway",
    detail,
    code,
    _links: { documentation: { href: ERROR_DOCUMENTATION_URL, type: "text/html" } },
  }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function crossSiteRequest(config: OminitySdkGatewayConfig, request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = asNonEmptyString(request.headers.get("origin"));
  if (!origin) return false;
  const expected = asNonEmptyString(config.siteUrl)
    ? new URL(config.siteUrl as string).origin
    : new URL(request.url).origin;
  return origin !== expected;
}

async function fingerprint(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Route handlers that let the browser use `@ominity/api-typescript` as is (see `createOminityBrowserSdk`). Each
 * request is checked against the allowed routes and sent to Ominity with the signed-in user's access token from the
 * encrypted session. The server API key is never sent to the browser and is only used for `public` rules.
 *
 * ```ts
 * // app/api/ominity/[...path]/route.ts
 * export const { GET, POST, PATCH, PUT, DELETE } = createOminitySdkGatewayRouteHandlers(config);
 * ```
 */
export function createOminitySdkGatewayRouteHandlers(
  config: OminitySdkGatewayConfig,
): OminitySdkGatewayRouteHandlers {
  const basePath = normalizedBasePath(config.basePath);
  const upstreamBase = (config.ominityBaseUrl ?? DEFAULT_OMINITY_BASE_URL).replace(/\/+$/, "");
  const rules = (config.rules ?? OMINITY_SDK_GATEWAY_DEFAULT_RULES).map(compileRule);
  const denyRules = (config.denyRules ?? OMINITY_SDK_GATEWAY_DEFAULT_DENY_RULES).map(compileRule);
  const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const membershipTtl = (config.membershipCacheSeconds ?? DEFAULT_MEMBERSHIP_CACHE_SECONDS) * 1000;
  const memberships = new Map<string, number>();
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);
  const channelId = asNonEmptyString(config.channelId);
  const apiKey = asNonEmptyString(config.ominityApiKey);
  const resolveSession = config.resolveSession ?? (async () => readOminityAuthSession(config));
  const fetchUpstream = (input: string, init: RequestInit) => (config.fetchImpl ?? globalThis.fetch)(input, init);

  function upstreamHeaders(authorization: string, language: string | undefined): Headers {
    const headers = new Headers({ Accept: "application/hal+json", Authorization: `Bearer ${authorization}` });
    if (language) headers.set("Accept-Language", language);
    if (channelId) headers.set("X-Channel-Id", channelId);
    return headers;
  }

  async function isMember(session: OminitySdkGatewaySession, customerId: string, language: string | undefined): Promise<boolean> {
    if (typeof session.userId !== "number") return false;

    const key = `${await fingerprint(session.accessToken)}:${customerId}`;
    const now = Date.now();
    if ((memberships.get(key) ?? 0) > now) return true;

    const response = await fetchUpstream(
      `${upstreamBase}/v1/users/${session.userId}/customers/${customerId}`,
      { method: "GET", headers: upstreamHeaders(session.accessToken, language), redirect: "manual" },
    );
    await response.body?.cancel();
    if (response.status === 403 || response.status === 404) return false;
    if (!response.ok) throw new Error(`Customer membership check failed with status ${response.status}.`);

    if (membershipTtl > 0) {
      if (memberships.size >= MAX_MEMBERSHIP_CACHE_ENTRIES) {
        for (const [entry, expiresAt] of memberships) {
          if (expiresAt <= now) memberships.delete(entry);
        }
        if (memberships.size >= MAX_MEMBERSHIP_CACHE_ENTRIES) memberships.clear();
      }
      memberships.set(key, now + membershipTtl);
    }
    return true;
  }

  async function handle(request: Request): Promise<Response> {
    const method = request.method.toUpperCase();
    const url = new URL(request.url);
    const segments = routeSegments(url.pathname, basePath);
    const [version, ...path] = segments ?? [];
    if (!segments || !version || !/^v\d+$/.test(version) || path.length === 0) {
      return gatewayError(404, "NOT_FOUND", "This Ominity API route is not available.");
    }

    if (method !== "GET" && crossSiteRequest(config, request)) {
      return gatewayError(403, "INVALID_ORIGIN", "This request must come from the same site.");
    }

    const match = findMatch(rules, method, path);
    if (!match || findMatch(denyRules, method, path)) {
      return gatewayError(403, "ROUTE_NOT_ALLOWED", "This Ominity API route is not available from the browser.");
    }

    const session = await resolveSession(request);
    const language = await getLanguage(request);
    let authorization: string;
    if (session) {
      if (match.self.some((id) => typeof session.userId !== "number" || id !== String(session.userId))) {
        return gatewayError(403, "USER_ACCESS_DENIED", "This route is only available for your own account.");
      }
      try {
        for (const customerId of match.customers) {
          if (!await isMember(session, customerId, language)) {
            return gatewayError(403, "CUSTOMER_ACCESS_DENIED", "You do not have access to this customer account.");
          }
        }
      } catch {
        return gatewayError(502, "BAD_GATEWAY", "The Ominity API could not be reached.");
      }
      authorization = session.accessToken;
    } else if (match.rule.access === "public" && !match.rule.scoped && apiKey) {
      authorization = apiKey;
    } else {
      return gatewayError(401, "UNAUTHENTICATED", "You must be signed in.");
    }

    let body: ArrayBuffer | undefined;
    if (method !== "GET") {
      if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) {
        return gatewayError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
      }
      body = await request.arrayBuffer();
      if (body.byteLength > maxBodyBytes) {
        return gatewayError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
      }
      if (body.byteLength === 0) body = undefined;
    }

    const headers = upstreamHeaders(authorization, language);
    const accept = asNonEmptyString(request.headers.get("accept"));
    if (accept) headers.set("Accept", accept);
    const contentType = asNonEmptyString(request.headers.get("content-type"));
    if (body && contentType) headers.set("Content-Type", contentType);
    const idempotencyKey = asNonEmptyString(request.headers.get("idempotency-key"));
    if (idempotencyKey && idempotencyKey.length <= 255) headers.set("Idempotency-Key", idempotencyKey);
    const forwardedFor = resolveRequestForwardedFor(request);
    if (forwardedFor) headers.set("X-Forwarded-For", forwardedFor);

    let upstream: Response;
    try {
      upstream = await fetchUpstream(
        `${upstreamBase}/${[version, ...path].map(encodeURIComponent).join("/")}${url.search}`,
        { method, headers, ...(body ? { body } : {}), redirect: "manual", signal: request.signal },
      );
    } catch {
      return gatewayError(502, "BAD_GATEWAY", "The Ominity API could not be reached.");
    }

    const responseHeaders = new Headers({ "Cache-Control": "private, no-store" });
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    const empty = upstream.status === 204 || upstream.status === 205 || upstream.status === 304;
    return new Response(empty ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
  }

  return {
    GET: handle,
    POST: handle,
    PATCH: handle,
    PUT: handle,
    DELETE: handle,
  };
}
