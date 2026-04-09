import { CmsRouteResolutionError } from "../errors.js";
import { normalizeLocaleCode } from "../locales/index.js";
import type { CmsRoute } from "../types.js";
import {
  createRoutingConfig,
  localePrefixSegments,
  matchLocaleFromSegments,
  type CmsRoutingConfig,
  type CmsRoutingConfigInput,
} from "./config.js";

export interface CmsRouteResolutionInput {
  readonly routes: ReadonlyArray<CmsRoute>;
  readonly incomingPath: string;
  readonly config: CmsRoutingConfig;
}

export interface CmsRouteResolution {
  readonly route: CmsRoute;
  readonly locale: string;
  readonly incomingPath: string;
  readonly matchedPath: string;
  readonly localizedPath: string;
  readonly canonicalPath: string;
  readonly shouldRedirect: boolean;
}

export interface CmsStaticParamsInput {
  readonly routes: ReadonlyArray<CmsRoute>;
  readonly config: CmsRoutingConfig;
  readonly catchAllParam?: string;
}

export type CmsStaticParam = Readonly<Record<string, ReadonlyArray<string>>>;

function normalizePath(path: string): string {
  if (path === "") {
    return "/";
  }

  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  if (withLeadingSlash === "/") {
    return "/";
  }

  return withLeadingSlash.replace(/\/+$/, "");
}

function splitPath(path: string): ReadonlyArray<string> {
  return normalizePath(path).split("/").filter((segment) => segment.length > 0);
}

function joinPath(segments: ReadonlyArray<string>): string {
  if (segments.length === 0) {
    return "/";
  }

  return `/${segments.join("/")}`;
}

function removeBasePath(path: string, basePath: string): string {
  if (basePath.length === 0 || basePath === "/") {
    return normalizePath(path);
  }

  const normalizedPath = normalizePath(path);
  const normalizedBasePath = normalizePath(basePath);

  if (normalizedPath === normalizedBasePath) {
    return "/";
  }

  if (normalizedPath.startsWith(`${normalizedBasePath}/`)) {
    return normalizePath(normalizedPath.slice(normalizedBasePath.length));
  }

  return normalizedPath;
}

function routePathsByLocale(route: CmsRoute): Readonly<Record<string, string>> {
  const entries: Array<[string, string]> = Object.entries(route.translations).map(([locale, path]) => [
    normalizeLocaleCode(locale),
    normalizePath(path),
  ]);

  entries.push([normalizeLocaleCode(route.locale), normalizePath(route.path)]);

  return Object.fromEntries(entries);
}

function canonicalLocalizedPath(route: CmsRoute, locale: string): string {
  const localizedPaths = routePathsByLocale(route);
  const normalizedLocale = normalizeLocaleCode(locale);

  return localizedPaths[normalizedLocale]
    ?? localizedPaths[normalizeLocaleCode(route.locale)]
    ?? normalizePath(route.path);
}

function fullVisiblePath(path: string, locale: string, config: CmsRoutingConfig): string {
  const routeSegments = splitPath(path);
  const prefixSegments = localePrefixSegments(locale, config);
  const combined = [...prefixSegments, ...routeSegments];
  const pathWithSegments = joinPath(combined);
  const withBasePath = config.basePath.length > 0
    ? normalizePath(`${config.basePath}${pathWithSegments === "/" ? "" : pathWithSegments}`)
    : pathWithSegments;

  if (config.trailingSlash && withBasePath !== "/") {
    return `${withBasePath}/`;
  }

  return withBasePath;
}

export function resolveCmsRoute(input: CmsRouteResolutionInput): CmsRouteResolution | null {
  const relativePath = removeBasePath(input.incomingPath, input.config.basePath);
  const segments = splitPath(relativePath);

  const matchedLocale = matchLocaleFromSegments(segments, input.config);
  if (!matchedLocale) {
    return null;
  }

  const routePath = joinPath(segments.slice(matchedLocale.consumedSegments));
  const normalizedRoutePath = normalizePath(routePath);
  const normalizedLocale = normalizeLocaleCode(matchedLocale.locale);

  for (const route of input.routes) {
    const localizedPaths = routePathsByLocale(route);
    const matchingLocalePath = Object.values(localizedPaths).find((path) => path === normalizedRoutePath);
    if (!matchingLocalePath) {
      continue;
    }

    const canonicalLocalized = canonicalLocalizedPath(route, normalizedLocale);
    const canonicalVisiblePath = fullVisiblePath(canonicalLocalized, normalizedLocale, input.config);
    const normalizedIncomingPath = normalizePath(input.incomingPath);

    return {
      route,
      locale: normalizedLocale,
      incomingPath: normalizedIncomingPath,
      matchedPath: normalizedRoutePath,
      localizedPath: canonicalLocalized,
      canonicalPath: canonicalVisiblePath,
      shouldRedirect: input.config.canonicalRedirectPolicy === "if-not-canonical"
        && normalizedIncomingPath !== normalizePath(canonicalVisiblePath),
    };
  }

  return null;
}

export function requireCmsRoute(input: CmsRouteResolutionInput): CmsRouteResolution {
  const resolved = resolveCmsRoute(input);
  if (!resolved) {
    throw new CmsRouteResolutionError("Unable to resolve CMS route", {
      details: {
        incomingPath: input.incomingPath,
      },
    });
  }

  return resolved;
}

export function routeCanonicalVisiblePath(route: CmsRoute, locale: string, config: CmsRoutingConfig): string {
  return fullVisiblePath(canonicalLocalizedPath(route, locale), locale, config);
}

export function generateStaticParams(input: CmsStaticParamsInput): ReadonlyArray<CmsStaticParam> {
  const catchAllParam = input.catchAllParam ?? "slug";
  const seen = new Set<string>();
  const result: CmsStaticParam[] = [];

  for (const route of input.routes) {
    const localizedPaths = routePathsByLocale(route);
    for (const locale of Object.keys(localizedPaths)) {
      const visiblePath = routeCanonicalVisiblePath(route, locale, input.config);
      if (seen.has(visiblePath)) {
        continue;
      }

      seen.add(visiblePath);
      result.push({
        [catchAllParam]: splitPath(visiblePath),
      });
    }
  }

  return result;
}

export function resolvePathFromParams(
  params: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
  catchAllParam = "slug",
): string {
  const value = params[catchAllParam];
  if (!value) {
    return "/";
  }

  if (typeof value === "string") {
    return normalizePath(value);
  }

  return joinPath(value);
}

export function createRouteResolver(config: CmsRoutingConfigInput) {
  const normalizedConfig = createRoutingConfig(config);

  return {
    config: normalizedConfig,
    resolve: (input: Omit<CmsRouteResolutionInput, "config">) => resolveCmsRoute({ ...input, config: normalizedConfig }),
    require: (input: Omit<CmsRouteResolutionInput, "config">) => requireCmsRoute({ ...input, config: normalizedConfig }),
    staticParams: (input: Omit<CmsStaticParamsInput, "config">) => generateStaticParams({ ...input, config: normalizedConfig }),
    canonicalPath: (route: CmsRoute, locale: string) => routeCanonicalVisiblePath(route, locale, normalizedConfig),
  };
}
