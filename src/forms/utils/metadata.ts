import {
  type MetadataFieldOption,
  type MetadataValue,
  type OminityFormField,
} from "../types.js";

export const SERVER_ENRICHED_METADATA_KEYS: MetadataFieldOption[] = [
  "ip_address",
  "user_agent",
];

export const METADATA_KEYS: MetadataFieldOption[] = [
  "page_url",
  "page_title",
  "referrer",
  "user_agent",
  "locale",
  "ip_address",
];

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const normalizeMetadataLocale = (input?: string | null): string | null => {
  const value = asNonEmptyString(input);
  if (!value) {
    return null;
  }

  const [language = ""] = value.replace(/_/g, "-").split("-");
  const normalizedLanguage = language.trim().toLowerCase();

  return normalizedLanguage.length > 0 ? normalizedLanguage : null;
};

const getClientLocale = (explicit?: string): string | null => {
  const explicitLocale = normalizeMetadataLocale(explicit);
  if (explicitLocale) {
    return explicitLocale;
  }

  if (typeof navigator !== "undefined") {
    return normalizeMetadataLocale(navigator.language);
  }

  return null;
};

export const collectClientMetadata = (
  locale?: string,
): MetadataValue => {
  if (typeof window === "undefined") {
    return {};
  }

  return {
    page_url: window.location?.href || null,
    page_title: window.document?.title || null,
    referrer: window.document?.referrer || null,
    user_agent: window.navigator?.userAgent || null,
    locale: getClientLocale(locale),
  };
};

export const buildMetadataPayload = (
  field: OminityFormField,
  overrides: MetadataValue | undefined,
  clientMetadata: MetadataValue,
): MetadataValue => {
  const requested = Array.isArray(field.options)
    ? (field.options as string[])
    : [];

  const payload: MetadataValue = {};

  requested.forEach((key) => {
    const metadataKey = key as MetadataFieldOption;
    if (SERVER_ENRICHED_METADATA_KEYS.includes(metadataKey)) {
      return;
    }

    const value =
      overrides?.[metadataKey] ??
      clientMetadata[metadataKey] ??
      "";

    payload[metadataKey] =
      metadataKey === "locale" ? (normalizeMetadataLocale(value) ?? "") : value;
  });

  return payload;
};
