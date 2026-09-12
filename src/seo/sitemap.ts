export { buildCmsSitemap, type BuildCmsSitemapInput } from "../next/sitemap.js";

export interface SitemapEntryLike {
  readonly url: string;
  readonly lastModified?: Date | string | undefined;
  readonly alternates?: {
    readonly languages?: Readonly<Record<string, string | URL | undefined>> | undefined;
  } | undefined;
}

export interface BuildLocalizedResourceSitemapInput<TResource> {
  readonly baseUrl: string | URL;
  readonly locales: ReadonlyArray<string | { readonly code: string }>;
  loadResources(locale: string): Promise<ReadonlyArray<TResource>>;
  resolveGroupKey(resource: TResource): string | null;
  resolvePath(resource: TResource, locale: string): string | null;
  resolveLastModified?(resource: TResource): Date | string | undefined;
}

export interface LocalizedResourceSitemapEntry {
  readonly url: string;
  readonly lastModified?: Date | string;
  readonly alternates: {
    readonly languages: Readonly<Record<string, string>>;
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

export function mergeSitemapEntries<TEntry extends { readonly url: string }>(
  ...collections: ReadonlyArray<ReadonlyArray<TEntry>>
): Array<TEntry> {
  const byUrl = new Map<string, TEntry>();
  for (const entry of collections.flat()) {
    byUrl.set(entry.url, entry);
  }
  return Array.from(byUrl.values());
}

/** Builds alternate-aware entries for any SDK resource loaded per locale. */
export async function buildLocalizedResourceSitemap<TResource>(
  input: BuildLocalizedResourceSitemapInput<TResource>,
): Promise<Array<LocalizedResourceSitemapEntry>> {
  const localizedResources = new Map<
    string,
    Map<string, { readonly url: string; readonly lastModified?: Date | string }>
  >();

  for (const localeInput of input.locales) {
    const locale = typeof localeInput === "string" ? localeInput : localeInput.code;
    const resources = await input.loadResources(locale);

    for (const resource of resources) {
      const groupKey = input.resolveGroupKey(resource);
      const path = input.resolvePath(resource, locale);
      if (!groupKey || !path) {
        continue;
      }

      const variants = localizedResources.get(groupKey) ?? new Map();
      const lastModified = input.resolveLastModified?.(resource);
      variants.set(locale, {
        url: new URL(path, input.baseUrl).toString(),
        ...(lastModified ? { lastModified } : {}),
      });
      localizedResources.set(groupKey, variants);
    }
  }

  const entries: LocalizedResourceSitemapEntry[] = [];
  const seen = new Set<string>();
  for (const variants of localizedResources.values()) {
    const languages = Object.fromEntries(
      Array.from(variants.entries()).map(([locale, variant]) => [locale, variant.url]),
    );

    for (const variant of variants.values()) {
      if (seen.has(variant.url)) {
        continue;
      }
      seen.add(variant.url);
      entries.push({
        url: variant.url,
        ...(variant.lastModified ? { lastModified: variant.lastModified } : {}),
        alternates: { languages },
      });
    }
  }

  return entries;
}

export function buildSitemapXml(
  entries: ReadonlyArray<SitemapEntryLike>,
  stylesheetHref = "/sitemap.xsl",
): string {
  const urls = entries.map((entry) => {
    const alternates = Object.entries(entry.alternates?.languages ?? {})
      .map(([locale, href]) => {
        if (typeof href === "undefined") {
          return "";
        }
        return `<xhtml:link rel="alternate" hreflang="${escapeXml(locale)}" href="${escapeXml(String(href))}" />`;
      })
      .join("");
    const lastModified = entry.lastModified instanceof Date
      ? entry.lastModified.toISOString()
      : entry.lastModified;

    return `<url><loc>${escapeXml(entry.url)}</loc>${alternates}${lastModified ? `<lastmod>${escapeXml(lastModified)}</lastmod>` : ""}</url>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="${escapeXml(stylesheetHref)}"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`;
}
