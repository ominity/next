import {
  type MetadataFieldOption,
  type MetadataValue,
  type OminityFormField,
} from "../types.js";

export const METADATA_KEYS: MetadataFieldOption[] = [
  "page_url",
  "page_title",
  "referrer",
  "user_agent",
  "locale",
  "ip_address",
];

const getClientLocale = (explicit?: string): string | null => {
  if (explicit) {
    return explicit;
  }
  if (typeof navigator !== "undefined") {
    return navigator.language || null;
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
    payload[metadataKey] =
      overrides?.[metadataKey] ??
      clientMetadata[metadataKey] ??
      (metadataKey === "ip_address" ? null : "");
  });

  return payload;
};

export const needsClientIp = (fields: OminityFormField[]): boolean =>
  fields.some(
    (field) =>
      field.type === "metadata" &&
      Array.isArray(field.options) &&
      (field.options as string[]).includes("ip_address"),
  );

export const fetchClientIp = async (): Promise<string | null> => {
  if (typeof fetch === "undefined") {
    return null;
  }

  try {
    const response = await fetch("https://api.ipify.org?format=json");
    if (!response.ok) {
      return null;
    }
    const json = (await response.json()) as { ip?: string };
    return json.ip || null;
  } catch {
    return null;
  }
};
