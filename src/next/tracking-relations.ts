import type {
  TrackingEventMetadata,
  TrackingResourceRelation,
  TrackingResourceRoute,
} from "./tracking-types.js";

export type TrackingResourceRelationInput =
  | TrackingResourceRelation
  | Readonly<{
      resource?: unknown;
      id?: unknown;
      slug?: unknown;
      sku?: unknown;
      title?: unknown;
      type?: unknown;
      locale?: unknown;
      path?: unknown;
      canonicalPath?: unknown;
      url?: unknown;
      route?: unknown;
      routes?: unknown;
      metadata?: unknown;
    }>;

export interface BuildTrackingResourceRelationOptions {
  readonly locale?: string;
  readonly path?: string;
  readonly canonicalPath?: string;
  readonly url?: string;
  readonly route?: TrackingResourceRoute | Readonly<Record<string, unknown>> | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
}

export interface BuildTrackingPageMetadataOptions {
  readonly origin?: TrackingResourceRelationInput | null;
  readonly originOptions?: BuildTrackingResourceRelationOptions;
  readonly related?: ReadonlyArray<TrackingResourceRelationInput | null | undefined>;
  readonly metadata?: TrackingEventMetadata | null;
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

function asStringOrNumber(value: unknown): string | number | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return;
}

function normalizeRouteParameters(value: unknown): Readonly<Record<string, string | number>> | undefined {
  const record = asRecord(value);
  const normalized = Object.fromEntries(
    Object.entries(record)
      .map(([key, entry]) => [key, asStringOrNumber(entry)])
      .filter((entry): entry is [string, string | number] => typeof entry[1] === "string" || typeof entry[1] === "number"),
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function buildTrackingResourceRoute(
  input: TrackingResourceRoute | Readonly<Record<string, unknown>> | null | undefined,
  fallbackLocale?: string,
): TrackingResourceRoute | null {
  if (!input) {
    return null;
  }

  const record = asRecord(input);
  const name = asNonEmptyString(record.name);
  if (!name) {
    return null;
  }

  const locale = asNonEmptyString(record.locale) ?? fallbackLocale;
  const parameters = normalizeRouteParameters(record.parameters);

  return {
    resource: asNonEmptyString(record.resource) ?? "route",
    name,
    ...(locale ? { locale } : {}),
    ...(parameters ? { parameters } : {}),
  };
}

function resolveImplicitRoute(
  record: Record<string, unknown>,
  locale: string | undefined,
): TrackingResourceRoute | null {
  const explicitRoute = buildTrackingResourceRoute(record.route as Record<string, unknown> | undefined, locale);
  if (explicitRoute) {
    return explicitRoute;
  }

  const routes = asRecord(record.routes);
  const preferredRoute = (locale ? routes[locale] : undefined) ?? Object.values(routes)[0];
  return buildTrackingResourceRoute(preferredRoute as Record<string, unknown> | undefined, locale);
}

function normalizeMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }

  return;
}

export function buildTrackingResourceRelation(
  input: TrackingResourceRelationInput | null | undefined,
  options: BuildTrackingResourceRelationOptions = {},
): TrackingResourceRelation | null {
  if (!input) {
    return null;
  }

  const record = asRecord(input);
  const resource = asNonEmptyString(record.resource);
  if (!resource) {
    return null;
  }

  const locale = asNonEmptyString(options.locale) ?? asNonEmptyString(record.locale);
  const route = buildTrackingResourceRoute(options.route ?? null, locale)
    ?? resolveImplicitRoute(record, locale);
  const metadata = normalizeMetadata(options.metadata ?? record.metadata);

  return {
    resource,
    ...(asStringOrNumber(record.id) !== undefined ? { id: asStringOrNumber(record.id)! } : {}),
    ...(locale ? { locale } : {}),
    ...(asNonEmptyString(record.slug) ? { slug: asNonEmptyString(record.slug)! } : {}),
    ...(asNonEmptyString(record.sku) ? { sku: asNonEmptyString(record.sku)! } : {}),
    ...(asNonEmptyString(record.title) ? { title: asNonEmptyString(record.title)! } : {}),
    ...(asNonEmptyString(record.type) ? { type: asNonEmptyString(record.type)! } : {}),
    ...(asNonEmptyString(options.path) ?? asNonEmptyString(record.path)
      ? { path: (asNonEmptyString(options.path) ?? asNonEmptyString(record.path))! }
      : {}),
    ...(asNonEmptyString(options.canonicalPath) ?? asNonEmptyString(record.canonicalPath)
      ? { canonicalPath: (asNonEmptyString(options.canonicalPath) ?? asNonEmptyString(record.canonicalPath))! }
      : {}),
    ...(asNonEmptyString(options.url) ?? asNonEmptyString(record.url)
      ? { url: (asNonEmptyString(options.url) ?? asNonEmptyString(record.url))! }
      : {}),
    ...(route ? { route } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export function buildTrackingPageMetadata(
  input: BuildTrackingPageMetadataOptions,
): TrackingEventMetadata | undefined {
  const origin = buildTrackingResourceRelation(input.origin, input.originOptions);
  const related = (input.related ?? [])
    .map((entry) => buildTrackingResourceRelation(entry))
    .filter((entry): entry is TrackingResourceRelation => entry !== null);
  const metadata = normalizeMetadata(input.metadata);

  const result = {
    ...(metadata ?? {}),
    ...(origin ? { origin_resource: origin } : {}),
    ...(related.length > 0 ? { related_resources: related } : {}),
  };

  return Object.keys(result).length > 0 ? result : undefined;
}
