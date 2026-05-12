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

export type LocaleLike = CmsLocale | string;

export interface AlternateLocaleTarget {
  readonly locale: string;
  readonly hrefLang: string;
}

export interface ResolveAlternateLocaleTargetsInput {
  readonly localeSegmentStrategy: "none" | "language" | "country-language";
  readonly locales: ReadonlyArray<LocaleLike>;
  readonly languages?: ReadonlyArray<string>;
  readonly countries?: ReadonlyArray<string>;
}

interface NormalizedLocaleLike {
  readonly code: string;
  readonly language: string;
  readonly country?: string;
  readonly default?: boolean;
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

function normalizeLocaleLike(locale: LocaleLike): NormalizedLocaleLike {
  if (typeof locale === "string") {
    const normalizedCode = normalizeLocaleCode(locale);
    const parsed = parseLocaleCode(normalizedCode);
    return {
      code: normalizedCode,
      language: parsed.language,
      ...(parsed.country ? { country: parsed.country } : {}),
    };
  }

  const normalizedCode = normalizeLocaleCode(locale.code);
  const parsed = parseLocaleCode(normalizedCode);
  const language = locale.language.trim().toLowerCase() || parsed.language;
  const country = locale.country?.trim().toUpperCase() ?? parsed.country;

  return {
    code: normalizedCode,
    language,
    ...(country ? { country } : {}),
    ...(locale.default === true ? { default: true } : {}),
  };
}

function collectLanguages(
  locales: ReadonlyArray<NormalizedLocaleLike>,
  explicitLanguages: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> {
  const fromInput = (explicitLanguages ?? [])
    .map((entry) => parseLocaleCode(entry.trim()).language)
    .filter((entry) => entry.length > 0);
  const fromLocales = locales
    .map((entry) => parseLocaleCode(entry.code).language || entry.language)
    .filter((entry) => entry.length > 0);

  return uniqueOrdered([...fromInput, ...fromLocales]);
}

function collectCountries(
  locales: ReadonlyArray<NormalizedLocaleLike>,
  explicitCountries: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> {
  const fromInput = (explicitCountries ?? [])
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
  const fromLocales = locales
    .map((entry) => entry.country ?? parseLocaleCode(entry.code).country)
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .map((entry) => entry.toUpperCase());

  return uniqueOrdered([...fromInput, ...fromLocales]);
}

function defaultLanguageLocaleCode(
  language: string,
  locales: ReadonlyArray<NormalizedLocaleLike>,
): string {
  const exact = locales.find((entry) => entry.code === language);
  if (exact) {
    return exact.code;
  }

  const languageDefault = locales.find((entry) => {
    return entry.language === language && entry.default === true;
  });
  if (languageDefault) {
    return languageDefault.code;
  }

  const firstMatch = locales.find((entry) => entry.language === language);
  if (firstMatch) {
    return firstMatch.code;
  }

  return language;
}

export function resolveAlternateLocaleTargets(
  input: ResolveAlternateLocaleTargetsInput,
): ReadonlyArray<AlternateLocaleTarget> {
  const byCode = new Map<string, NormalizedLocaleLike>();
  for (const entry of input.locales) {
    const normalized = normalizeLocaleLike(entry);
    const current = byCode.get(normalized.code);

    if (!current) {
      byCode.set(normalized.code, normalized);
      continue;
    }

    byCode.set(normalized.code, {
      code: normalized.code,
      language: normalized.language || current.language,
      ...(normalized.country ?? current.country ? { country: normalized.country ?? current.country } : {}),
      ...(normalized.default === true || current.default === true ? { default: true } : {}),
    });
  }

  const locales = Array.from(byCode.values());
  const languages = collectLanguages(locales, input.languages);
  const countries = collectCountries(locales, input.countries);

  if (input.localeSegmentStrategy === "language") {
    return languages.map((language) => ({
      locale: defaultLanguageLocaleCode(language, locales),
      hrefLang: language,
    }));
  }

  if (input.localeSegmentStrategy === "country-language" && languages.length > 0 && countries.length > 0) {
    const targets: AlternateLocaleTarget[] = [];

    for (const country of countries) {
      for (const language of languages) {
        const locale = toLocaleCode({
          language,
          country,
        });

        targets.push({
          locale,
          hrefLang: locale,
        });
      }
    }

    return uniqueOrdered(
      targets.map((entry) => `${entry.locale}|${entry.hrefLang}`),
    ).map((key) => {
      const [locale = "", hrefLang = ""] = key.split("|");
      return {
        locale,
        hrefLang,
      };
    });
  }

  return locales.map((entry) => ({
    locale: entry.code,
    hrefLang: entry.code,
  }));
}
