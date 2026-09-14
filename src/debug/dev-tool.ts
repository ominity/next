import { SDK_VERSION } from "@ominity/api-typescript";

import type { CmsChannel, CmsLocale } from "../cms/index.js";
import { OMINITY_NEXT_PACKAGE_VERSION } from "./package-info.js";
import type {
  OminityDebugChannelInfo,
  OminityDebugConfigHealthInfo,
  OminityDebugFlag,
  OminityDebugHealthCheck,
  OminityDebugIntegrationInfo,
  OminityDebugSnapshot,
  OminityDebugSource,
  OminityDebugTheme,
} from "./types.js";

export type OminityDevToolConfigHealthInfo = OminityDebugConfigHealthInfo;
export type OminityDevToolChannelInfo = OminityDebugChannelInfo;
export type OminityDevToolFlag = OminityDebugFlag;
export type OminityDevToolHealthCheck = OminityDebugHealthCheck;
export type OminityDevToolIntegrationInfo = OminityDebugIntegrationInfo;
export type OminityDevToolSnapshot = OminityDebugSnapshot;
export type OminityDevToolSource = OminityDebugSource;
export type OminityDevToolTheme = OminityDebugTheme;

export interface OminityDevToolEnvironmentRequirement {
  readonly name: string;
  readonly value?: unknown;
  readonly required?: boolean;
  readonly message?: string;
}

export interface CreateOminityDevToolSnapshotOptions {
  readonly appName?: string;
  readonly environment?: string;
  readonly runtime?: string;
  readonly packageName?: string;
  readonly packageVersion?: string;
  readonly sdkVersion?: string;
  readonly nextVersion?: string;
  readonly apiUrl?: string;
  readonly basePath?: string;
  readonly route?: string;
  readonly locale?: string;
  readonly mockData?: boolean;
  readonly debugLogs?: boolean;
  readonly enabled?: boolean;
  readonly flags?: ReadonlyArray<OminityDebugFlag>;
  readonly integrationDetails?: Readonly<Record<string, unknown>>;
  readonly mode?: "mock" | "live" | "hybrid" | "unknown";
  readonly channelId?: string;
  readonly localeSegmentStrategy?: string;
  readonly trailingSlash?: boolean;
  readonly canonicalRedirectPolicy?: string;
  readonly draftMode?: boolean;
  readonly previewMode?: boolean;
  readonly requiredEnvironment?: ReadonlyArray<OminityDevToolEnvironmentRequirement>;
  readonly unsafeWarnings?: ReadonlyArray<string>;
  readonly healthChecks?: ReadonlyArray<OminityDebugHealthCheck>;
  readonly healthDetails?: Readonly<Record<string, unknown>>;
}

export interface CreateOminityDevToolChannelInfoOptions {
  readonly channel: CmsChannel;
  readonly source?: OminityDebugChannelInfo["source"];
  readonly defaultLocale: string;
  readonly locales: ReadonlyArray<CmsLocale>;
  readonly languages?: ReadonlyArray<string>;
  readonly countries?: ReadonlyArray<string>;
  readonly currencies?: ReadonlyArray<string>;
  readonly countryCurrencyMap?: Readonly<Record<string, string>>;
}

function hasConfiguredValue(value: unknown): boolean {
  return value !== null
    && typeof value !== "undefined"
    && (typeof value !== "string" || value.trim().length > 0);
}

function uniqueStrings(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return Array.from(new Set(values));
}

export function createOminityDevToolChannelInfo(
  options: CreateOminityDevToolChannelInfoOptions,
): OminityDebugChannelInfo {
  const channel = options.channel;

  return {
    id: channel.id,
    identifier: channel.identifier,
    name: channel.name,
    source: options.source ?? "detected",
    ...(typeof channel.active === "boolean" ? { active: channel.active } : {}),
    defaultLocale: options.defaultLocale,
    ...(channel.defaultLanguageCode
      ? { defaultLanguageCode: channel.defaultLanguageCode }
      : {}),
    ...(channel.defaultCountryCode
      ? { defaultCountryCode: channel.defaultCountryCode }
      : {}),
    ...(channel.defaultCurrencyCode
      ? { defaultCurrencyCode: channel.defaultCurrencyCode }
      : {}),
    locales: options.locales.map((locale) => ({
      code: locale.code,
      language: locale.language,
      ...(locale.country ? { country: locale.country } : {}),
      ...(locale.label ? { label: locale.label } : {}),
      ...(typeof locale.default === "boolean" ? { default: locale.default } : {}),
    })),
    languages: channel.languages.map((language) => ({
      code: language.code,
      label: language.name,
      ...(language.localeTerritory ? { country: language.localeTerritory } : {}),
      ...(typeof language.default === "boolean" ? { default: language.default } : {}),
      ...(typeof language.active === "boolean" ? { active: language.active } : {}),
    })),
    countries: channel.countries.map((country) => ({
      code: country.code,
      name: country.name,
      ...(country.currency ? { currency: country.currency } : {}),
      ...(typeof country.default === "boolean" ? { default: country.default } : {}),
      ...(typeof country.enabled === "boolean" ? { active: country.enabled } : {}),
    })),
    currencies: channel.currencies.map((currency) => ({
      code: currency.code,
      ...(currency.name ? { name: currency.name } : {}),
      ...(currency.symbol ? { symbol: currency.symbol } : {}),
      ...(typeof currency.default === "boolean" ? { default: currency.default } : {}),
    })),
    ...(options.countryCurrencyMap
      ? { countryCurrencyMap: options.countryCurrencyMap }
      : {}),
    details: {
      ...(channel.details ?? {}),
      availableLanguages: options.languages ?? [],
      availableCountries: options.countries ?? [],
      availableCurrencies: options.currencies ?? [],
    },
  };
}

export function createOminityDevToolSnapshot(
  options: CreateOminityDevToolSnapshotOptions = {},
): OminityDebugSnapshot {
  const requirements = options.requiredEnvironment ?? [];
  const missingEnvironment = uniqueStrings(requirements
    .filter((requirement) => requirement.required !== false && !hasConfiguredValue(requirement.value))
    .map((requirement) => requirement.name));
  const requirementChecks = requirements.map<OminityDebugHealthCheck>((requirement) => {
    const configured = hasConfiguredValue(requirement.value);
    const required = requirement.required !== false;

    return {
      label: requirement.name,
      status: configured ? "enabled" : required ? "disabled" : "unknown",
      ...(configured || !required ? {} : { severity: "error" as const }),
      ...(requirement.message ? { message: requirement.message } : {}),
    };
  });
  const mode = options.mode
    ?? (options.mockData === true ? "mock" : options.mockData === false ? "live" : "unknown");

  return {
    integration: {
      ...(options.appName ? { appName: options.appName } : {}),
      ...(options.environment ? { environment: options.environment } : {}),
      ...(options.runtime ? { runtime: options.runtime } : {}),
      packageName: options.packageName ?? "@ominity/next",
      packageVersion: options.packageVersion ?? OMINITY_NEXT_PACKAGE_VERSION,
      sdkVersion: options.sdkVersion ?? SDK_VERSION,
      ...(options.nextVersion ? { nextVersion: options.nextVersion } : {}),
      ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
      ...(typeof options.basePath === "string" ? { basePath: options.basePath } : {}),
      ...(options.route ? { route: options.route } : {}),
      ...(options.locale ? { locale: options.locale } : {}),
      ...(typeof options.mockData === "boolean" ? { mockData: options.mockData } : {}),
      ...(typeof options.debugLogs === "boolean" ? { debugLogs: options.debugLogs } : {}),
      devTool: options.enabled ?? true,
      ...(options.flags ? { flags: options.flags } : {}),
      ...(options.integrationDetails ? { details: options.integrationDetails } : {}),
    },
    health: {
      mode,
      ...(options.environment ? { environment: options.environment } : {}),
      ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
      ...(options.channelId ? { channelId: options.channelId } : {}),
      ...(options.localeSegmentStrategy ? { localeSegmentStrategy: options.localeSegmentStrategy } : {}),
      ...(typeof options.basePath === "string" ? { basePath: options.basePath } : {}),
      ...(typeof options.trailingSlash === "boolean" ? { trailingSlash: options.trailingSlash } : {}),
      ...(options.canonicalRedirectPolicy ? { canonicalRedirectPolicy: options.canonicalRedirectPolicy } : {}),
      ...(typeof options.draftMode === "boolean" ? { draftMode: options.draftMode } : {}),
      ...(typeof options.previewMode === "boolean" ? { previewMode: options.previewMode } : {}),
      unsafeWarnings: uniqueStrings(options.unsafeWarnings ?? []),
      missingEnvironment,
      checks: [...requirementChecks, ...(options.healthChecks ?? [])],
      ...(options.healthDetails ? { details: options.healthDetails } : {}),
    },
  };
}

export function countOminityDevToolErrors(
  snapshot: OminityDebugSnapshot,
  requestErrors = 0,
  endpointError: string | null = null,
): number {
  const explicitHealthErrorLabels = new Set((snapshot.health?.checks ?? [])
    .filter((check) => check.severity === "error" && check.status !== "enabled")
    .map((check) => check.label));
  const missingWithoutCheck = (snapshot.health?.missingEnvironment ?? [])
    .filter((name) => !explicitHealthErrorLabels.has(name))
    .length;
  const healthErrors = explicitHealthErrorLabels.size + missingWithoutCheck;

  return Math.max(0, Math.floor(requestErrors))
    + healthErrors
    + (endpointError ? 1 : 0);
}

export { OMINITY_NEXT_PACKAGE_VERSION };
