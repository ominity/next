import { Ominity } from "@ominity/api-typescript";

import { createCmsDebugLogger } from "./debug.js";
import { CmsClientError } from "./errors.js";
import { normalizeLocaleCode, parseLocaleCode, toLocaleCode } from "./locales/index.js";
import { defaultCmsNormalizers } from "./normalize.js";
import type {
  CmsChannel,
  CmsClient,
  CmsClientEndpoints,
  CmsClientOptions,
  CmsClientQueryParamNames,
  CmsClientQueryParams,
  CmsGetChannelInput,
  CmsLocale,
  CmsResponseNormalizers,
} from "./types.js";

const DEFAULT_CHANNEL_INCLUDE = "languages,countries,default_language,default_country";

const defaultEndpoints: CmsClientEndpoints = {
  pageByPath: "/cms/pages",
  routes: "/cms/routes",
  menus: "/cms/menus",
  locales: "/localization/languages",
  channelCurrent: "/channels/current",
};

const defaultQueryParamNames: CmsClientQueryParamNames = {
  path: "path",
  locale: "locale",
  preview: "preview",
  menuKey: "key",
  include: "include",
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function mergeNormalizers(input: Partial<CmsResponseNormalizers> | undefined): CmsResponseNormalizers {
  return {
    page: input?.page ?? defaultCmsNormalizers.page,
    routes: input?.routes ?? defaultCmsNormalizers.routes,
    menus: input?.menus ?? defaultCmsNormalizers.menus,
    locales: input?.locales ?? defaultCmsNormalizers.locales,
    channel: input?.channel ?? defaultCmsNormalizers.channel,
  };
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

function pathToSlug(path: string): string {
  const normalizedPath = normalizePath(path);
  if (normalizedPath === "/") {
    return "";
  }

  return normalizedPath.replace(/^\//, "");
}

function buildQuery(
  queryParamNames: CmsClientQueryParamNames,
  params: CmsClientQueryParams,
  options: {
    includePathSlugFallback?: boolean;
  } = {},
): Readonly<Record<string, string>> {
  const query: Record<string, string> = {};

  if (params.path) {
    query[queryParamNames.path] = params.path;

    if (options.includePathSlugFallback) {
      const slug = pathToSlug(params.path);
      if (slug.length > 0) {
        query["filter[slug]"] = slug;
      }
    }
  }

  if (params.locale) {
    query[queryParamNames.locale] = params.locale;
  }

  if (typeof params.preview === "boolean") {
    query[queryParamNames.preview] = params.preview ? "true" : "false";
  }

  if (params.key) {
    query[queryParamNames.menuKey] = params.key;
  }

  if (params.include) {
    query[queryParamNames.include] = params.include;
  }

  return query;
}

function buildHeaders(input: {
  locale?: string;
  channelId?: string;
  requestId?: string;
}): Headers {
  const headers = new Headers();

  if (input.locale) {
    headers.set("Accept-Language", input.locale);
  }

  if (input.channelId) {
    headers.set("X-Channel-Id", input.channelId);
  }

  if (input.requestId) {
    headers.set("X-Request-Id", input.requestId);
  }

  return headers;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function unwrapCollection(value: unknown, keys: ReadonlyArray<string>): ReadonlyArray<unknown> {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  const embedded = value._embedded;
  if (!isRecord(embedded)) {
    return [];
  }

  for (const key of keys) {
    const candidate = embedded[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function shouldTreatPagePayloadAsNotFound(payload: unknown): boolean {
  if (payload === null) {
    return true;
  }

  const pages = unwrapCollection(payload, ["pages", "items", "data"]);
  if (pages.length === 0 && isRecord(payload) && payload.count === 0) {
    return true;
  }

  return pages.length === 0 && Array.isArray(payload);
}

function normalizeLocaleEntry(input: CmsLocale): CmsLocale {
  const normalizedCode = normalizeLocaleCode(input.code);
  const parsed = parseLocaleCode(normalizedCode);
  const country = input.country ?? parsed.country;

  return {
    code: normalizedCode,
    language: input.language.length > 0 ? input.language : parsed.language,
    ...(typeof country === "string" ? { country } : {}),
    ...(typeof input.label === "string" ? { label: input.label } : {}),
    ...(input.default === true ? { default: true } : {}),
  };
}

function mergeLocaleEntry(current: CmsLocale | undefined, incoming: CmsLocale): CmsLocale {
  const normalizedIncoming = normalizeLocaleEntry(incoming);
  if (!current) {
    return normalizedIncoming;
  }

  const normalizedCurrent = normalizeLocaleEntry(current);
  const language = normalizedIncoming.language || normalizedCurrent.language;
  const country = normalizedIncoming.country ?? normalizedCurrent.country;
  const label = normalizedIncoming.label ?? normalizedCurrent.label;
  const isDefault = normalizedIncoming.default === true || normalizedCurrent.default === true;

  return {
    code: normalizedIncoming.code,
    language,
    ...(typeof country === "string" ? { country } : {}),
    ...(typeof label === "string" ? { label } : {}),
    ...(isDefault ? { default: true } : {}),
  };
}

function localeFromChannelLanguage(language: CmsChannel["languages"][number]): CmsLocale {
  const normalizedLanguageCode = normalizeLocaleCode(language.code);
  const parsedLanguageCode = parseLocaleCode(normalizedLanguageCode);
  const localeCode = language.localeCode
    ? normalizeLocaleCode(language.localeCode)
    : normalizedLanguageCode;
  const parsedLocaleCode = parseLocaleCode(localeCode);
  const country = language.localeTerritory ?? parsedLocaleCode.country;

  return {
    code: localeCode,
    language: parsedLanguageCode.language,
    ...(typeof country === "string" ? { country } : {}),
    label: language.name,
    ...(language.default === true ? { default: true } : {}),
  };
}

function localeFromChannelCountry(country: CmsChannel["countries"][number]): CmsLocale | null {
  if (!country.language) {
    return null;
  }

  const parsedLanguage = parseLocaleCode(normalizeLocaleCode(country.language));
  if (parsedLanguage.language.length === 0) {
    return null;
  }

  const code = toLocaleCode({
    language: parsedLanguage.language,
    country: country.code.toUpperCase(),
  });

  return {
    code,
    language: parsedLanguage.language,
    country: country.code.toUpperCase(),
    ...(country.default === true ? { default: true } : {}),
  };
}

function defaultLocaleCandidatesFromChannel(channel: CmsChannel): ReadonlyArray<string> {
  const candidates: string[] = [];
  const defaultLanguage = channel.defaultLanguageCode;
  const defaultCountry = channel.defaultCountryCode;

  if (defaultLanguage && defaultCountry) {
    const parsed = parseLocaleCode(normalizeLocaleCode(defaultLanguage));
    if (parsed.language.length > 0) {
      candidates.push(toLocaleCode({
        language: parsed.language,
        country: defaultCountry.toUpperCase(),
      }));
    }
  }

  if (defaultLanguage) {
    candidates.push(normalizeLocaleCode(defaultLanguage));
  }

  for (const language of channel.languages) {
    if (language.default === true) {
      candidates.push(normalizeLocaleCode(language.code));
    }
  }

  return candidates;
}

function applyDefaultLocale(
  locales: ReadonlyArray<CmsLocale>,
  candidates: ReadonlyArray<string>,
): ReadonlyArray<CmsLocale> {
  if (locales.length === 0) {
    return locales;
  }

  const normalizedCandidates = Array.from(
    new Set(candidates.map((candidate) => normalizeLocaleCode(candidate))),
  );

  let defaultCode: string | undefined;
  for (const candidate of normalizedCandidates) {
    if (locales.some((locale) => normalizeLocaleCode(locale.code) === candidate)) {
      defaultCode = candidate;
      break;
    }
  }

  if (!defaultCode) {
    const existingDefault = locales.find((locale) => locale.default === true);
    if (existingDefault) {
      defaultCode = normalizeLocaleCode(existingDefault.code);
    }
  }

  if (!defaultCode) {
    defaultCode = normalizeLocaleCode(locales[0]?.code ?? "en");
  }

  return locales.map((locale) => {
    const normalized = normalizeLocaleEntry(locale);
    const isDefault = normalizeLocaleCode(normalized.code) === defaultCode;

    return {
      code: normalized.code,
      language: normalized.language,
      ...(typeof normalized.country === "string" ? { country: normalized.country } : {}),
      ...(typeof normalized.label === "string" ? { label: normalized.label } : {}),
      ...(isDefault ? { default: true } : {}),
    };
  });
}

function mergeLocalesWithChannel(
  locales: ReadonlyArray<CmsLocale>,
  channel: CmsChannel,
): ReadonlyArray<CmsLocale> {
  const merged = new Map<string, CmsLocale>();

  const channelLanguages = channel.languages.map((language) => parseLocaleCode(normalizeLocaleCode(language.code)).language);
  const hasChannelLanguageFilter = channelLanguages.length > 0;
  const allowedLanguages = new Set(channelLanguages.filter((language) => language.length > 0));

  for (const locale of locales) {
    const normalized = normalizeLocaleEntry(locale);
    const language = parseLocaleCode(normalized.code).language;

    if (hasChannelLanguageFilter && !allowedLanguages.has(language)) {
      continue;
    }

    merged.set(normalized.code, mergeLocaleEntry(merged.get(normalized.code), normalized));
  }

  for (const language of channel.languages) {
    const locale = localeFromChannelLanguage(language);
    merged.set(locale.code, mergeLocaleEntry(merged.get(locale.code), locale));
  }

  for (const country of channel.countries) {
    const locale = localeFromChannelCountry(country);
    if (!locale) {
      continue;
    }

    merged.set(locale.code, mergeLocaleEntry(merged.get(locale.code), locale));
  }

  const withDefaults = applyDefaultLocale(
    Array.from(merged.values()),
    defaultLocaleCandidatesFromChannel(channel),
  );

  return withDefaults;
}

export function createCmsClient(options: CmsClientOptions): CmsClient {
  const sdk = new Ominity(options.sdk);
  const endpoints = {
    ...defaultEndpoints,
    ...options.endpoints,
  };
  const queryParamNames = {
    ...defaultQueryParamNames,
    ...options.queryParamNames,
  };
  const normalizers = mergeNormalizers(options.normalizers);
  const debug = createCmsDebugLogger(options.debug, "cms-client");

  const requestJson = async (
    endpoint: string,
    params: CmsClientQueryParams,
    request: {
      locale?: string;
      channelId?: string;
      requestId?: string;
      allowNotFound?: boolean;
      includePathSlugFallback?: boolean;
    },
  ): Promise<Response> => {
    const query = buildQuery(
      queryParamNames,
      params,
      request.includePathSlugFallback === true ? { includePathSlugFallback: true } : {},
    );
    const headers = buildHeaders({
      ...(typeof request.locale === "string" ? { locale: request.locale } : {}),
      ...(typeof request.channelId === "string" ? { channelId: request.channelId } : {}),
      ...(typeof request.requestId === "string" ? { requestId: request.requestId } : {}),
    });

    debug.emit("debug", "Requesting CMS endpoint", {
      endpoint,
      query,
      headers: Object.fromEntries(headers.entries()),
    });

    try {
      return await sdk.http.get(endpoint, {
        query,
        headers,
        errorCodes: request.allowNotFound === true ? ["5XX"] : ["4XX", "5XX"],
      });
    } catch (error) {
      debug.emit("error", "CMS request failed", {
        endpoint,
        query,
        error,
      });

      throw new CmsClientError("CMS request failed", {
        cause: error,
        details: {
          endpoint,
          query,
        },
      });
    }
  };

  const fetchChannel = async (input: CmsGetChannelInput = {}): Promise<CmsChannel | null> => {
    const include = input.include ?? DEFAULT_CHANNEL_INCLUDE;
    const response = await requestJson(
      endpoints.channelCurrent,
      { include },
      {
        ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
        ...(typeof input.channelId === "string" ? { channelId: input.channelId } : {}),
        ...(typeof input.requestId === "string" ? { requestId: input.requestId } : {}),
        allowNotFound: true,
      },
    );

    if (response.status === 404) {
      debug.emit("info", "Current channel endpoint returned 404", {
        endpoint: endpoints.channelCurrent,
      });
      return null;
    }

    if (!response.ok) {
      throw new CmsClientError("CMS channel request returned non-success status", {
        details: {
          status: response.status,
          endpoint: endpoints.channelCurrent,
        },
      });
    }

    const payload = await parseResponseBody(response);
    if (payload === null) {
      return null;
    }

    const channel = normalizers.channel(payload);
    debug.emit("debug", "Normalized CMS channel", {
      channelId: channel.id,
      identifier: channel.identifier,
      languages: channel.languages.map((language) => language.code),
    });

    return channel;
  };

  return {
    ...(typeof options.sdk.language === "string" ? { sdkLanguage: options.sdk.language } : {}),
    ...(typeof options.sdk.channelId === "string" ? { sdkChannelId: options.sdk.channelId } : {}),

    async getPageByPath(input) {
      const response = await requestJson(
        endpoints.pageByPath,
        {
          path: input.path,
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.preview === "boolean" ? { preview: input.preview } : {}),
        },
        {
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.channelId === "string" ? { channelId: input.channelId } : {}),
          ...(typeof input.requestId === "string" ? { requestId: input.requestId } : {}),
          allowNotFound: true,
          includePathSlugFallback: true,
        },
      );

      if (response.status === 404) {
        debug.emit("info", "CMS page not found", {
          path: input.path,
          locale: input.locale,
        });
        return null;
      }

      if (!response.ok) {
        throw new CmsClientError("CMS page request returned non-success status", {
          details: {
            status: response.status,
            endpoint: endpoints.pageByPath,
          },
        });
      }

      const payload = await parseResponseBody(response);
      if (shouldTreatPagePayloadAsNotFound(payload)) {
        return null;
      }

      const page = normalizers.page(payload);
      debug.emit("debug", "Normalized CMS page", {
        pageId: page.id,
        path: page.path,
      });
      return page;
    },

    async getRoutes(input = {}) {
      const response = await requestJson(
        endpoints.routes,
        {
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.preview === "boolean" ? { preview: input.preview } : {}),
          ...(typeof input.include === "string" ? { include: input.include } : {}),
        },
        {
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.channelId === "string" ? { channelId: input.channelId } : {}),
          ...(typeof input.requestId === "string" ? { requestId: input.requestId } : {}),
          allowNotFound: true,
        },
      );

      if (response.status === 404) {
        return [];
      }

      if (!response.ok) {
        throw new CmsClientError("CMS routes request returned non-success status", {
          details: {
            status: response.status,
            endpoint: endpoints.routes,
          },
        });
      }

      const payload = await parseResponseBody(response);
      return normalizers.routes(payload);
    },

    async getMenus(input = {}) {
      const response = await requestJson(
        endpoints.menus,
        {
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.preview === "boolean" ? { preview: input.preview } : {}),
          ...(typeof input.key === "string" ? { key: input.key } : {}),
          ...(typeof input.include === "string" ? { include: input.include } : {}),
        },
        {
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.channelId === "string" ? { channelId: input.channelId } : {}),
          ...(typeof input.requestId === "string" ? { requestId: input.requestId } : {}),
          allowNotFound: true,
        },
      );

      if (response.status === 404) {
        return [];
      }

      if (!response.ok) {
        throw new CmsClientError("CMS menus request returned non-success status", {
          details: {
            status: response.status,
            endpoint: endpoints.menus,
          },
        });
      }

      const payload = await parseResponseBody(response);
      return normalizers.menus(payload);
    },

    async getLocales(input = {}) {
      let channel: CmsChannel | null = null;

      try {
        channel = await fetchChannel({
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.channelId === "string" ? { channelId: input.channelId } : {}),
          ...(typeof input.requestId === "string" ? { requestId: input.requestId } : {}),
          include: DEFAULT_CHANNEL_INCLUDE,
        });
      } catch (error) {
        debug.emit("warn", "Unable to fetch channel while resolving locales", {
          error,
        });
      }

      const fetchLocalesFromEndpoint = async (endpoint: string): Promise<ReadonlyArray<CmsLocale> | null> => {
        const response = await requestJson(
          endpoint,
          {
            ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
            ...(typeof input.preview === "boolean" ? { preview: input.preview } : {}),
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          },
          {
            ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
            ...(typeof input.channelId === "string" ? { channelId: input.channelId } : {}),
            ...(typeof input.requestId === "string" ? { requestId: input.requestId } : {}),
            allowNotFound: true,
          },
        );

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new CmsClientError("CMS locales request returned non-success status", {
            details: {
              status: response.status,
              endpoint,
            },
          });
        }

        const payload = await parseResponseBody(response);
        return normalizers.locales(payload);
      };

      const locales = await fetchLocalesFromEndpoint(endpoints.locales);
      const normalizedLocales = locales ?? [];
      if (!channel) {
        return normalizedLocales;
      }

      return mergeLocalesWithChannel(normalizedLocales, channel);
    },

    getChannel(input = {}) {
      return fetchChannel(input);
    },
  };
}
