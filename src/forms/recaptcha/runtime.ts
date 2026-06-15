import type {
  RecaptchaConfig,
  RecaptchaProvider,
  RecaptchaVersion,
} from "../types.js";

export interface RecaptchaApi {
  ready: (callback: () => void) => void;
  render?: (container: HTMLElement, params: Record<string, unknown>) => number;
  execute?: (
    siteKeyOrWidgetId: string | number,
    options?: Record<string, unknown>,
  ) => Promise<string>;
  reset?: (widgetId?: number) => void;
}

interface RecaptchaRuntimeOptions {
  provider?: RecaptchaProvider;
  clientApiNamespace?: string;
  scriptUrl?: string;
}

const DEFAULT_CLASSIC_SCRIPT_URL = "https://www.google.com/recaptcha/api.js";
const DEFAULT_ENTERPRISE_SCRIPT_URL =
  "https://www.google.com/recaptcha/enterprise.js";
const DEFAULT_CLASSIC_NAMESPACE = "grecaptcha";
const DEFAULT_ENTERPRISE_NAMESPACE = "grecaptcha.enterprise";

const asNonEmptyString = (input: unknown): string | null => {
  if (typeof input !== "string") {
    return null;
  }

  const value = input.trim();
  return value.length > 0 ? value : null;
};

const setQueryParam = (url: string, key: string, value: string): string => {
  try {
    const nextUrl = new URL(url);
    nextUrl.searchParams.set(key, value);
    return nextUrl.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
};

export const normalizeRecaptchaVersion = (input: unknown): RecaptchaVersion => {
  if (typeof input !== "string") {
    return "v3";
  }

  const value = input.trim().toLowerCase().replace(/_/g, "-");
  if (value === "v2" || value === "v2-checkbox" || value === "checkbox") {
    return "v2-checkbox";
  }
  if (value === "v2-invisible" || value === "invisible") {
    return "v2-invisible";
  }

  return "v3";
};

export const normalizeRecaptchaProvider = (
  input: unknown,
  namespaceInput?: unknown,
  scriptUrlInput?: unknown,
): RecaptchaProvider => {
  if (typeof input === "string") {
    const value = input.trim().toLowerCase();
    if (value === "enterprise") {
      return "enterprise";
    }
    if (value === "classic") {
      return "classic";
    }
  }

  const namespace = asNonEmptyString(namespaceInput)?.toLowerCase();
  if (namespace?.includes("enterprise")) {
    return "enterprise";
  }

  const scriptUrl = asNonEmptyString(scriptUrlInput)?.toLowerCase();
  if (scriptUrl?.includes("/enterprise.js")) {
    return "enterprise";
  }

  return "classic";
};

export const getDefaultRecaptchaScriptUrl = (
  provider: RecaptchaProvider,
): string =>
  provider === "enterprise"
    ? DEFAULT_ENTERPRISE_SCRIPT_URL
    : DEFAULT_CLASSIC_SCRIPT_URL;

export const getDefaultRecaptchaClientApiNamespace = (
  provider: RecaptchaProvider,
): string =>
  provider === "enterprise"
    ? DEFAULT_ENTERPRISE_NAMESPACE
    : DEFAULT_CLASSIC_NAMESPACE;

export const resolveRecaptchaProvider = (
  config: RecaptchaRuntimeOptions,
): RecaptchaProvider =>
  normalizeRecaptchaProvider(
    config.provider,
    config.clientApiNamespace,
    config.scriptUrl,
  );

export const resolveRecaptchaScriptUrl = (
  config: RecaptchaRuntimeOptions,
): string =>
  asNonEmptyString(config.scriptUrl) ??
  getDefaultRecaptchaScriptUrl(resolveRecaptchaProvider(config));

export const resolveRecaptchaClientApiNamespace = (
  config: RecaptchaRuntimeOptions,
): string =>
  asNonEmptyString(config.clientApiNamespace) ??
  getDefaultRecaptchaClientApiNamespace(resolveRecaptchaProvider(config));

export const buildRecaptchaScriptSrc = (config: RecaptchaConfig): string => {
  const renderValue = config.version === "v3" ? config.siteKey : "explicit";
  return setQueryParam(resolveRecaptchaScriptUrl(config), "render", renderValue);
};

const isRecaptchaApi = (input: unknown): input is RecaptchaApi => {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  const api = input as Record<string, unknown>;
  return typeof api.ready === "function";
};

export const hasRecaptchaExecuteApi = (
  api: RecaptchaApi | null,
): api is RecaptchaApi & Required<Pick<RecaptchaApi, "execute">> =>
  Boolean(api && typeof api.execute === "function");

export const hasRecaptchaWidgetApi = (
  api: RecaptchaApi | null,
): api is RecaptchaApi & Required<Pick<RecaptchaApi, "render" | "reset">> =>
  Boolean(
    api &&
      typeof api.render === "function" &&
      typeof api.reset === "function",
  );

export const resolveRecaptchaApi = (
  root: unknown,
  namespace: string,
): RecaptchaApi | null => {
  const normalizedNamespace =
    asNonEmptyString(namespace)?.replace(/^window\./, "") ?? "";
  if (!normalizedNamespace) {
    return null;
  }

  const resolved = normalizedNamespace.split(".").reduce<unknown>(
    (current, segment) => {
      if (
        (typeof current !== "object" && typeof current !== "function") ||
        current === null
      ) {
        return null;
      }

      return (current as Record<string, unknown>)[segment] ?? null;
    },
    root,
  );

  return isRecaptchaApi(resolved) ? resolved : null;
};
