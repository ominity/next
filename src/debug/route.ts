import {
  clearOminityDebugEntries,
  countOminityDebugEntries,
  listOminityDebugEntries,
} from "./store.js";
import type { OminityDebugSource } from "./types.js";

export interface OminityDebugRouteOptions {
  readonly enabled: boolean;
  readonly defaultLimit?: number;
  readonly maxLimit?: number;
}

function toLimit(value: string | null, defaults: OminityDebugRouteOptions): number {
  const configuredDefault = defaults.defaultLimit ?? 120;
  const configuredMax = defaults.maxLimit ?? 300;
  if (typeof value !== "string") {
    return configuredDefault;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return configuredDefault;
  }

  return Math.min(Math.floor(parsed), configuredMax);
}

function toSource(value: string | null): OminityDebugSource | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized as OminityDebugSource : undefined;
}

export function buildOminityDebugGetResponse(
  request: Request,
  options: OminityDebugRouteOptions,
): Response {
  if (!options.enabled) {
    return Response.json({ error: "Debug bar disabled." }, { status: 404 });
  }

  const url = new URL(request.url);
  const source = toSource(url.searchParams.get("source"));
  const limit = toLimit(url.searchParams.get("limit"), options);
  const entries = listOminityDebugEntries(limit, source);

  return Response.json({
    enabled: true,
    source: source ?? "all",
    limit,
    total: countOminityDebugEntries(source),
    now: new Date().toISOString(),
    entries,
  });
}

export function buildOminityDebugDeleteResponse(options: OminityDebugRouteOptions): Response {
  if (!options.enabled) {
    return Response.json({ error: "Debug bar disabled." }, { status: 404 });
  }

  clearOminityDebugEntries();
  return Response.json({ ok: true });
}

export function createOminityDebugRouteHandlers(options: OminityDebugRouteOptions): {
  readonly GET: (request: Request) => Promise<Response>;
  readonly DELETE: () => Promise<Response>;
} {
  return {
    async GET(request: Request): Promise<Response> {
      return buildOminityDebugGetResponse(request, options);
    },
    async DELETE(): Promise<Response> {
      return buildOminityDebugDeleteResponse(options);
    },
  };
}
