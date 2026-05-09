import type { CmsLocale, CmsRoutingConfig } from "../cms/index.js";
import { localePrefixSegments, normalizeLocaleCode, parseLocaleCode } from "../cms/index.js";

export type HomeLocaleRedirectMode =
  | "off"
  | "accept-language"
  | "cookie-accept-language"
  | "geo-cookie-accept-language";

export type HomeLocaleRedirectSource = "cookie" | "accept-language" | "geo-country";

export interface ResolveHomeLocaleRedirectInput {
  readonly incomingPath: string;
  readonly routing: CmsRoutingConfig;
  readonly mode?: HomeLocaleRedirectMode;
  readonly cookieHeader?: string | null;
  readonly cookieName?: string;
  readonly acceptLanguageHeader?: string | null;
  readonly countryHeader?: string | null;
  readonly userAgentHeader?: string | null;
  readonly skipBots?: boolean;
}

export interface HomeLocaleRedirectResolution {
  readonly locale: string;
  readonly destinationPath: string;
  readonly source: HomeLocaleRedirectSource;
}

interface SupportedLocale {
  readonly code: string;
  readonly language: string;
  readonly country?: string;
  readonly isDefault: boolean;
}

interface LanguagePreference {
  readonly locale: string;
  readonly language: string;
  readonly country?: string;
  readonly weight: number;
}

const DEFAULT_COOKIE_NAME = "ominity_locale";

const BOT_USER_AGENT_PATTERN = /\b(bot|crawler|spider|slurp|preview|facebookexternalhit|linkedinbot|whatsapp|discordbot|telegrambot|applebot|yandex|duckduckbot)\b/i;

function asNonEmpty(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

function splitPath(path: string): ReadonlyArray<string> {
  return normalizePath(path).split("/").filter((segment) => segment.length > 0);
}

function joinPath(segments: ReadonlyArray<string>): string {
  if (segments.length === 0) {
    return "/";
  }

  return `/${segments.join("/")}`;
}

function removeBasePath(path: string, basePath: string): string {
  if (basePath.length === 0 || basePath === "/") {
    return normalizePath(path);
  }

  const normalizedPath = normalizePath(path);
  const normalizedBasePath = normalizePath(basePath);

  if (normalizedPath === normalizedBasePath) {
    return "/";
  }

  if (normalizedPath.startsWith(`${normalizedBasePath}/`)) {
    return normalizePath(normalizedPath.slice(normalizedBasePath.length));
  }

  return normalizedPath;
}

function homePathForLocale(locale: string, routing: CmsRoutingConfig): string {
  const segments = localePrefixSegments(locale, routing);
  const localizedPath = joinPath(segments);
  const withBasePath = routing.basePath.length > 0
    ? normalizePath(`${routing.basePath}${localizedPath === "/" ? "" : localizedPath}`)
    : localizedPath;

  if (routing.trailingSlash && withBasePath !== "/") {
    return `${withBasePath}/`;
  }

  return withBasePath;
}

function cookieValue(cookieHeader: string | null | undefined, name: string): string | undefined {
  const cookie = asNonEmpty(cookieHeader);
  if (!cookie) {
    return undefined;
  }

  const entries = cookie.split(";");
  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = entry.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }

    const raw = entry.slice(separatorIndex + 1).trim();
    if (!raw) {
      return undefined;
    }

    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  return undefined;
}

function parseCountryCode(value: string | null | undefined): string | undefined {
  const candidate = asNonEmpty(value);
  if (!candidate) {
    return undefined;
  }

  const token = candidate.split(",")[0]?.split(";")[0]?.trim().toUpperCase();
  if (!token || !/^[A-Z]{2}$/.test(token)) {
    return undefined;
  }

  if (token === "XX" || token === "T1") {
    return undefined;
  }

  return token;
}

function parseAcceptLanguage(value: string | null | undefined): ReadonlyArray<LanguagePreference> {
  const header = asNonEmpty(value);
  if (!header) {
    return [];
  }

  const entries = header
    .split(",")
    .map((part, index) => {
      const [rawLocale = "", ...params] = part.trim().split(";");
      const localeToken = rawLocale.trim();
      if (!localeToken || localeToken === "*") {
        return null;
      }

      let weight = 1;
      for (const param of params) {
        const [rawKey = "", rawValue = ""] = param.trim().split("=");
        if (rawKey.trim().toLowerCase() !== "q") {
          continue;
        }

        const parsedWeight = Number.parseFloat(rawValue.trim());
        if (Number.isFinite(parsedWeight) && parsedWeight >= 0 && parsedWeight <= 1) {
          weight = parsedWeight;
        }
      }

      const normalizedLocale = normalizeLocaleCode(localeToken.replaceAll("_", "-"));
      const parsed = parseLocaleCode(normalizedLocale);
      if (parsed.language.length === 0) {
        return null;
      }

      return {
        locale: normalizedLocale,
        language: parsed.language,
        ...(parsed.country ? { country: parsed.country } : {}),
        weight,
        index,
      };
    })
    .filter((entry): entry is LanguagePreference & { readonly index: number } => entry !== null);

  entries.sort((left, right) => {
    if (left.weight !== right.weight) {
      return right.weight - left.weight;
    }

    return left.index - right.index;
  });

  return entries.map((entry) => ({
    locale: entry.locale,
    language: entry.language,
    ...(entry.country ? { country: entry.country } : {}),
    weight: entry.weight,
  }));
}

function buildSupportedLocales(routing: CmsRoutingConfig): ReadonlyArray<SupportedLocale> {
  const defaultLocale = normalizeLocaleCode(routing.defaultLocale);
  return routing.locales.map((locale) => {
    const code = normalizeLocaleCode(locale.code);
    const parsed = parseLocaleCode(code);
    return {
      code,
      language: parsed.language,
      ...(parsed.country ? { country: parsed.country } : {}),
      isDefault: code === defaultLocale || locale.default === true,
    };
  });
}

function findLocaleByCandidate(
  candidate: string | undefined,
  supportedLocales: ReadonlyArray<SupportedLocale>,
): string | undefined {
  const rawCandidate = asNonEmpty(candidate);
  if (!rawCandidate) {
    return undefined;
  }

  const normalized = normalizeLocaleCode(rawCandidate.replaceAll("_", "-"));
  const parsed = parseLocaleCode(normalized);
  if (parsed.language.length === 0) {
    return undefined;
  }

  const exact = supportedLocales.find((entry) => entry.code === normalized);
  if (exact) {
    return exact.code;
  }

  if (parsed.country) {
    const byCountryAndLanguage = supportedLocales.find(
      (entry) => entry.language === parsed.language && entry.country === parsed.country,
    );
    if (byCountryAndLanguage) {
      return byCountryAndLanguage.code;
    }
  }

  const sameLanguage = supportedLocales.filter((entry) => entry.language === parsed.language);
  if (sameLanguage.length === 0) {
    return undefined;
  }

  const defaultWithLanguage = sameLanguage.find((entry) => entry.isDefault);
  if (defaultWithLanguage) {
    return defaultWithLanguage.code;
  }

  const withoutCountry = sameLanguage.find((entry) => !entry.country);
  if (withoutCountry) {
    return withoutCountry.code;
  }

  return sameLanguage[0]?.code;
}

function findLocaleByCountry(
  country: string | undefined,
  preferredLanguage: string | undefined,
  supportedLocales: ReadonlyArray<SupportedLocale>,
): string | undefined {
  if (!country) {
    return undefined;
  }

  const sameCountry = supportedLocales.filter((entry) => entry.country === country);
  if (sameCountry.length === 0) {
    return undefined;
  }

  if (preferredLanguage) {
    const sameCountryLanguage = sameCountry.find((entry) => entry.language === preferredLanguage);
    if (sameCountryLanguage) {
      return sameCountryLanguage.code;
    }
  }

  const defaultWithCountry = sameCountry.find((entry) => entry.isDefault);
  if (defaultWithCountry) {
    return defaultWithCountry.code;
  }

  return sameCountry[0]?.code;
}

function isHomeRequest(path: string, routing: CmsRoutingConfig): boolean {
  const relativePath = removeBasePath(path, routing.basePath);
  return splitPath(relativePath).length === 0;
}

function isBotUserAgent(value: string | null | undefined): boolean {
  const userAgent = asNonEmpty(value);
  if (!userAgent) {
    return false;
  }

  return BOT_USER_AGENT_PATTERN.test(userAgent);
}

function firstAcceptedLanguage(preferences: ReadonlyArray<LanguagePreference>): string | undefined {
  return preferences[0]?.language;
}

export function resolveHomeLocaleRedirect(
  input: ResolveHomeLocaleRedirectInput,
): HomeLocaleRedirectResolution | null {
  const mode = input.mode ?? "off";
  if (mode === "off") {
    return null;
  }

  if (input.routing.localeSegmentStrategy === "none") {
    return null;
  }

  const normalizedIncomingPath = normalizePath(input.incomingPath);
  if (!isHomeRequest(normalizedIncomingPath, input.routing)) {
    return null;
  }

  const skipBots = input.skipBots ?? true;
  if (skipBots && isBotUserAgent(input.userAgentHeader)) {
    return null;
  }

  const supportedLocales = buildSupportedLocales(input.routing);
  const defaultLocale = normalizeLocaleCode(input.routing.defaultLocale);
  const cookieName = input.cookieName ?? DEFAULT_COOKIE_NAME;
  const acceptLanguagePreferences = parseAcceptLanguage(input.acceptLanguageHeader);

  let selectedLocale: string | undefined;
  let source: HomeLocaleRedirectSource | undefined;

  if (mode === "cookie-accept-language" || mode === "geo-cookie-accept-language") {
    const fromCookie = findLocaleByCandidate(cookieValue(input.cookieHeader, cookieName), supportedLocales);
    if (fromCookie) {
      selectedLocale = fromCookie;
      source = "cookie";
    }
  }

  if (!selectedLocale && mode === "geo-cookie-accept-language") {
    const detectedCountry = parseCountryCode(input.countryHeader);
    const preferredLanguage = firstAcceptedLanguage(acceptLanguagePreferences);
    const fromCountry = findLocaleByCountry(detectedCountry, preferredLanguage, supportedLocales);
    if (fromCountry) {
      selectedLocale = fromCountry;
      source = "geo-country";
    }
  }

  if (!selectedLocale) {
    for (const preference of acceptLanguagePreferences) {
      const candidate = findLocaleByCandidate(preference.locale, supportedLocales);
      if (!candidate) {
        continue;
      }

      selectedLocale = candidate;
      source = "accept-language";
      break;
    }
  }

  const targetLocale = selectedLocale ?? defaultLocale;
  const targetPath = homePathForLocale(targetLocale, input.routing);
  if (normalizePath(targetPath) === normalizePath(normalizedIncomingPath)) {
    return null;
  }

  return {
    locale: targetLocale,
    destinationPath: targetPath,
    source: source ?? "accept-language",
  };
}
