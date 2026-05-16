import type { CmsLocale, CmsRoutingConfig } from "../cms/index.js";
import { CmsRouteResolutionError } from "../cms/errors.js";
import {
  normalizeLocaleCode,
  parseLocaleCode,
  resolveAlternateLocaleTargets,
} from "../cms/locales/index.js";
import { createCmsLinkResolver } from "../cms/routing/index.js";
import type { NextMetadata } from "./types.js";

export type LocalizedRouteTemplateMap = Readonly<Record<string, string>>;

export type RouteTemplateParamPrimitive = string | number;

export type RouteTemplateParamValue = RouteTemplateParamPrimitive | ReadonlyArray<RouteTemplateParamPrimitive>;

export type RouteTemplateParams = Readonly<Record<string, RouteTemplateParamValue>>;

type LocaleOrCode = CmsLocale | string;

export interface ResolveLocalizedRouteTemplateInput {
  readonly templateByLocale: LocalizedRouteTemplateMap;
  readonly locale: string;
  readonly locales?: ReadonlyArray<LocaleOrCode>;
  readonly defaultLocale?: string;
}

export interface BuildLocalizedRoutePathInput extends ResolveLocalizedRouteTemplateInput {
  readonly routing: CmsRoutingConfig;
  readonly params?: RouteTemplateParams;
}

export interface BuildLocalizedRouteAlternatesInput extends BuildLocalizedRoutePathInput {
  readonly baseUrl?: string | URL;
  readonly localeToHrefLang?: (locale: string) => string;
  readonly languages?: ReadonlyArray<string>;
  readonly countries?: ReadonlyArray<string>;
}

export interface LocalizedRouteAlternatesResult {
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

function normalizeTemplate(value: string): string {
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

function normalizeTemplateByLocaleMap(input: LocalizedRouteTemplateMap): Readonly<Record<string, string>> {
  const entries: Array<[string, string]> = [];

  for (const [rawLocale, rawTemplate] of Object.entries(input)) {
    if (typeof rawTemplate !== "string") {
      continue;
    }

    const normalizedLocale = normalizeLocaleCode(rawLocale);
    entries.push([normalizedLocale, normalizeTemplate(rawTemplate)]);
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

function resolveTemplateFromCandidates(
  templateByLocale: Readonly<Record<string, string>>,
  candidates: ReadonlyArray<string>,
): string | null {
  for (const candidate of candidates) {
    const exact = templateByLocale[candidate];
    if (typeof exact === "string") {
      return exact;
    }
  }

  return null;
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

function toParamString(value: RouteTemplateParamValue): string {
  if (Array.isArray(value)) {
    return value.map((entry) => `${entry}`).join("/");
  }

  return `${value}`;
}

const WHOLE_SEGMENT_PARAM_PATTERN = /^\{([A-Za-z0-9_]+)\}$/;
const SEGMENT_PARAM_PATTERN = /\{([A-Za-z0-9_]+)\}/g;

function resolveSegmentWithTemplate(
  templateSegment: string,
  params: RouteTemplateParams | undefined,
): ReadonlyArray<string> {
  const wholeSegmentMatch = templateSegment.match(WHOLE_SEGMENT_PARAM_PATTERN);
  if (wholeSegmentMatch) {
    const paramName = wholeSegmentMatch[1];
    if (typeof paramName !== "string" || paramName.length === 0) {
      throw new CmsRouteResolutionError("Invalid route template param name", {
        details: {
          templateSegment,
        },
      });
    }

    if (!params || !(paramName in params)) {
      throw new CmsRouteResolutionError(`Missing route template param: ${paramName}`, {
        details: {
          templateSegment,
          paramName,
        },
      });
    }

    const value = params[paramName];
    if (Array.isArray(value)) {
      const entries = value
        .map((entry) => `${entry}`.trim())
        .filter((entry) => entry.length > 0);
      if (entries.length === 0) {
        throw new CmsRouteResolutionError(`Route template param "${paramName}" cannot be empty`, {
          details: {
            templateSegment,
            paramName,
          },
        });
      }

      return entries
        .flatMap((entry) => entry.split("/"))
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map(encodePathPart);
    }

    const valueText = `${value}`.trim();
    if (valueText.length === 0) {
      throw new CmsRouteResolutionError(`Route template param "${paramName}" cannot be empty`, {
        details: {
          templateSegment,
          paramName,
        },
      });
    }

    return valueText
      .split("/")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map(encodePathPart);
  }

  const renderedSegment = templateSegment.replace(SEGMENT_PARAM_PATTERN, (_match, rawParamName: string) => {
    const paramName = rawParamName.trim();
    if (!params || !(paramName in params)) {
      throw new CmsRouteResolutionError(`Missing route template param: ${paramName}`, {
        details: {
          templateSegment,
          paramName,
        },
      });
    }

    const value = params[paramName];
    if (Array.isArray(value)) {
      throw new CmsRouteResolutionError(`Route template param "${paramName}" cannot be an array in mixed segment`, {
        details: {
          templateSegment,
          paramName,
        },
      });
    }

    return encodePathPart(`${value}`.trim());
  });

  if (renderedSegment.length === 0) {
    return [];
  }

  return [renderedSegment];
}

function renderTemplate(template: string, params: RouteTemplateParams | undefined): string {
  const normalizedTemplate = normalizeTemplate(template);
  if (normalizedTemplate.length === 0) {
    return "/";
  }

  const templateSegments = normalizedTemplate
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const renderedSegments = templateSegments.flatMap((segment) => resolveSegmentWithTemplate(segment, params));
  if (renderedSegments.length === 0) {
    return "/";
  }

  return normalizePath(`/${renderedSegments.join("/")}`);
}

export function resolveLocalizedRouteTemplate(input: ResolveLocalizedRouteTemplateInput): string {
  const normalizedTemplateByLocale = normalizeTemplateByLocaleMap(input.templateByLocale);
  const configuredLocales = localeCodes(input.locales);
  const fallbackLocale = input.defaultLocale;
  const candidates = localeCandidates(input.locale, configuredLocales, fallbackLocale);
  const resolved = resolveTemplateFromCandidates(normalizedTemplateByLocale, candidates);

  if (resolved !== null) {
    return resolved;
  }

  const firstConfigured = Object.values(normalizedTemplateByLocale)[0];
  if (typeof firstConfigured === "string") {
    return firstConfigured;
  }

  throw new CmsRouteResolutionError("Unable to resolve localized route template", {
    details: {
      locale: input.locale,
      availableLocales: configuredLocales,
      defaultLocale: fallbackLocale,
      templateLocales: Object.keys(normalizedTemplateByLocale),
    },
  });
}

export function buildLocalizedRoutePath(input: BuildLocalizedRoutePathInput): string {
  const normalizedLocale = normalizeLocaleCode(input.locale);
  const template = resolveLocalizedRouteTemplate({
    templateByLocale: input.templateByLocale,
    locale: normalizedLocale,
    locales: input.locales ?? input.routing.locales,
    defaultLocale: input.defaultLocale ?? input.routing.defaultLocale,
  });
  const relativePath = renderTemplate(template, input.params);

  const resolver = createCmsLinkResolver({
    config: input.routing,
    stringLinkStrategy: "localize-relative",
  });

  return resolver.resolve(relativePath, { locale: normalizedLocale }).href;
}

export function buildLocalizedRouteAlternates(input: BuildLocalizedRouteAlternatesInput): LocalizedRouteAlternatesResult {
  const locales = input.locales ?? input.routing.locales;
  const languages: Record<string, string> = {};
  const targets = resolveAlternateLocaleTargets({
    localeSegmentStrategy: input.routing.localeSegmentStrategy,
    locales,
    ...(Array.isArray(input.languages) ? { languages: input.languages } : {}),
    ...(Array.isArray(input.countries) ? { countries: input.countries } : {}),
  });

  for (const target of targets) {
    const path = buildLocalizedRoutePath({
      templateByLocale: input.templateByLocale,
      locale: target.locale,
      routing: input.routing,
      locales,
      defaultLocale: input.defaultLocale ?? input.routing.defaultLocale,
      ...(input.params ? { params: input.params } : {}),
    });

    const hrefLang = input.localeToHrefLang?.(target.hrefLang) ?? target.hrefLang;
    languages[hrefLang] = toAbsoluteUrl(input.baseUrl, path);
  }

  const canonicalPath = buildLocalizedRoutePath({
    templateByLocale: input.templateByLocale,
    locale: input.locale,
    routing: input.routing,
    locales,
    defaultLocale: input.defaultLocale ?? input.routing.defaultLocale,
    ...(input.params ? { params: input.params } : {}),
  });

  return {
    canonicalPath,
    alternates: {
      canonical: toAbsoluteUrl(input.baseUrl, canonicalPath),
      languages,
    },
  };
}

export function buildRouteTemplateParams(input: Readonly<Record<string, unknown>>): RouteTemplateParams {
  const result: Record<string, RouteTemplateParamValue> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number") {
      result[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      const arrayValue = value.filter((entry): entry is string | number => {
        return typeof entry === "string" || typeof entry === "number";
      });
      result[key] = arrayValue;
    }
  }

  return result;
}

export function stringifyRouteTemplateParam(value: RouteTemplateParamValue): string {
  return toParamString(value);
}
