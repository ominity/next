import { localeCountry, normalizeLocaleCode, parseLocaleCode } from "./locales/index.js";
import type { CmsChannel, CmsLocale } from "./types.js";

export interface ResolveCurrencyForCountryInput {
  readonly country?: string;
  readonly locale?: string;
  readonly channel: Pick<CmsChannel, "countries" | "currencies" | "defaultCurrencyCode">;
  readonly fallbackCurrency?: string;
}

export function toApiLanguage(input: string): string {
  const parsed = parseLocaleCode(normalizeLocaleCode(input));
  return parsed.language;
}

export function resolveApiLanguage(
  input: string | null | undefined,
  fallback?: string,
): string | undefined {
  if (typeof input === "string" && input.trim().length > 0) {
    const language = toApiLanguage(input);
    if (language.length > 0) {
      return language;
    }
  }

  if (typeof fallback === "string" && fallback.trim().length > 0) {
    const language = toApiLanguage(fallback);
    if (language.length > 0) {
      return language;
    }
  }

  return undefined;
}

export function collectLanguages(locales: ReadonlyArray<CmsLocale>): ReadonlyArray<string> {
  const unique = new Set<string>();
  for (const locale of locales) {
    const language = parseLocaleCode(normalizeLocaleCode(locale.code)).language;
    if (language.length > 0) {
      unique.add(language);
    }
  }
  return Array.from(unique.values());
}

export function resolveLocaleForLanguage(
  locales: ReadonlyArray<CmsLocale>,
  language: string,
  fallbackLocale?: string,
): string | undefined {
  const normalizedLanguage = language.trim().toLowerCase();
  if (normalizedLanguage.length === 0) {
    return typeof fallbackLocale === "string" ? normalizeLocaleCode(fallbackLocale) : undefined;
  }

  const matches = locales.filter((locale) => {
    return parseLocaleCode(normalizeLocaleCode(locale.code)).language === normalizedLanguage;
  });

  if (matches.length === 0) {
    return typeof fallbackLocale === "string" ? normalizeLocaleCode(fallbackLocale) : undefined;
  }

  const explicitDefault = matches.find((entry) => entry.default === true);
  if (explicitDefault) {
    return normalizeLocaleCode(explicitDefault.code);
  }

  const languageOnly = matches.find((entry) => localeCountry(entry.code) === undefined);
  if (languageOnly) {
    return normalizeLocaleCode(languageOnly.code);
  }

  return normalizeLocaleCode(matches[0]!.code);
}

export function resolveLocaleForLanguageAndCountry(
  locales: ReadonlyArray<CmsLocale>,
  language: string,
  country: string,
  fallbackLocale?: string,
): string | undefined {
  const normalizedLanguage = language.trim().toLowerCase();
  const normalizedCountry = country.trim().toUpperCase();
  if (normalizedLanguage.length === 0 || normalizedCountry.length === 0) {
    return resolveLocaleForLanguage(locales, normalizedLanguage, fallbackLocale);
  }

  const exact = locales.find((locale) => {
    const parsed = parseLocaleCode(normalizeLocaleCode(locale.code));
    return parsed.language === normalizedLanguage && parsed.country === normalizedCountry;
  });
  if (exact) {
    return normalizeLocaleCode(exact.code);
  }

  return resolveLocaleForLanguage(locales, normalizedLanguage, fallbackLocale);
}

export function resolveCountryFromLocale(locale: string | undefined): string | undefined {
  if (typeof locale !== "string" || locale.trim().length === 0) {
    return undefined;
  }

  const parsed = parseLocaleCode(normalizeLocaleCode(locale));
  return parsed.country;
}

export function resolveCurrencyForCountry(input: ResolveCurrencyForCountryInput): string | undefined {
  const availableCurrencySet = new Set(
    input.channel.currencies.map((entry) => entry.code.trim().toUpperCase()).filter((entry) => entry.length > 0),
  );
  const isAllowedCurrency = (currency: string): boolean => {
    if (availableCurrencySet.size === 0) {
      return true;
    }
    return availableCurrencySet.has(currency);
  };

  const preferredCountry = typeof input.country === "string" && input.country.trim().length > 0
    ? input.country.trim().toUpperCase()
    : resolveCountryFromLocale(input.locale);
  if (preferredCountry) {
    const fromCountry = input.channel.countries.find((entry) => entry.code.toUpperCase() === preferredCountry);
    const countryCurrency = fromCountry?.currency?.trim().toUpperCase();
    if (countryCurrency && isAllowedCurrency(countryCurrency)) {
      return countryCurrency;
    }
  }

  const defaultCurrency = input.channel.defaultCurrencyCode?.trim().toUpperCase();
  if (defaultCurrency && isAllowedCurrency(defaultCurrency)) {
    return defaultCurrency;
  }

  const firstAvailableCurrency = input.channel.currencies
    .map((entry) => entry.code.trim().toUpperCase())
    .find((entry) => entry.length > 0);
  if (firstAvailableCurrency) {
    return firstAvailableCurrency;
  }

  if (typeof input.fallbackCurrency === "string") {
    const fallbackCurrency = input.fallbackCurrency.trim().toUpperCase();
    if (fallbackCurrency.length > 0) {
      return fallbackCurrency;
    }
  }

  return undefined;
}
