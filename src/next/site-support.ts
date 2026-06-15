import { HTTPClient, type Fetcher } from "@ominity/api-typescript";

import {
  createCmsClient,
  createCmsLinkResolver,
  createRoutingConfig,
  matchLocaleFromSegments,
  normalizeLocaleCode,
  parseLocaleCode,
  toLocaleCode,
  type CmsCanonicalRedirectPolicy,
  type CmsClient,
  type CmsGetMenusInput,
  type CmsGetPageByPathInput,
  type CmsGetRoutesInput,
  type CmsLinkResolver,
  type CmsLocale,
  type CmsLocaleSegmentStrategy,
  type CmsMenu,
  type CmsPage,
  type CmsResponseNormalizers,
  type CmsRoute,
  type CmsRouteLinkResolver,
  type CmsRoutingConfig,
  type StringLinkStrategy,
} from "../cms/index.js";
import {
  getCachedOminityDebugFetcher,
  getCachedOminityDebugHttpClient,
  type OminityDebugSource,
} from "../debug/index.js";

const DEFAULT_LOCALE_COOKIE_NAME = "ominity_locale";
const DEFAULT_COUNTRY_COOKIE_NAME = "ominity_country";

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

function splitPath(path: string): ReadonlyArray<string> {
  return normalizePath(path).split("/").filter((segment) => segment.length > 0);
}

function removeBasePath(path: string, basePath: string): string {
  if (basePath.length === 0 || basePath === "/") {
    return normalizePath(path);
  }

  const normalizedPath = normalizePath(path);
  const normalizedBasePath = normalizePath(basePath);

  if (normalizedPath === normalizedBasePath) {
    return "/";
  }

  if (normalizedPath.startsWith(`${normalizedBasePath}/`)) {
    return normalizePath(normalizedPath.slice(normalizedBasePath.length));
  }

  return normalizedPath;
}

function asNonEmpty(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

function toSdkLanguage(locale: string | undefined): string | undefined {
  if (typeof locale !== "string") {
    return undefined;
  }

  const language = parseLocaleCode(normalizeLocaleCode(locale)).language;
  return language.length > 0 ? language : undefined;
}

function defaultFetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof init === "undefined") {
    return fetch(input);
  }

  return fetch(input, init);
}

function sanitizeCmsPagesPathQuery(input: RequestInfo | URL): RequestInfo | URL {
  const sanitizeUrl = (url: URL): URL => {
    if (!url.pathname.endsWith("/cms/pages")) {
      return url;
    }

    url.searchParams.delete("path");
    return url;
  };

  if (input instanceof URL) {
    return sanitizeUrl(new URL(input.toString()));
  }

  if (typeof input === "string") {
    try {
      return sanitizeUrl(new URL(input)).toString();
    } catch {
      return input;
    }
  }

  if (input instanceof Request) {
    const sanitizedUrl = sanitizeUrl(new URL(input.url));
    if (sanitizedUrl.toString() === input.url) {
      return input;
    }

    return new Request(sanitizedUrl, input);
  }

  return input;
}

function normalizeConfiguredLocales(
  locales: ReadonlyArray<CmsLocale>,
  fallbackLocale: string,
): ReadonlyArray<CmsLocale> {
  const normalizedFallbackLocale = normalizeLocaleCode(fallbackLocale);
  const parsedFallbackLocale = parseLocaleCode(normalizedFallbackLocale);
  const source = locales.length > 0
    ? locales
    : [{
        code: normalizedFallbackLocale,
        language: parsedFallbackLocale.language || "en",
        default: true,
      }];

  const normalized = source.map((locale) => {
    const code = normalizeLocaleCode(locale.code);
    const parsed = parseLocaleCode(code);
    const country = locale.country ?? parsed.country;

    return {
      code,
      language: parsed.language || locale.language || "en",
      ...(country ? { country: country.toUpperCase() } : {}),
      ...(typeof locale.label === "string" ? { label: locale.label } : {}),
      ...(locale.default === true ? { default: true } : {}),
    };
  });

  const explicitDefault = normalized.find((locale) => locale.default === true)?.code;
  const defaultCode = explicitDefault ?? normalized[0]?.code ?? normalizeLocaleCode(fallbackLocale);

  return normalized.map((locale) => ({
    ...locale,
    ...(locale.code === defaultCode ? { default: true } : {}),
  }));
}

export interface OminitySiteSupportConfig {
  readonly apiUrl?: string;
  readonly apiKey?: string;
  readonly channelId?: string;
  readonly useMockData: boolean;
  readonly debugLogs?: boolean;
  readonly debugBar?: boolean;
  readonly defaultLocale: string;
  readonly locales: ReadonlyArray<CmsLocale>;
  readonly localeSegmentStrategy: CmsLocaleSegmentStrategy;
  readonly canonicalRedirectPolicy: CmsCanonicalRedirectPolicy;
  readonly stringLinkStrategy: StringLinkStrategy;
  readonly trailingSlash: boolean;
  readonly basePath: string;
  readonly homeLocaleRedirectCookieName?: string;
}

export interface OminityChannelContext {
  readonly id?: string;
  readonly identifier?: string;
  readonly defaultLocale: string;
  readonly defaultCountry?: string;
  readonly defaultCurrency?: string;
  readonly locales: ReadonlyArray<CmsLocale>;
  readonly languages: ReadonlyArray<string>;
  readonly countries: ReadonlyArray<string>;
  readonly countryCurrencyMap: Readonly<Record<string, string>>;
  readonly currencies: ReadonlyArray<string>;
}

export type OminityLocaleVariant = CmsLocaleSegmentStrategy;

export interface ResolveLocaleForVariantInput {
  readonly variant: OminityLocaleVariant;
  readonly localeSegment?: string;
  readonly countrySegment?: string;
}

export interface OminitySiteSupportOptions {
  readonly getConfig: () => OminitySiteSupportConfig;
  readonly mockClient?: CmsClient;
  readonly routeResolvers?: Readonly<Record<string, CmsRouteLinkResolver>>;
  readonly stripCmsPagesPathQuery?: boolean;
  readonly cmsNormalizers?: Partial<CmsResponseNormalizers>;
}

export interface OminitySiteSupport {
  readonly cmsRouting: CmsRoutingConfig;
  readonly cmsLinkResolver: CmsLinkResolver;
  readonly cmsLocalizedStringLinkResolver: CmsLinkResolver;
  getDebugHttpClient(source: OminityDebugSource): HTTPClient | undefined;
  getLiveCmsClient(): CmsClient;
  getCmsClient(): CmsClient;
  getCmsPageByPath(input: CmsGetPageByPathInput): Promise<CmsPage | null>;
  getCmsRoutes(input?: CmsGetRoutesInput): Promise<ReadonlyArray<CmsRoute>>;
  getCmsMenus(input?: CmsGetMenusInput): Promise<ReadonlyArray<CmsMenu>>;
  getMainMenu(locale?: string): Promise<CmsMenu | null>;
  getChannelContext(): Promise<OminityChannelContext>;
  getChannelAwareCmsRouting(): Promise<CmsRoutingConfig>;
  resolveRequestLocale(request: Request): Promise<string | undefined>;
  resolveRequestSdkLanguage(request: Request): Promise<string | undefined>;
  resolveRequestCountry(request: Request): Promise<string | undefined>;
  variantMatchesCurrentStrategy(variant: OminityLocaleVariant): boolean;
  resolveLocaleForVariant(input: ResolveLocaleForVariantInput): Promise<string | null>;
  generateLocaleStaticParamsForVariant(
    variant: OminityLocaleVariant,
  ): Promise<ReadonlyArray<Readonly<Record<string, string>>>>;
  resetCaches(): void;
}

function chooseDefaultLocale(
  locales: ReadonlyArray<CmsLocale>,
  channelContext: {
    readonly defaultCountry?: string | undefined;
    readonly defaultLanguageCode?: string | undefined;
  },
  fallbackLocale: string,
): string {
  const candidates: string[] = [];
  const defaultLanguage = channelContext.defaultLanguageCode;
  const defaultCountry = channelContext.defaultCountry;

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

  const explicitDefault = locales.find((locale) => locale.default === true)?.code;
  if (explicitDefault) {
    candidates.push(normalizeLocaleCode(explicitDefault));
  }

  candidates.push(normalizeLocaleCode(fallbackLocale));
  candidates.push(normalizeLocaleCode(locales[0]?.code ?? fallbackLocale));

  const available = new Set(locales.map((locale) => normalizeLocaleCode(locale.code)));
  return candidates.find((candidate) => available.has(candidate))
    ?? normalizeLocaleCode(locales[0]?.code ?? fallbackLocale);
}

function buildChannelContext(
  input: {
    readonly config: OminitySiteSupportConfig;
    readonly locales: ReadonlyArray<CmsLocale>;
    readonly channel?: {
      readonly id?: string | undefined;
      readonly identifier?: string | undefined;
      readonly defaultLanguageCode?: string | undefined;
      readonly defaultCountryCode?: string | undefined;
      readonly defaultCurrencyCode?: string | undefined;
      readonly countries?: ReadonlyArray<{ readonly code: string; readonly currency?: string | undefined }>;
      readonly currencies?: ReadonlyArray<{ readonly code: string }>;
    };
  },
): OminityChannelContext {
  const normalizedLocales = normalizeConfiguredLocales(input.locales, input.config.defaultLocale);
  const defaultLocale = chooseDefaultLocale(
    normalizedLocales,
    {
      defaultLanguageCode: input.channel?.defaultLanguageCode,
      defaultCountry: input.channel?.defaultCountryCode,
    },
    input.config.defaultLocale,
  );

  const locales = normalizedLocales.map((locale) => ({
    ...locale,
    ...(normalizeLocaleCode(locale.code) === defaultLocale ? { default: true } : {}),
  }));
  const languages = uniqueOrdered(
    locales
      .map((locale) => parseLocaleCode(normalizeLocaleCode(locale.code)).language || locale.language)
      .filter((language) => language.length > 0),
  );
  const localeCountries = locales
    .map((locale) => locale.country)
    .filter((country): country is string => typeof country === "string")
    .map((country) => country.toUpperCase());
  const channelCountries = (input.channel?.countries ?? []).map((country) => country.code.toUpperCase());
  const countries = uniqueOrdered([...localeCountries, ...channelCountries]);
  const countryCurrencyMap = Object.fromEntries(
    (input.channel?.countries ?? [])
      .flatMap((country) => {
        if (typeof country.currency !== "string" || country.currency.length === 0) {
          return [];
        }

        return [[country.code.toUpperCase(), country.currency.toUpperCase()] as const];
      }),
  );
  const currencies = uniqueOrdered(
    (input.channel?.currencies ?? [])
      .map((currency) => currency.code.toUpperCase())
      .filter((currency) => currency.length > 0),
  );
  const defaultCountry = input.channel?.defaultCountryCode?.toUpperCase()
    ?? parseLocaleCode(defaultLocale).country
    ?? countries[0];
  const defaultCurrency = input.channel?.defaultCurrencyCode?.toUpperCase()
    ?? (typeof defaultCountry === "string" ? countryCurrencyMap[defaultCountry.toUpperCase()] : undefined)
    ?? currencies[0];

  return {
    ...(typeof input.channel?.id === "string" ? { id: input.channel.id } : {}),
    ...(typeof input.channel?.identifier === "string" ? { identifier: input.channel.identifier } : {}),
    defaultLocale,
    ...(typeof defaultCountry === "string" ? { defaultCountry: defaultCountry.toUpperCase() } : {}),
    ...(typeof defaultCurrency === "string" ? { defaultCurrency: defaultCurrency.toUpperCase() } : {}),
    locales,
    languages,
    countries,
    countryCurrencyMap,
    currencies,
  };
}

function cookieValue(cookieHeader: string | null, name: string): string | undefined {
  if (typeof cookieHeader !== "string" || cookieHeader.length === 0) {
    return undefined;
  }

  const entries = cookieHeader.split(";");
  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = entry.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }

    const raw = entry.slice(separatorIndex + 1).trim();
    if (!raw) {
      return undefined;
    }

    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  return undefined;
}

function localeCandidate(value: string | null | undefined): string | undefined {
  const raw = asNonEmpty(value);
  if (!raw) {
    return undefined;
  }

  const token = raw.split(",")[0]?.split(";")[0]?.trim();
  if (!token) {
    return undefined;
  }

  return normalizeLocaleCode(token.replaceAll("_", "-"));
}

function countryCandidate(value: string | null | undefined): string | undefined {
  const raw = asNonEmpty(value);
  if (!raw) {
    return undefined;
  }

  const token = raw.split(",")[0]?.split(";")[0]?.trim();
  if (!token) {
    return undefined;
  }

  const uppercase = token.toUpperCase().replaceAll("_", "-");
  if (!/^[A-Z]{2}$/.test(uppercase)) {
    return undefined;
  }

  if (uppercase === "XX" || uppercase === "T1") {
    return undefined;
  }

  return uppercase;
}

function countryFromLocale(locale: string | undefined): string | undefined {
  if (typeof locale !== "string" || locale.length === 0) {
    return undefined;
  }

  const country = parseLocaleCode(normalizeLocaleCode(locale)).country;
  return typeof country === "string" && country.length > 0 ? country.toUpperCase() : undefined;
}

function pathnameFromUrlLike(value: string | null | undefined): string | undefined {
  const trimmed = asNonEmpty(value);
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  try {
    return new URL(trimmed).pathname;
  } catch {
    return undefined;
  }
}

function explicitCountryFromRequestHeaders(request: Request): string | undefined {
  const candidates = [
    request.headers.get("x-ominity-country"),
    request.headers.get("x-country"),
    request.headers.get("x-country-code"),
  ];

  for (const candidate of candidates) {
    const normalized = countryCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function detectedCountryFromRequestHeaders(request: Request): string | undefined {
  const candidates = [
    request.headers.get("x-vercel-ip-country"),
    request.headers.get("cf-ipcountry"),
    request.headers.get("cloudfront-viewer-country"),
    request.headers.get("fastly-country-code"),
    request.headers.get("x-appengine-country"),
  ];

  for (const candidate of candidates) {
    const normalized = countryCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

export function createOminitySiteSupport(
  options: OminitySiteSupportOptions,
): OminitySiteSupport {
  let cachedLiveClient: CmsClient | null = null;
  let cachedCmsHttpClient: HTTPClient | null = null;
  let cachedChannelContextPromise: Promise<OminityChannelContext> | null = null;
  let cachedChannelAwareRoutingPromise: Promise<CmsRoutingConfig> | null = null;

  const baseConfig = options.getConfig();
  const cmsRouting = createRoutingConfig({
    defaultLocale: baseConfig.defaultLocale,
    locales: baseConfig.locales,
    localeSegmentStrategy: baseConfig.localeSegmentStrategy,
    canonicalRedirectPolicy: baseConfig.canonicalRedirectPolicy,
    trailingSlash: baseConfig.trailingSlash,
    basePath: baseConfig.basePath,
  });
  const cmsLinkResolver = createCmsLinkResolver({
    config: cmsRouting,
    ...(options.routeResolvers ? { routeResolvers: options.routeResolvers } : {}),
    stringLinkStrategy: baseConfig.stringLinkStrategy,
  });
  const cmsLocalizedStringLinkResolver = createCmsLinkResolver({
    config: cmsRouting,
    ...(options.routeResolvers ? { routeResolvers: options.routeResolvers } : {}),
    stringLinkStrategy: "localize-relative",
  });

  const getDebugHttpClient = (source: OminityDebugSource): HTTPClient | undefined => {
    return getCachedOminityDebugHttpClient({
      source,
      ...(typeof options.getConfig().debugBar === "boolean" ? { enabled: options.getConfig().debugBar } : {}),
    });
  };

  const getCmsHttpClient = (): HTTPClient => {
    if (cachedCmsHttpClient) {
      return cachedCmsHttpClient;
    }

    const config = options.getConfig();
    const debugFetcher = getCachedOminityDebugFetcher({
      source: "cms",
      ...(typeof config.debugBar === "boolean" ? { enabled: config.debugBar } : {}),
    });
    const baseFetcher = debugFetcher ?? defaultFetcher;
    const fetcher: Fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestInput = options.stripCmsPagesPathQuery === true
        ? sanitizeCmsPagesPathQuery(input)
        : input;
      return baseFetcher(requestInput, init);
    };

    cachedCmsHttpClient = new HTTPClient({ fetcher });
    return cachedCmsHttpClient;
  };

  const getLiveCmsClient = (): CmsClient => {
    if (cachedLiveClient) {
      return cachedLiveClient;
    }

    const config = options.getConfig();
    if (!config.apiUrl || !config.apiKey) {
      throw new Error(
        "Missing OMINITY_API_URL or OMINITY_API_KEY. Set env vars or enable OMINITY_USE_MOCK_DATA=true.",
      );
    }

    cachedLiveClient = createCmsClient({
      sdk: {
        serverURL: config.apiUrl,
        security: {
          apiKey: config.apiKey,
        },
        httpClient: getCmsHttpClient(),
        ...(typeof config.channelId === "string" ? { channelId: config.channelId } : {}),
      },
      ...(options.cmsNormalizers ? { normalizers: options.cmsNormalizers } : {}),
      ...(typeof config.debugLogs === "boolean"
        ? {
            debug: {
              enabled: config.debugLogs,
            },
          }
        : {}),
    });

    return cachedLiveClient;
  };

  const getCmsClient = (): CmsClient => {
    const config = options.getConfig();
    if (config.useMockData && options.mockClient) {
      return options.mockClient;
    }

    return getLiveCmsClient();
  };

  const getCmsPageByPath = async (
    input: CmsGetPageByPathInput,
  ): Promise<CmsPage | null> => {
    const locale = typeof input.locale === "string" ? toSdkLanguage(input.locale) : undefined;

    try {
      return await getCmsClient().getPageByPath({
        ...input,
        ...(typeof locale === "string" ? { locale } : {}),
      });
    } catch {
      return null;
    }
  };

  const getCmsRoutes = async (
    input?: CmsGetRoutesInput,
  ): Promise<ReadonlyArray<CmsRoute>> => {
    const locale = typeof input?.locale === "string" ? toSdkLanguage(input.locale) : undefined;

    try {
      return await getCmsClient().getRoutes({
        ...input,
        ...(typeof locale === "string" ? { locale } : {}),
      });
    } catch {
      return [];
    }
  };

  const getCmsMenus = async (
    input?: CmsGetMenusInput,
  ): Promise<ReadonlyArray<CmsMenu>> => {
    const locale = typeof input?.locale === "string" ? toSdkLanguage(input.locale) : undefined;

    try {
      return await getCmsClient().getMenus({
        ...input,
        ...(typeof locale === "string" ? { locale } : {}),
      });
    } catch {
      return [];
    }
  };

  const getMainMenu = async (locale?: string): Promise<CmsMenu | null> => {
    const menus = await getCmsMenus({
      key: "main",
      ...(locale ? { locale } : {}),
    });

    return menus[0] ?? null;
  };

  const getChannelContext = async (): Promise<OminityChannelContext> => {
    if (cachedChannelContextPromise) {
      return cachedChannelContextPromise;
    }

    cachedChannelContextPromise = (async () => {
      const config = options.getConfig();
      const fallback = buildChannelContext({
        config,
        locales: config.locales,
      });

      try {
        const client = getCmsClient();
        const [localesResult, channelResult] = await Promise.allSettled([
          client.getLocales(),
          client.getChannel(),
        ]);

        const locales = localesResult.status === "fulfilled"
          ? localesResult.value
          : config.locales;
        const channel = channelResult.status === "fulfilled" && channelResult.value
          ? {
              ...(typeof channelResult.value.id === "string" ? { id: channelResult.value.id } : {}),
              ...(typeof channelResult.value.identifier === "string"
                ? { identifier: channelResult.value.identifier }
                : {}),
              ...(typeof channelResult.value.defaultLanguageCode === "string"
                ? { defaultLanguageCode: channelResult.value.defaultLanguageCode }
                : {}),
              ...(typeof channelResult.value.defaultCountryCode === "string"
                ? { defaultCountryCode: channelResult.value.defaultCountryCode }
                : {}),
              ...(typeof channelResult.value.defaultCurrencyCode === "string"
                ? { defaultCurrencyCode: channelResult.value.defaultCurrencyCode }
                : {}),
              ...(channelResult.value.countries.length > 0 ? { countries: channelResult.value.countries } : {}),
              ...(channelResult.value.currencies.length > 0 ? { currencies: channelResult.value.currencies } : {}),
            }
          : undefined;

        return buildChannelContext({
          config,
          locales,
          ...(channel ? { channel } : {}),
        });
      } catch {
        return fallback;
      }
    })();

    return cachedChannelContextPromise;
  };

  const getChannelAwareCmsRouting = async (): Promise<CmsRoutingConfig> => {
    if (cachedChannelAwareRoutingPromise) {
      return cachedChannelAwareRoutingPromise;
    }

    cachedChannelAwareRoutingPromise = (async () => {
      const config = options.getConfig();
      const channel = await getChannelContext();

      return createRoutingConfig({
        defaultLocale: channel.defaultLocale,
        locales: channel.locales,
        localeSegmentStrategy: config.localeSegmentStrategy,
        canonicalRedirectPolicy: config.canonicalRedirectPolicy,
        trailingSlash: config.trailingSlash,
        basePath: config.basePath,
      });
    })();

    return cachedChannelAwareRoutingPromise;
  };

  const localeFromPath = (pathname: string, routing: CmsRoutingConfig): string | undefined => {
    if (routing.localeSegmentStrategy === "none") {
      return undefined;
    }

    const relativePath = removeBasePath(pathname, routing.basePath);
    const segments = splitPath(relativePath);
    const matched = matchLocaleFromSegments(segments, routing);
    if (!matched || matched.consumedSegments <= 0) {
      return undefined;
    }

    return normalizeLocaleCode(matched.locale);
  };

  const resolveRequestLocale = async (request: Request): Promise<string | undefined> => {
    const config = options.getConfig();
    const localeCookieName = config.homeLocaleRedirectCookieName ?? DEFAULT_LOCALE_COOKIE_NAME;

    const fromLocaleHeader = localeCandidate(request.headers.get("x-ominity-locale"));
    if (fromLocaleHeader) {
      return fromLocaleHeader;
    }

    const fromLanguageHeader = localeCandidate(request.headers.get("x-ominity-language"));
    if (fromLanguageHeader) {
      return fromLanguageHeader;
    }

    const fromLocaleCookie = localeCandidate(cookieValue(request.headers.get("cookie"), localeCookieName));
    if (fromLocaleCookie) {
      return fromLocaleCookie;
    }

    const routing = await getChannelAwareCmsRouting();
    const refererPath = pathnameFromUrlLike(request.headers.get("referer"));
    if (refererPath) {
      const fromReferer = localeFromPath(refererPath, routing);
      if (fromReferer) {
        return fromReferer;
      }
    }

    const requestPath = pathnameFromUrlLike(request.url);
    if (requestPath) {
      const fromRequestPath = localeFromPath(requestPath, routing);
      if (fromRequestPath) {
        return fromRequestPath;
      }
    }

    return localeCandidate(request.headers.get("accept-language"));
  };

  const resolveRequestSdkLanguage = async (request: Request): Promise<string | undefined> => {
    const locale = await resolveRequestLocale(request);
    return toSdkLanguage(locale);
  };

  const resolveRequestCountry = async (request: Request): Promise<string | undefined> => {
    const channelContext = await getChannelContext();
    const allowedCountries = new Set(channelContext.countries.map((country) => country.toUpperCase()));
    const isAllowedCountry = (country: string): boolean => {
      if (allowedCountries.size === 0) {
        return true;
      }

      return allowedCountries.has(country.toUpperCase());
    };
    const tryCountry = (value: string | undefined): string | undefined => {
      if (!value) {
        return undefined;
      }

      const normalized = value.toUpperCase();
      return isAllowedCountry(normalized) ? normalized : undefined;
    };

    const fromExplicitHeader = tryCountry(explicitCountryFromRequestHeaders(request));
    if (fromExplicitHeader) {
      return fromExplicitHeader;
    }

    const fromCountryCookie = tryCountry(
      cookieValue(request.headers.get("cookie"), DEFAULT_COUNTRY_COOKIE_NAME),
    );
    if (fromCountryCookie) {
      return fromCountryCookie;
    }

    const routing = await getChannelAwareCmsRouting();
    if (routing.localeSegmentStrategy === "country-language") {
      const locale = await resolveRequestLocale(request);
      const fromLocale = tryCountry(countryFromLocale(locale));
      if (fromLocale) {
        return fromLocale;
      }
    }

    const fromDetectedHeaders = tryCountry(detectedCountryFromRequestHeaders(request));
    if (fromDetectedHeaders) {
      return fromDetectedHeaders;
    }

    const fromAcceptLanguage = tryCountry(
      countryFromLocale(localeCandidate(request.headers.get("accept-language"))),
    );
    if (fromAcceptLanguage) {
      return fromAcceptLanguage;
    }

    const fromDefaultCountry = tryCountry(channelContext.defaultCountry);
    if (fromDefaultCountry) {
      return fromDefaultCountry;
    }

    const fromDefaultLocale = tryCountry(countryFromLocale(channelContext.defaultLocale));
    if (fromDefaultLocale) {
      return fromDefaultLocale;
    }

    return channelContext.countries[0]?.toUpperCase();
  };

  const variantMatchesCurrentStrategy = (variant: OminityLocaleVariant): boolean => {
    return options.getConfig().localeSegmentStrategy === variant;
  };

  const resolveLocaleForVariant = async (
    input: ResolveLocaleForVariantInput,
  ): Promise<string | null> => {
    const config = options.getConfig();
    if (config.localeSegmentStrategy !== input.variant) {
      return null;
    }

    const routing = await getChannelAwareCmsRouting();
    if (input.variant === "none") {
      return normalizeLocaleCode(routing.defaultLocale);
    }

    if (input.variant === "language") {
      if (!input.localeSegment) {
        return null;
      }

      const matched = matchLocaleFromSegments([input.localeSegment], routing);
      if (!matched || matched.consumedSegments !== 1) {
        return null;
      }

      return normalizeLocaleCode(matched.locale);
    }

    if (!input.countrySegment || !input.localeSegment) {
      return null;
    }

    const matched = matchLocaleFromSegments([input.countrySegment, input.localeSegment], routing);
    if (!matched || matched.consumedSegments !== 2) {
      return null;
    }

    return normalizeLocaleCode(matched.locale);
  };

  const generateLocaleStaticParamsForVariant = async (
    variant: OminityLocaleVariant,
  ): Promise<ReadonlyArray<Readonly<Record<string, string>>>> => {
    const config = options.getConfig();
    if (config.localeSegmentStrategy !== variant) {
      return [];
    }

    if (variant === "none") {
      return [{}];
    }

    const channelContext = await getChannelContext();
    const result: Array<Readonly<Record<string, string>>> = [];

    for (const locale of channelContext.locales) {
      const parsed = parseLocaleCode(normalizeLocaleCode(locale.code));
      const language = parsed.language || locale.language;

      if (variant === "language") {
        if (language.length > 0) {
          result.push({ locale: language });
        }

        continue;
      }

      const country = parsed.country ?? locale.country;
      if (!country || language.length === 0) {
        continue;
      }

      result.push({
        country: country.toLowerCase(),
        locale: language,
      });
    }

    const deduped = new Map<string, Readonly<Record<string, string>>>();
    for (const entry of result) {
      deduped.set(JSON.stringify(entry), entry);
    }

    return Array.from(deduped.values());
  };

  const resetCaches = (): void => {
    cachedLiveClient = null;
    cachedCmsHttpClient = null;
    cachedChannelContextPromise = null;
    cachedChannelAwareRoutingPromise = null;
  };

  return {
    cmsRouting,
    cmsLinkResolver,
    cmsLocalizedStringLinkResolver,
    getDebugHttpClient,
    getLiveCmsClient,
    getCmsClient,
    getCmsPageByPath,
    getCmsRoutes,
    getCmsMenus,
    getMainMenu,
    getChannelContext,
    getChannelAwareCmsRouting,
    resolveRequestLocale,
    resolveRequestSdkLanguage,
    resolveRequestCountry,
    variantMatchesCurrentStrategy,
    resolveLocaleForVariant,
    generateLocaleStaticParamsForVariant,
    resetCaches,
  };
}
