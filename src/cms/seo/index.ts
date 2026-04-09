import type { CmsMetadataInput, CmsPageTranslation, CmsSeoRobots } from "../types.js";

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
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  if (withLeadingSlash === "/") {
    return "/";
  }

  return withLeadingSlash.replace(/\/+$/, "");
}

function toAbsoluteUrl(baseUrl: string | URL | undefined, path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
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

export function buildCmsMetadata(input: CmsMetadataInput): CmsMetadata {
  const { page, locale, baseUrl } = input;
  const seo = page.seo;
  const selectedLocale = locale ?? page.locale;

  const canonicalPath = seo?.canonicalUrl ?? page.canonicalPath ?? page.path;
  const canonical = input.includeCanonical === false ? undefined : toAbsoluteUrl(baseUrl, canonicalPath);

  const languages = input.includeAlternates === false
    ? undefined
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
