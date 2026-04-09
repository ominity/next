import type { CmsLocale } from "../types.js";
import { normalizeLocaleCode, parseLocaleCode } from "../locales/index.js";

export type CmsLocaleSegmentStrategy = "none" | "language" | "country-language";

export type CmsCanonicalRedirectPolicy = "never" | "if-not-canonical";

export interface CmsRoutingConfig {
  readonly localeSegmentStrategy: CmsLocaleSegmentStrategy;
  readonly canonicalRedirectPolicy: CmsCanonicalRedirectPolicy;
  readonly defaultLocale: string;
  readonly locales: ReadonlyArray<CmsLocale>;
  readonly trailingSlash: boolean;
  readonly basePath: string;
}

export interface CmsRoutingConfigInput {
  readonly localeSegmentStrategy?: CmsLocaleSegmentStrategy;
  readonly canonicalRedirectPolicy?: CmsCanonicalRedirectPolicy;
  readonly defaultLocale: string;
  readonly locales: ReadonlyArray<CmsLocale>;
  readonly trailingSlash?: boolean;
  readonly basePath?: string;
}

export interface LocaleSegmentMatch {
  readonly locale: string;
  readonly consumedSegments: number;
}

function normalizeBasePath(basePath: string | undefined): string {
  const raw = basePath ?? "";
  if (raw.length === 0 || raw === "/") {
    return "";
  }

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

export function createRoutingConfig(input: CmsRoutingConfigInput): CmsRoutingConfig {
  return {
    localeSegmentStrategy: input.localeSegmentStrategy ?? "language",
    canonicalRedirectPolicy: input.canonicalRedirectPolicy ?? "if-not-canonical",
    defaultLocale: normalizeLocaleCode(input.defaultLocale),
    locales: input.locales,
    trailingSlash: input.trailingSlash ?? false,
    basePath: normalizeBasePath(input.basePath),
  };
}

function matchingLocaleByLanguage(locales: ReadonlyArray<CmsLocale>, language: string): string | undefined {
  const normalizedLanguage = language.toLowerCase();
  for (const locale of locales) {
    if (parseLocaleCode(locale.code).language === normalizedLanguage) {
      return normalizeLocaleCode(locale.code);
    }
  }

  return undefined;
}

function matchingLocaleByCountryAndLanguage(
  locales: ReadonlyArray<CmsLocale>,
  country: string,
  language: string,
): string | undefined {
  const normalizedCountry = country.toUpperCase();
  const normalizedLanguage = language.toLowerCase();

  for (const locale of locales) {
    const parsed = parseLocaleCode(locale.code);
    if (parsed.country === normalizedCountry && parsed.language === normalizedLanguage) {
      return normalizeLocaleCode(locale.code);
    }
  }

  return undefined;
}

export function matchLocaleFromSegments(
  segments: ReadonlyArray<string>,
  config: CmsRoutingConfig,
): LocaleSegmentMatch | undefined {
  if (config.localeSegmentStrategy === "none") {
    return {
      locale: config.defaultLocale,
      consumedSegments: 0,
    };
  }

  if (segments.length === 0) {
    return {
      locale: config.defaultLocale,
      consumedSegments: 0,
    };
  }

  if (config.localeSegmentStrategy === "language") {
    const languageSegment = segments[0];
    if (!languageSegment) {
      return {
        locale: config.defaultLocale,
        consumedSegments: 0,
      };
    }

    const byLanguage = matchingLocaleByLanguage(config.locales, languageSegment);
    if (!byLanguage) {
      return {
        locale: config.defaultLocale,
        consumedSegments: 0,
      };
    }

    return {
      locale: byLanguage,
      consumedSegments: 1,
    };
  }

  const [country, language] = segments;
  if (!country || !language) {
    return {
      locale: config.defaultLocale,
      consumedSegments: 0,
    };
  }

  const matched = matchingLocaleByCountryAndLanguage(config.locales, country, language);
  if (!matched) {
    return {
      locale: config.defaultLocale,
      consumedSegments: 0,
    };
  }

  return {
    locale: matched,
    consumedSegments: 2,
  };
}

export function localePrefixSegments(locale: string, config: CmsRoutingConfig): ReadonlyArray<string> {
  if (config.localeSegmentStrategy === "none") {
    return [];
  }

  const normalizedLocale = normalizeLocaleCode(locale);
  const parsed = parseLocaleCode(normalizedLocale);

  if (config.localeSegmentStrategy === "language") {
    return [parsed.language];
  }

  if (!parsed.country) {
    return [parsed.language];
  }

  return [parsed.country.toLowerCase(), parsed.language];
}

