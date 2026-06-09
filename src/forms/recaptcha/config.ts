import type { OminityForm, OminityFormField, RecaptchaConfig } from "../types.js";
import {
  getDefaultRecaptchaClientApiNamespace,
  getDefaultRecaptchaScriptUrl,
  normalizeRecaptchaProvider,
  normalizeRecaptchaVersion,
} from "./runtime.js";

const asRecord = (input: unknown): Record<string, unknown> | null =>
  typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;

const asNonEmptyString = (input: unknown): string | null => {
  if (typeof input !== "string") {
    return null;
  }

  const value = input.trim();
  return value.length > 0 ? value : null;
};

const getExpectedAction = (options: Record<string, unknown>): string | undefined =>
  asNonEmptyString(options.expectedAction) ?? asNonEmptyString(options.expected_action) ?? undefined;

const getScriptUrl = (options: Record<string, unknown>): string | null =>
  asNonEmptyString(options.scriptUrl) ?? asNonEmptyString(options.script_url);

const getClientApiNamespace = (options: Record<string, unknown>): string | null =>
  asNonEmptyString(options.clientApiNamespace) ??
  asNonEmptyString(options.client_api_namespace);

const normalizeBadge = (
  input: unknown,
): "bottomright" | "bottomleft" | "inline" | undefined => {
  if (typeof input !== "string") {
    return undefined;
  }

  const value = input.trim().toLowerCase();
  if (value === "bottomright" || value === "bottomleft" || value === "inline") {
    return value;
  }

  return undefined;
};

const normalizeTheme = (input: unknown): "light" | "dark" | undefined => {
  if (typeof input !== "string") {
    return undefined;
  }

  const value = input.trim().toLowerCase();
  if (value === "light" || value === "dark") {
    return value;
  }

  return undefined;
};

const normalizeCheckboxSize = (
  input: unknown,
): "compact" | "normal" | undefined => {
  if (typeof input !== "string") {
    return undefined;
  }

  const value = input.trim().toLowerCase();
  if (value === "compact" || value === "normal") {
    return value;
  }

  return undefined;
};

const normalizeTabIndex = (input: unknown): number | undefined => {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.trunc(input);
  }

  if (typeof input === "string" && input.trim().length > 0) {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return undefined;
};

export const deriveFormRecaptchaConfig = (
  form: OminityForm,
): RecaptchaConfig | undefined => {
  const recaptchaField = form?._embedded?.form_fields?.find(
    (field) => field.type === "recaptcha",
  );
  if (!recaptchaField) {
    return undefined;
  }

  const options = asRecord(recaptchaField.options);
  if (!options) {
    return undefined;
  }

  const siteKey =
    asNonEmptyString(options.siteKey) ?? asNonEmptyString(options.site_key);
  if (!siteKey) {
    return undefined;
  }

  const scriptUrlInput = getScriptUrl(options);
  const clientApiNamespaceInput = getClientApiNamespace(options);
  const provider = normalizeRecaptchaProvider(
    options.provider,
    clientApiNamespaceInput,
    scriptUrlInput,
  );
  const scriptUrl =
    scriptUrlInput ?? getDefaultRecaptchaScriptUrl(provider);
  const clientApiNamespace =
    clientApiNamespaceInput ??
    getDefaultRecaptchaClientApiNamespace(provider);
  const version = normalizeRecaptchaVersion(options.version);
  const badge = normalizeBadge(options.badge);
  const baseConfig = {
    siteKey,
    provider,
    scriptUrl,
    clientApiNamespace,
    ...(badge ? { badge } : {}),
  };

  if (version === "v2-checkbox") {
    const theme = normalizeTheme(options.theme);
    const size = normalizeCheckboxSize(options.size);
    const tabIndex = normalizeTabIndex(options.tabIndex ?? options.tabindex);

    return {
      version: "v2-checkbox",
      ...baseConfig,
      ...(theme ? { theme } : {}),
      ...(size ? { size } : {}),
      ...(typeof tabIndex === "number" ? { tabIndex } : {}),
    };
  }

  const action = getExpectedAction(options);
  if (version === "v2-invisible") {
    return {
      version: "v2-invisible",
      ...baseConfig,
      ...(action ? { action } : {}),
    };
  }

  return {
    version: "v3",
    ...baseConfig,
    ...(action ? { action } : {}),
  };
};

export const resolveFormRecaptchaConfig = (
  form: OminityForm,
  override?: RecaptchaConfig,
): RecaptchaConfig | undefined => override ?? deriveFormRecaptchaConfig(form);

export const isRecaptchaField = (field: OminityFormField): boolean =>
  field.type === "recaptcha";
