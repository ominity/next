import type { CmsMetadataInput, CmsPageTranslation, CmsSeoRobots } from "../types.js";
import { normalizeLocaleCode, parseLocaleCode, resolveAlternateLocaleTargets } from "../locales/index.js";
import { createCmsLinkResolver } from "../routing/index.js";

export interface CmsMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly alternates?: {
    readonly canonical?: string;
    readonly languages?: Readonly<Record<string, string>>;
  };
  readonly robots?: CmsSeoRobots;
  readonly openGraph?: {
    readonly title?: string;
    readonly description?: string;
    readonly type?: string;
    readonly url?: string;
    readonly locale?: string;
    readonly images?: ReadonlyArray<{
      readonly url: string;
      readonly alt?: string;
    }>;
  };
}

function normalizePath(path: string): string {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  if (withLeadingSlash === "/") {
    return "/";
  }

  return withLeadingSlash.replace(/\/+$/, "");
}

function isAbsoluteUrl(path: string): boolean {
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(path);
}

function toAbsoluteUrl(baseUrl: string | URL | undefined, path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }

  if (isAbsoluteUrl(path)) {
    return path;
  }

  if (!baseUrl) {
    return normalizePath(path);
  }

  return new URL(normalizePath(path), baseUrl).toString();
}

function translationLanguageMap(
  translations: ReadonlyArray<CmsPageTranslation>,
  options: { baseUrl?: string | URL; localeToHrefLang?: (locale: string) => string },
): Readonly<Record<string, string>> {
  const languageEntries: Array<[string, string]> = [];

  for (const translation of translations) {
    const hrefLang = options.localeToHrefLang?.(translation.locale) ?? translation.locale;
    const url = toAbsoluteUrl(options.baseUrl, translation.path);
    if (!url) {
      continue;
    }

    languageEntries.push([hrefLang, url]);
  }

  return Object.fromEntries(languageEntries);
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

function resolvePathFromCandidates(
  pathByLocale: Readonly<Record<string, string>>,
  candidates: ReadonlyArray<string>,
): string | null {
  for (const candidate of candidates) {
    const exact = pathByLocale[candidate];
    if (typeof exact === "string") {
      return exact;
    }
  }

  return null;
}

function translationPathMap(
  selectedLocale: string,
  pagePath: string,
  translations: ReadonlyArray<CmsPageTranslation>,
): Readonly<Record<string, string>> {
  const entries: Array<[string, string]> = [];

  for (const translation of translations) {
    entries.push([
      normalizeLocaleCode(translation.locale),
      normalizePath(translation.path),
    ]);
  }

  entries.push([
    normalizeLocaleCode(selectedLocale),
    normalizePath(pagePath),
  ]);

  return Object.fromEntries(entries);
}

function localizePath(path: string, locale: string, input: CmsMetadataInput): string {
  const routing = input.routing;
  if (!routing || isAbsoluteUrl(path)) {
    return normalizePath(path);
  }

  const resolver = createCmsLinkResolver({
    config: routing,
    stringLinkStrategy: "localize-relative",
  });

  return resolver.resolve(path, { locale: normalizeLocaleCode(locale) }).href;
}

function translationLocaleMapFromRouting(input: CmsMetadataInput): Readonly<Record<string, string>> {
  if (!input.routing) {
    return {};
  }

  const page = input.page;
  const pathByLocale = translationPathMap(page.locale, page.path, page.translations);
  const availableLocales = input.routing.locales.map((entry) => normalizeLocaleCode(entry.code));
  const targets = resolveAlternateLocaleTargets({
    localeSegmentStrategy: input.routing.localeSegmentStrategy,
    locales: input.routing.locales,
    ...(Array.isArray(input.alternateLanguages) ? { languages: input.alternateLanguages } : {}),
    ...(Array.isArray(input.alternateCountries) ? { countries: input.alternateCountries } : {}),
  });

  const entries: Array<[string, string]> = [];
  for (const target of targets) {
    const candidates = localeCandidates(
      target.locale,
      availableLocales,
      input.routing.defaultLocale,
    );
    const resolvedPath = resolvePathFromCandidates(pathByLocale, candidates) ?? page.path;
    const localizedPath = localizePath(resolvedPath, target.locale, input);
    const hrefLang = input.localeToHrefLang?.(target.hrefLang) ?? target.hrefLang;
    const url = toAbsoluteUrl(input.baseUrl, localizedPath);
    if (!url) {
      continue;
    }

    entries.push([hrefLang, url]);
  }

  return Object.fromEntries(entries);
}

export function buildCmsMetadata(input: CmsMetadataInput): CmsMetadata {
  const { page, locale, baseUrl } = input;
  const seo = page.seo;
  const selectedLocale = normalizeLocaleCode(locale ?? page.locale);

  const translationPaths = translationPathMap(page.locale, page.path, page.translations);
  const routingLocales = input.routing
    ? input.routing.locales.map((entry) => normalizeLocaleCode(entry.code))
    : Object.keys(translationPaths);
  const canonicalCandidates = localeCandidates(
    selectedLocale,
    routingLocales,
    input.routing?.defaultLocale,
  );
  const fallbackCanonicalPath = resolvePathFromCandidates(translationPaths, canonicalCandidates)
    ?? page.canonicalPath
    ?? page.path;

  const canonicalPath = seo?.canonicalUrl ?? fallbackCanonicalPath;
  const canonicalLocalizedPath = localizePath(canonicalPath, selectedLocale, input);
  const canonical = input.includeCanonical === false ? undefined : toAbsoluteUrl(baseUrl, canonicalLocalizedPath);

  const languages = input.includeAlternates === false
    ? undefined
    : input.routing
      ? translationLocaleMapFromRouting(input)
      : translationLanguageMap(page.translations, {
        ...(typeof baseUrl !== "undefined" ? { baseUrl } : {}),
        ...(typeof input.localeToHrefLang === "function" ? { localeToHrefLang: input.localeToHrefLang } : {}),
      });

  const metadata: {
    title?: string;
    description?: string;
    alternates?: {
      canonical?: string;
      languages?: Readonly<Record<string, string>>;
    };
    robots?: CmsSeoRobots;
    openGraph?: {
      title?: string;
      description?: string;
      type?: string;
      url?: string;
      locale?: string;
      images?: ReadonlyArray<{
        url: string;
        alt?: string;
      }>;
    };
  } = {};

  const title = seo?.title ?? page.title;
  const description = seo?.description ?? page.description;

  if (typeof title === "string") {
    metadata.title = title;
  }

  if (typeof description === "string") {
    metadata.description = description;
  }

  if (canonical || (languages && Object.keys(languages).length > 0)) {
    metadata.alternates = {
      ...(canonical ? { canonical } : {}),
      ...(languages && Object.keys(languages).length > 0 ? { languages } : {}),
    };
  }

  const robots = seo?.robots ?? input.fallbackRobots;
  if (robots) {
    metadata.robots = robots;
  }

  const openGraph = {
    title: seo?.openGraph?.title ?? title,
    description: seo?.openGraph?.description ?? description,
    type: seo?.openGraph?.type ?? "website",
    url: canonical,
    locale: selectedLocale,
    images: seo?.openGraph?.images,
  };

  metadata.openGraph = {
    ...(typeof openGraph.title === "string" ? { title: openGraph.title } : {}),
    ...(typeof openGraph.description === "string" ? { description: openGraph.description } : {}),
    ...(typeof openGraph.type === "string" ? { type: openGraph.type } : {}),
    ...(typeof openGraph.url === "string" ? { url: openGraph.url } : {}),
    ...(typeof openGraph.locale === "string" ? { locale: openGraph.locale } : {}),
    ...(Array.isArray(openGraph.images) ? { images: openGraph.images } : {}),
  };

  return metadata;
}
