import type { OminityForm, OminityFormField, RecaptchaConfig } from "../types.js";

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

const normalizeRecaptchaVersion = (input: unknown): "v3" | "v2-checkbox" => {
  if (typeof input !== "string") {
    return "v3";
  }

  const value = input.trim().toLowerCase();
  if (value === "v2_checkbox" || value === "v2-checkbox") {
    return "v2-checkbox";
  }

  return "v3";
};

const getExpectedAction = (options: Record<string, unknown>): string | undefined =>
  asNonEmptyString(options.expectedAction) ?? asNonEmptyString(options.expected_action) ?? undefined;

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

  const version = normalizeRecaptchaVersion(options.version);
  if (version === "v2-checkbox") {
    return {
      version: "v2-checkbox",
      siteKey,
    };
  }

  const action = getExpectedAction(options);
  return {
    version: "v3",
    siteKey,
    ...(action ? { action } : {}),
  };
};

export const resolveFormRecaptchaConfig = (
  form: OminityForm,
  override?: RecaptchaConfig,
): RecaptchaConfig | undefined => override ?? deriveFormRecaptchaConfig(form);

export const isRecaptchaField = (field: OminityFormField): boolean =>
  field.type === "recaptcha";
