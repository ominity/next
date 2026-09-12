import type { CmsRouteObject } from "../cms/routing/links.js";
import { normalizeLocaleCode, parseLocaleCode } from "../cms/locales/index.js";

function pathSegments(value: unknown): ReadonlyArray<string> {
  if (Array.isArray(value)) {
    return value.flatMap(pathSegments);
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return [];
  }
  return String(value).split("/").map((segment) => segment.trim()).filter(Boolean);
}

export function commerceRouteLocaleCandidates(locale: string): ReadonlyArray<string> {
  const normalized = normalizeLocaleCode(locale);
  const language = parseLocaleCode(normalized).language;
  return Array.from(new Set([normalized, language].filter(Boolean)));
}

/** Returns the original SDK route object without remapping it. */
export function findCommerceRouteForLocale<TRoute extends CmsRouteObject>(
  routes: Readonly<Record<string, TRoute>>,
  locale: string,
  expectedName: "product" | "category",
): TRoute | null {
  for (const candidate of commerceRouteLocaleCandidates(locale)) {
    const route = routes[candidate];
    if (route?.name === expectedName) {
      return route;
    }
  }

  const targetLanguage = parseLocaleCode(normalizeLocaleCode(locale)).language;
  const languageRoute = Object.values(routes).find((route) => {
    return route.name === expectedName
      && typeof route.locale === "string"
      && parseLocaleCode(normalizeLocaleCode(route.locale)).language === targetLanguage;
  });

  return languageRoute
    ?? Object.values(routes).find((route) => route.name === expectedName)
    ?? null;
}

export function commerceRouteSlugSegments(route: CmsRouteObject): ReadonlyArray<string> {
  return pathSegments(route.parameters.slug);
}

export function commerceProductRouteSegment(route: CmsRouteObject): string | null {
  const sku = typeof route.parameters.sku === "string" || typeof route.parameters.sku === "number"
    ? String(route.parameters.sku).trim()
    : "";
  const slug = commerceRouteSlugSegments(route).join("-");
  return sku && slug ? `${sku}-${slug}` : null;
}
