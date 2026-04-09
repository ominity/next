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

function alternatesForRoute(route: CmsRoute, input: BuildCmsSitemapInput): Readonly<Record<string, string>> {
  const entries: Array<[string, string]> = [];
  for (const locale of uniqueLocales(route)) {
    const canonicalPath = routeCanonicalVisiblePath(route, locale, input.routing);
    entries.push([locale, toAbsoluteUrl(input.baseUrl, canonicalPath)]);
  }

  return Object.fromEntries(entries);
}

export function buildCmsSitemap(input: BuildCmsSitemapInput): ReadonlyArray<NextSitemapEntry> {
  const seen = new Set<string>();
  const entries: NextSitemapEntry[] = [];

  for (const route of input.routes) {
    const alternates = input.includeAlternates === false ? undefined : alternatesForRoute(route, input);

    for (const locale of uniqueLocales(route)) {
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
