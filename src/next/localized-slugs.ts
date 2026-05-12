import type { CmsLocale, CmsRoutingConfig } from "../cms/index.js";
import { CmsRouteResolutionError } from "../cms/errors.js";
import { normalizeLocaleCode, parseLocaleCode } from "../cms/locales/index.js";
import { createCmsLinkResolver } from "../cms/routing/index.js";
import type { NextMetadata } from "./types.js";

export type LocalizedSlugMap = Readonly<Record<string, string>>;

export type LocaleOrCode = CmsLocale | string;

export interface ResolveLocalizedSlugInput {
  readonly slugByLocale: LocalizedSlugMap;
  readonly locale: string;
  readonly locales?: ReadonlyArray<LocaleOrCode>;
  readonly defaultLocale?: string;
}

export interface BuildLocalizedStaticPathInput extends ResolveLocalizedSlugInput {
  readonly routing: CmsRoutingConfig;
  readonly prefixPath?: string;
}

export interface BuildLocalizedSlugAlternatesInput extends BuildLocalizedStaticPathInput {
  readonly baseUrl?: string | URL;
  readonly localeToHrefLang?: (locale: string) => string;
}

export interface LocalizedSlugAlternatesResult {
  readonly canonicalPath: string;
  readonly alternates: NonNullable<NextMetadata["alternates"]>;
}

function normalizePath(path: string): string {
  if (path.length === 0) {
    return "/";
  }

  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  if (withLeadingSlash === "/") {
    return "/";
  }

  return withLeadingSlash.replace(/\/+$/, "");
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function toAbsoluteUrl(baseUrl: string | URL | undefined, path: string): string {
  if (!baseUrl) {
    return path;
  }

  return new URL(path, baseUrl).toString();
}

function localeCode(value: LocaleOrCode): string {
  return normalizeLocaleCode(typeof value === "string" ? value : value.code);
}

function localeCodes(locales: ReadonlyArray<LocaleOrCode> | undefined): ReadonlyArray<string> {
  if (!locales || locales.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const locale of locales) {
    const code = localeCode(locale);
    if (seen.has(code)) {
      continue;
    }

    seen.add(code);
    result.push(code);
  }

  return result;
}

function normalizeSlugByLocaleMap(input: LocalizedSlugMap): Readonly<Record<string, string>> {
  const entries: Array<[string, string]> = [];

  for (const [rawLocale, rawSlug] of Object.entries(input)) {
    if (typeof rawSlug !== "string") {
      continue;
    }

    const normalizedLocale = normalizeLocaleCode(rawLocale);
    entries.push([normalizedLocale, normalizeSlug(rawSlug)]);
  }

  return Object.fromEntries(entries);
}

function uniqueOrdered(values: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (value.length === 0 || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function localeCandidates(
  locale: string,
  locales: ReadonlyArray<string>,
  defaultLocale: string | undefined,
): ReadonlyArray<string> {
  const normalizedLocale = normalizeLocaleCode(locale);
  const localeLanguage = parseLocaleCode(normalizedLocale).language;
  const defaultCode = defaultLocale ? normalizeLocaleCode(defaultLocale) : undefined;
  const defaultLanguage = defaultCode ? parseLocaleCode(defaultCode).language : undefined;

  const sameLanguageLocales = locales.filter((candidate) => {
    return parseLocaleCode(candidate).language === localeLanguage;
  });

  return uniqueOrdered([
    normalizedLocale,
    localeLanguage,
    ...sameLanguageLocales,
    ...(defaultCode ? [defaultCode] : []),
    ...(defaultLanguage ? [defaultLanguage] : []),
  ]);
}

function resolveSlugFromCandidates(
  slugByLocale: Readonly<Record<string, string>>,
  candidates: ReadonlyArray<string>,
): string | null {
  for (const candidate of candidates) {
    const exact = slugByLocale[candidate];
    if (typeof exact === "string") {
      return exact;
    }
  }

  return null;
}

function joinPrefixAndSlug(prefixPath: string | undefined, slug: string): string {
  const normalizedPrefix = normalizePath(prefixPath ?? "/");
  if (slug.length === 0) {
    return normalizedPrefix;
  }

  if (normalizedPrefix === "/") {
    return normalizePath(`/${slug}`);
  }

  return normalizePath(`${normalizedPrefix}/${slug}`);
}

export function resolveLocalizedSlug(input: ResolveLocalizedSlugInput): string {
  const normalizedSlugByLocale = normalizeSlugByLocaleMap(input.slugByLocale);
  const configuredLocales = localeCodes(input.locales);
  const fallbackLocale = input.defaultLocale;
  const candidates = localeCandidates(input.locale, configuredLocales, fallbackLocale);
  const resolved = resolveSlugFromCandidates(normalizedSlugByLocale, candidates);

  if (resolved !== null) {
    return resolved;
  }

  const firstConfigured = Object.values(normalizedSlugByLocale)[0];
  if (typeof firstConfigured === "string") {
    return firstConfigured;
  }

  throw new CmsRouteResolutionError("Unable to resolve localized slug", {
    details: {
      locale: input.locale,
      availableLocales: configuredLocales,
      defaultLocale: fallbackLocale,
      slugLocales: Object.keys(normalizedSlugByLocale),
    },
  });
}

export function buildLocalizedStaticPath(input: BuildLocalizedStaticPathInput): string {
  const normalizedLocale = normalizeLocaleCode(input.locale);
  const slug = resolveLocalizedSlug({
    slugByLocale: input.slugByLocale,
    locale: normalizedLocale,
    locales: input.locales ?? input.routing.locales,
    defaultLocale: input.defaultLocale ?? input.routing.defaultLocale,
  });
  const relativePath = joinPrefixAndSlug(input.prefixPath, slug);
  const resolver = createCmsLinkResolver({
    config: input.routing,
    stringLinkStrategy: "localize-relative",
  });

  return resolver.resolve(relativePath, { locale: normalizedLocale }).href;
}

export function buildLocalizedSlugAlternates(input: BuildLocalizedSlugAlternatesInput): LocalizedSlugAlternatesResult {
  const locales = localeCodes(input.locales ?? input.routing.locales);
  const languages: Record<string, string> = {};

  for (const locale of locales) {
    const path = buildLocalizedStaticPath({
      slugByLocale: input.slugByLocale,
      locale,
      routing: input.routing,
      locales: input.locales ?? input.routing.locales,
      defaultLocale: input.defaultLocale ?? input.routing.defaultLocale,
      ...(typeof input.prefixPath === "string" ? { prefixPath: input.prefixPath } : {}),
    });
    const hrefLang = input.localeToHrefLang?.(locale) ?? locale;
    languages[hrefLang] = toAbsoluteUrl(input.baseUrl, path);
  }

  const canonicalPath = buildLocalizedStaticPath({
    slugByLocale: input.slugByLocale,
    locale: input.locale,
    routing: input.routing,
    locales: input.locales ?? input.routing.locales,
    defaultLocale: input.defaultLocale ?? input.routing.defaultLocale,
    ...(typeof input.prefixPath === "string" ? { prefixPath: input.prefixPath } : {}),
  });

  return {
    canonicalPath,
    alternates: {
      canonical: toAbsoluteUrl(input.baseUrl, canonicalPath),
      languages,
    },
  };
}
