import type { CmsLocale } from "../types.js";

export interface ParsedLocaleCode {
  readonly language: string;
  readonly country?: string;
}

export function parseLocaleCode(localeCode: string): ParsedLocaleCode {
  const trimmed = localeCode.trim();
  if (trimmed.length === 0) {
    return { language: "" };
  }

  const [language = "", country] = trimmed.replace("_", "-").split("-");
  if (!country) {
    return { language: language.toLowerCase() };
  }

  return {
    language: language.toLowerCase(),
    country: country.toUpperCase(),
  };
}

export function toLocaleCode(input: ParsedLocaleCode): string {
  if (!input.country) {
    return input.language.toLowerCase();
  }

  return `${input.language.toLowerCase()}-${input.country.toUpperCase()}`;
}

export function normalizeLocaleCode(localeCode: string): string {
  return toLocaleCode(parseLocaleCode(localeCode));
}

export function localeLanguage(localeCode: string): string {
  return parseLocaleCode(localeCode).language;
}

export function localeCountry(localeCode: string): string | undefined {
  return parseLocaleCode(localeCode).country;
}

export function isSameLocale(a: string, b: string): boolean {
  return normalizeLocaleCode(a) === normalizeLocaleCode(b);
}

export function resolveLocaleCode(candidates: ReadonlyArray<string>, supported: ReadonlyArray<CmsLocale>): string | undefined {
  const normalizedSupported = new Set(supported.map((locale) => normalizeLocaleCode(locale.code)));

  for (const candidate of candidates) {
    const normalized = normalizeLocaleCode(candidate);
    if (normalizedSupported.has(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

export function defaultLocale(locales: ReadonlyArray<CmsLocale>, fallback: string): string {
  const preferred = locales.find((locale) => locale.default === true);
  return normalizeLocaleCode(preferred?.code ?? fallback);
}

