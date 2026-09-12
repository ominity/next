import type { CmsRoute, CmsRoutingConfig } from "../cms/index.js";
import { normalizeLocaleCode } from "../cms/locales/index.js";
import { routeCanonicalVisiblePath } from "../cms/routing/index.js";
import type { NextSitemapEntry } from "./types.js";

export interface BuildCmsSitemapInput {
  readonly routes: ReadonlyArray<CmsRoute>;
  readonly routing: CmsRoutingConfig;
  readonly baseUrl: string | URL;
  readonly includeAlternates?: boolean;
  readonly lastModified?: Date | string;
  /** Channel locales to emit. Route-derived locales are used as a fallback. */
  readonly locales?: ReadonlyArray<string | { readonly code: string }>;
}

function uniqueLocales(route: CmsRoute): ReadonlyArray<string> {
  const locales = new Set<string>();
  locales.add(normalizeLocaleCode(route.locale));

  for (const locale of Object.keys(route.translations)) {
    locales.add(normalizeLocaleCode(locale));
  }

  return Array.from(locales);
}

function toAbsoluteUrl(baseUrl: string | URL, path: string): string {
  return new URL(path, baseUrl).toString();
}

function requestedLocales(routes: ReadonlyArray<CmsRoute>, input: BuildCmsSitemapInput): ReadonlyArray<string> {
  if (input.locales && input.locales.length > 0) {
    return Array.from(new Set(input.locales.map((locale) => {
      return normalizeLocaleCode(typeof locale === "string" ? locale : locale.code);
    })));
  }

  return Array.from(new Set(routes.flatMap(uniqueLocales)));
}

function alternatesForRoutes(
  routes: ReadonlyArray<CmsRoute>,
  input: BuildCmsSitemapInput,
): Readonly<Record<string, string>> {
  const entries: Array<[string, string]> = [];
  const routeByLocale = new Map(routes.map((route) => [normalizeLocaleCode(route.locale), route]));
  const fallbackRoute = routes[0];
  if (!fallbackRoute) {
    return {};
  }

  for (const locale of requestedLocales(routes, input)) {
    const route = routeByLocale.get(locale) ?? fallbackRoute;
    const canonicalPath = routeCanonicalVisiblePath(route, locale, input.routing);
    entries.push([locale, toAbsoluteUrl(input.baseUrl, canonicalPath)]);
  }

  return Object.fromEntries(entries);
}

export function buildCmsSitemap(input: BuildCmsSitemapInput): ReadonlyArray<NextSitemapEntry> {
  const seen = new Set<string>();
  const entries: NextSitemapEntry[] = [];
  const groupedRoutes = new Map<string, CmsRoute[]>();

  for (const route of input.routes) {
    const key = route.pageId.length > 0 ? route.pageId : route.id;
    const group = groupedRoutes.get(key) ?? [];
    group.push(route);
    groupedRoutes.set(key, group);
  }

  for (const routes of groupedRoutes.values()) {
    const fallbackRoute = routes[0];
    if (!fallbackRoute) {
      continue;
    }
    const routeByLocale = new Map(routes.map((route) => [normalizeLocaleCode(route.locale), route]));
    const alternates = input.includeAlternates === false ? undefined : alternatesForRoutes(routes, input);

    for (const locale of requestedLocales(routes, input)) {
      const route = routeByLocale.get(locale) ?? fallbackRoute;
      const canonicalPath = routeCanonicalVisiblePath(route, locale, input.routing);
      const url = toAbsoluteUrl(input.baseUrl, canonicalPath);
      if (seen.has(url)) {
        continue;
      }

      seen.add(url);
      entries.push({
        url,
        ...(typeof input.lastModified !== "undefined" ? { lastModified: input.lastModified } : {}),
        ...(alternates ? { alternates: { languages: alternates } } : {}),
      });
    }
  }

  return entries;
}
