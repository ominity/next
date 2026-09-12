const ORGANIZATION_ID_SUFFIX = "#organization";
const WEBSITE_ID_SUFFIX = "#website";

export interface BuildSiteStructuredDataInput {
  readonly siteUrl: string;
  readonly name: string;
  readonly description: string;
  readonly logoPath: string;
  readonly sameAs?: ReadonlyArray<string>;
  readonly email?: string;
  readonly telephone?: string;
}

export interface BuildBreadcrumbListInput {
  readonly items: ReadonlyArray<{ readonly name: string; readonly item: string }>;
}

export interface BuildCreativeWorkStructuredDataInput {
  readonly canonicalUrl: string;
  readonly title: string;
  readonly locale: string;
  readonly organizationId: string;
  readonly description?: string;
  readonly images?: ReadonlyArray<string>;
  readonly about?: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly keywords?: string;
  readonly datePublished?: string;
  readonly dateModified?: string;
}

export interface OrganizationStructuredData extends Readonly<Record<string, unknown>> {
  readonly "@context": "https://schema.org";
  readonly "@type": "Organization";
  readonly "@id": string;
}

export interface WebsiteStructuredData extends Readonly<Record<string, unknown>> {
  readonly "@context": "https://schema.org";
  readonly "@type": "WebSite";
  readonly "@id": string;
}

function normalizePath(path: string): string {
  return path === "/" ? path : path.replace(/\/+$/, "");
}

export function resolveOrganizationId(siteUrl: string): string {
  return `${normalizePath(siteUrl)}${ORGANIZATION_ID_SUFFIX}`;
}

export function resolveWebsiteId(siteUrl: string): string {
  return `${normalizePath(siteUrl)}${WEBSITE_ID_SUFFIX}`;
}

export function buildSiteStructuredData(
  input: BuildSiteStructuredDataInput,
): ReadonlyArray<OrganizationStructuredData | WebsiteStructuredData> {
  const organizationId = resolveOrganizationId(input.siteUrl);

  return [{
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId,
    name: input.name,
    url: input.siteUrl,
    logo: new URL(input.logoPath, input.siteUrl).toString(),
    description: input.description,
    sameAs: input.sameAs ?? [],
    ...(input.email ? { email: input.email } : {}),
    ...(input.telephone ? { telephone: input.telephone } : {}),
  }, {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": resolveWebsiteId(input.siteUrl),
    url: input.siteUrl,
    name: input.name,
    description: input.description,
    publisher: { "@id": organizationId },
  }];
}

export function buildBreadcrumbListStructuredData(
  input: BuildBreadcrumbListInput,
): Readonly<Record<string, unknown>> | null {
  if (input.items.length === 0) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: input.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
}

export function buildCreativeWorkStructuredData(
  input: BuildCreativeWorkStructuredDataInput,
): Readonly<Record<string, unknown>> {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${input.canonicalUrl}#creative-work`,
    url: input.canonicalUrl,
    mainEntityOfPage: input.canonicalUrl,
    name: input.title,
    headline: input.title,
    inLanguage: input.locale,
    author: { "@id": input.organizationId },
    publisher: { "@id": input.organizationId },
    ...(input.description ? { description: input.description } : {}),
    ...(input.images && input.images.length > 0 ? { image: input.images } : {}),
    ...(input.about && input.about.length > 0 ? { about: input.about } : {}),
    ...(input.keywords ? { keywords: input.keywords } : {}),
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
