import { CmsNormalizationError } from "./errors.js";
import { normalizeLocaleCode, parseLocaleCode } from "./locales/index.js";
import type {
  CmsChannel,
  CmsChannelCountry,
  CmsChannelCurrency,
  CmsChannelLanguage,
  CmsFieldValue,
  CmsLocale,
  CmsMenu,
  CmsMenuItem,
  CmsPage,
  CmsPageComponent,
  CmsPageTranslation,
  CmsResponseNormalizers,
  CmsRoute,
  CmsSeo,
  CmsSeoRobots,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function normalizePath(path: string): string {
  if (path === "") {
    return "/";
  }

  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  if (withLeadingSlash === "/") {
    return "/";
  }

  return withLeadingSlash.replace(/\/+$/, "");
}

function toSlug(path: string): string {
  return normalizePath(path).replace(/^\//, "");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asArray(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
}

function asId(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function withDefaultId(prefix: string, fallback: string, id?: string): string {
  if (id && id.length > 0) {
    return id;
  }

  return `${prefix}:${fallback}`;
}

function unwrapSingle(value: unknown, keys: ReadonlyArray<string>): unknown {
  if (!isRecord(value)) {
    return value;
  }

  for (const key of keys) {
    if (key in value) {
      return value[key];
    }
  }

  return value;
}

function unwrapCollection(value: unknown, keys: ReadonlyArray<string>): ReadonlyArray<unknown> {
  if (Array.isArray(value)) {
    return value;
  }

  if (isRecord(value)) {
    for (const key of keys) {
      const candidate = value[key];
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    const embedded = value._embedded;
    if (isRecord(embedded)) {
      for (const key of keys) {
        const candidate = embedded[key];
        if (Array.isArray(candidate)) {
          return candidate;
        }
      }
    }
  }

  return [];
}

function isPageContentComponentMarker(value: UnknownRecord): boolean {
  const marker = value.type ?? value._type ?? value.kind ?? value.content_type ?? value.resource;
  return marker === "page_content_component";
}

function looksLikeComponent(value: UnknownRecord): boolean {
  const hasFields = isRecord(value.fields ?? value.data ?? value.props ?? value.values);
  const hasTypeOrKey = typeof value.type === "string"
    || typeof value.key === "string"
    || typeof value.component === "string"
    || typeof value.component_type === "string"
    || typeof value.component_key === "string";

  return hasFields && hasTypeOrKey;
}

export function normalizeCmsFieldValue(value: unknown, fallbackIdPrefix: string): CmsFieldValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeCmsFieldValue(item, `${fallbackIdPrefix}[${index}]`));
  }

  if (!isRecord(value)) {
    return null;
  }

  if (isPageContentComponentMarker(value)) {
    const nested = isRecord(value.component) ? value.component : (value.value ?? value.data ?? value);
    return normalizeCmsComponent(nested, fallbackIdPrefix);
  }

  if (looksLikeComponent(value)) {
    return normalizeCmsComponent(value, fallbackIdPrefix);
  }

  const result: Record<string, CmsFieldValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = normalizeCmsFieldValue(entry, `${fallbackIdPrefix}.${key}`);
  }

  return result;
}

export function normalizeCmsComponent(input: unknown, fallbackId: string): CmsPageComponent {
  const value = isRecord(input) && isRecord(input.component)
    ? unwrapSingle(input, ["component", "item"])
    : unwrapSingle(input, ["item"]);
  if (!isRecord(value)) {
    throw new CmsNormalizationError("Unable to normalize CMS component", {
      details: {
        fallbackId,
      },
    });
  }

  const id = withDefaultId(
    "component",
    fallbackId,
    asString(value.id) ?? asString(value.uuid) ?? asString(value._id) ?? asString(value.component_id),
  );

  const key = asString(value.key)
    ?? asString(value.component_key)
    ?? asString(value.componentKey)
    ?? asString(value.component)
    ?? asString(value.type)
    ?? asString(value.component_type)
    ?? "unknown";

  const type = asString(value.type)
    ?? asString(value.component)
    ?? asString(value.component_type)
    ?? asString(value.componentType)
    ?? key;

  const rawFields = (value.fields ?? value.data ?? value.values ?? value.props) as unknown;
  const fieldsRecord = isRecord(rawFields) ? rawFields : {};

  const fields: Record<string, CmsFieldValue> = {};
  for (const [fieldKey, fieldValue] of Object.entries(fieldsRecord)) {
    fields[fieldKey] = normalizeCmsFieldValue(fieldValue, `${id}.${fieldKey}`);
  }

  const rawChildren = (value.children ?? value.components ?? value.child_components) as unknown;
  const childrenSource = asArray(rawChildren);
  const children = childrenSource.map((child, index) => normalizeCmsComponent(child, `${id}.children.${index}`));

  const meta = isRecord(value.meta) ? value.meta : undefined;

  return {
    id,
    key,
    type,
    fields,
    children,
    ...(meta ? { meta } : {}),
  };
}

function pathFromSlugValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return normalizePath(value);
  }

  if (value === null) {
    return "/";
  }

  return undefined;
}

function resolveRouteLikePath(input: UnknownRecord): string {
  const explicitPath = pathFromSlugValue(input.path);
  if (explicitPath) {
    return explicitPath;
  }

  const explicitSlug = pathFromSlugValue(input.slug);
  if (explicitSlug) {
    return explicitSlug;
  }

  const parameters = isRecord(input.parameters) ? input.parameters : undefined;
  const parameterPath = parameters ? pathFromSlugValue(parameters.path) : undefined;
  if (parameterPath) {
    return parameterPath;
  }

  const parameterSlug = parameters ? pathFromSlugValue(parameters.slug) : undefined;
  if (parameterSlug) {
    return parameterSlug;
  }

  return "/";
}

function normalizePageTranslations(
  input: unknown,
  fallbackLocale: string,
): ReadonlyArray<CmsPageTranslation> {
  if (Array.isArray(input)) {
    return input.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }

      const locale = normalizeLocaleCode(asString(entry.locale) ?? fallbackLocale);
      const path = normalizePath(asString(entry.path) ?? asString(entry.slug) ?? "/");
      const canonical = asBoolean(entry.canonical);

      return [{
        locale,
        path,
        slug: toSlug(path),
        ...(typeof canonical === "boolean" ? { canonical } : {}),
      }];
    });
  }

  if (!isRecord(input)) {
    return [];
  }

  return Object.entries(input).flatMap(([localeKey, entry]) => {
    if (typeof entry === "string") {
      const path = normalizePath(entry);
      return [{
        locale: normalizeLocaleCode(localeKey),
        path,
        slug: toSlug(path),
      }];
    }

    if (!isRecord(entry)) {
      return [];
    }

    const locale = normalizeLocaleCode(asString(entry.locale) ?? localeKey);
    const path = resolveRouteLikePath(entry);
    const canonical = asBoolean(entry.canonical);

    return [{
      locale,
      path,
      slug: toSlug(path),
      ...(typeof canonical === "boolean" ? { canonical } : {}),
    }];
  });
}

function normalizeRobots(input: unknown): CmsSeoRobots | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const index = asBoolean(input.index);
  const follow = asBoolean(input.follow);
  const noarchive = asBoolean(input.noarchive);
  const nosnippet = asBoolean(input.nosnippet);
  const noimageindex = asBoolean(input.noimageindex);

  const robots: CmsSeoRobots = {
    ...(typeof index === "boolean" ? { index } : {}),
    ...(typeof follow === "boolean" ? { follow } : {}),
    ...(typeof noarchive === "boolean" ? { noarchive } : {}),
    ...(typeof nosnippet === "boolean" ? { nosnippet } : {}),
    ...(typeof noimageindex === "boolean" ? { noimageindex } : {}),
  };

  return Object.keys(robots).length > 0 ? robots : undefined;
}

function normalizeSeo(input: unknown): CmsSeo | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const og = isRecord(input.og)
    ? input.og
    : isRecord(input.open_graph)
      ? input.open_graph
      : isRecord(input.opengraph)
        ? input.opengraph
        : isRecord(input.openGraph)
          ? input.openGraph
          : undefined;
  let openGraph: CmsSeo["openGraph"];

  const normalizeOpenGraphImages = (value: unknown): ReadonlyArray<NonNullable<NonNullable<CmsSeo["openGraph"]>["images"]>[number]> => {
    if (typeof value === "string" && value.length > 0) {
      return [{ url: value }];
    }

    if (Array.isArray(value)) {
      return value.flatMap((entry) => normalizeOpenGraphImages(entry));
    }

    if (!isRecord(value)) {
      return [];
    }

    const url = asNonEmptyString(value.url) ?? asNonEmptyString(value.src) ?? asNonEmptyString(value.href);
    if (!url) {
      return [];
    }

    const alt = asNonEmptyString(value.alt);
    return [{
      url,
      ...(typeof alt === "string" ? { alt } : {}),
    }];
  };

  if (og) {
    const ogTitle = asNonEmptyString(og.title);
    const ogDescription = asNonEmptyString(og.description);
    const ogType = asNonEmptyString(og.type);
    const images = [
      ...normalizeOpenGraphImages(og.images),
      ...normalizeOpenGraphImages(og.image),
    ];

    const normalizedOpenGraph: NonNullable<CmsSeo["openGraph"]> = {
      ...(typeof ogTitle === "string" ? { title: ogTitle } : {}),
      ...(typeof ogDescription === "string" ? { description: ogDescription } : {}),
      ...(typeof ogType === "string" ? { type: ogType } : {}),
      ...(images.length > 0 ? { images } : {}),
    };

    if (Object.keys(normalizedOpenGraph).length > 0) {
      openGraph = normalizedOpenGraph;
    }
  }

  const robots = normalizeRobots(input.robots);
  const title = asNonEmptyString(input.title);
  const description = asNonEmptyString(input.description);
  const canonicalUrl = asNonEmptyString(input.canonical_url)
    ?? asNonEmptyString(input.canonicalUrl)
    ?? asNonEmptyString(input.canonical);

  const seo: CmsSeo = {
    ...(typeof title === "string" ? { title } : {}),
    ...(typeof description === "string" ? { description } : {}),
    ...(typeof canonicalUrl === "string" ? { canonicalUrl } : {}),
    ...(robots ? { robots } : {}),
    ...(openGraph ? { openGraph } : {}),
  };

  return Object.keys(seo).length > 0 ? seo : undefined;
}

export function normalizePage(input: unknown): CmsPage {
  const collection = unwrapCollection(input, ["pages", "items", "data"]);
  const source = collection.length > 0 ? collection[0] : input;
  const value = unwrapSingle(source, ["page", "data", "item"]);
  if (!isRecord(value)) {
    throw new CmsNormalizationError("Unable to normalize CMS page", {
      details: {
        input,
      },
    });
  }

  const normalizeStatus = (pageValue: UnknownRecord): CmsPage["status"] => {
    const status = asString(pageValue.status);
    if (status === "published" || status === "draft" || status === "unknown") {
      return status;
    }

    const published = asBoolean(pageValue.published);
    if (published === true) {
      return "published";
    }

    if (published === false) {
      return "draft";
    }

    return "unknown";
  };

  const extractPageTranslations = (
    pageValue: UnknownRecord,
    fallbackLocale: string,
  ): ReadonlyArray<CmsPageTranslation> => {
    const routeTranslations = normalizePageTranslations(pageValue.routes, fallbackLocale);
    if (routeTranslations.length > 0) {
      return routeTranslations;
    }

    return normalizePageTranslations(
      pageValue.translations ?? pageValue.localized_paths ?? pageValue.localizations,
      fallbackLocale,
    );
  };

  const initialLocale = normalizeLocaleCode(asString(value.locale) ?? asString(value.language) ?? "en");
  const translations = extractPageTranslations(value, initialLocale);
  const locale = translations[0]?.locale ?? initialLocale;
  const explicitPath = pathFromSlugValue(value.path) ?? pathFromSlugValue(value.slug);
  const path = explicitPath
    ?? translations.find((entry) => entry.locale === locale)?.path
    ?? translations[0]?.path
    ?? "/";
  const canonicalPath = normalizePath(
    asString(value.canonical_path) ?? asString(value.canonicalPath) ?? path,
  );

  const rawComponents = value.components ?? value.page_content ?? value.content ?? value.body;
  const components = asArray(rawComponents).map((entry, index) => normalizeCmsComponent(entry, `root.${index}`));
  const normalizedTranslations = translations.length > 0
    ? translations
    : [{
        locale,
        path,
        slug: toSlug(path),
        canonical: true,
      }];
  const seo = normalizeSeo(value.meta ?? value.metadata ?? value.seo);
  const title = seo?.title ?? asNonEmptyString(value.title) ?? asNonEmptyString(value.name);
  const description = seo?.description ?? asNonEmptyString(value.description);

  return {
    id: withDefaultId("page", path, asId(value.id) ?? asId(value.uuid) ?? asId(value._id)),
    locale,
    path,
    slug: toSlug(path),
    canonicalPath,
    ...(typeof title === "string" ? { title } : {}),
    ...(typeof description === "string" ? { description } : {}),
    status: normalizeStatus(value),
    components,
    translations: normalizedTranslations,
    ...(seo ? { seo } : {}),
  };
}

function normalizeMenuItem(input: unknown, fallbackId: string): CmsMenuItem {
  if (!isRecord(input)) {
    return {
      id: `menu-item:${fallbackId}`,
      title: "",
      path: "/",
      children: [],
    };
  }

  const path = normalizePath(asString(input.path) ?? asString(input.url) ?? "/");
  const children = asArray(input.children ?? input.items).map((entry, index) =>
    normalizeMenuItem(entry, `${fallbackId}.${index}`),
  );
  const locale = asString(input.locale);
  const target = asString(input.target);
  const meta = isRecord(input.meta) ? input.meta : undefined;

  return {
    id: withDefaultId("menu-item", fallbackId, asString(input.id) ?? asString(input.uuid)),
    title: asString(input.title) ?? asString(input.label) ?? "",
    path,
    ...(typeof locale === "string" ? { locale } : {}),
    ...(typeof target === "string" ? { target } : {}),
    children,
    ...(meta ? { meta } : {}),
  };
}

export function normalizeMenus(input: unknown): ReadonlyArray<CmsMenu> {
  const source = unwrapCollection(input, ["menus", "items", "data"]);

  return source.map((entry, index) => {
    const value = isRecord(entry) ? entry : {};
    const locale = normalizeLocaleCode(asString(value.locale) ?? "en");
    const items = asArray(value.items ?? value.menu_items).map((item, itemIndex) =>
      normalizeMenuItem(item, `${index}.${itemIndex}`),
    );

    return {
      id: withDefaultId("menu", `${index}`, asString(value.id) ?? asString(value.uuid)),
      key: asString(value.key) ?? asString(value.slug) ?? `menu-${index}`,
      locale,
      items,
    };
  });
}

function normalizeRouteTranslations(input: unknown): Readonly<Record<string, string>> {
  const translations = normalizePageTranslations(input, "en");
  return Object.fromEntries(translations.map((entry) => [entry.locale, entry.path]));
}

export function normalizeRoutes(input: unknown): ReadonlyArray<CmsRoute> {
  const source = unwrapCollection(input, ["routes", "items", "data", "pages"]);
  const routes: CmsRoute[] = [];

  const normalizeSingleRoute = (
    routeInput: UnknownRecord,
    fallbackId: string,
    parentPageId?: string,
  ): CmsRoute => {
    const locale = normalizeLocaleCode(asString(routeInput.locale) ?? "en");
    const path = resolveRouteLikePath(routeInput);
    const translations = normalizeRouteTranslations(
      routeInput.routes ?? routeInput.translations ?? routeInput.localized_paths,
    );
    const pageId = withDefaultId(
      "page",
      fallbackId,
      asId(routeInput.page_id)
        ?? asId(routeInput.pageId)
        ?? asId(routeInput.page)
        ?? (isRecord(routeInput.parameters) ? asId(routeInput.parameters.id) : undefined)
        ?? parentPageId,
    );
    const canonicalPath = normalizePath(
      asString(routeInput.canonical_path) ?? asString(routeInput.canonicalPath) ?? path,
    );
    const redirectsToCanonical = asBoolean(routeInput.redirects_to_canonical)
      ?? asBoolean(routeInput.redirectsToCanonical);

    return {
      id: withDefaultId("route", fallbackId, asId(routeInput.id) ?? asId(routeInput.uuid)),
      pageId,
      locale,
      path,
      slug: toSlug(path),
      canonicalPath,
      translations: Object.keys(translations).length > 0 ? translations : { [locale]: path },
      ...(typeof redirectsToCanonical === "boolean" ? { redirectsToCanonical } : {}),
    };
  };

  source.forEach((entry, index) => {
    if (!isRecord(entry)) {
      return;
    }

    if (isRecord(entry.routes)) {
      const pageId = asId(entry.id) ?? `${index}`;
      const sharedTranslations = normalizeRouteTranslations(entry.routes);

      for (const [localeKey, routeEntry] of Object.entries(entry.routes)) {
        if (!isRecord(routeEntry)) {
          continue;
        }

        const normalizedRoute = normalizeSingleRoute(routeEntry, `${index}.${localeKey}`, pageId);
        routes.push({
          ...normalizedRoute,
          translations: Object.keys(sharedTranslations).length > 0
            ? sharedTranslations
            : normalizedRoute.translations,
        });
      }

      return;
    }

    routes.push(normalizeSingleRoute(entry, `${index}`));
  });

  return routes;
}

function normalizeLocaleEntryFromLanguage(
  value: UnknownRecord,
  fallbackIndex: number,
): CmsLocale {
  const localeRecord = isRecord(value.locale)
    ? value.locale
    : isRecord(value._embedded) && isRecord(value._embedded.locale)
      ? value._embedded.locale
      : undefined;
  const localeTerritory = localeRecord ? asString(localeRecord.territory) : undefined;

  const baseCode = asString(value.code) ?? asString(value.locale) ?? "en";
  const code = normalizeLocaleCode(baseCode);
  const parsed = parseLocaleCode(code);
  const country = localeTerritory ?? parsed.country;
  const label = asString(value.label) ?? asString(value.name);

  return {
    code,
    language: parsed.language,
    ...(typeof country === "string" ? { country } : {}),
    ...(typeof label === "string" ? { label } : {}),
    default: asBoolean(value.default) ?? fallbackIndex === 0,
  };
}

function normalizeLocaleEntriesFromLocale(value: UnknownRecord): ReadonlyArray<CmsLocale> {
  const languages = asArray(value.languages ?? (isRecord(value._embedded) ? value._embedded.languages : undefined));
  if (languages.length === 0) {
    const code = normalizeLocaleCode(asString(value.code) ?? "en");
    const parsed = parseLocaleCode(code);
    const territory = asString(value.territory) ?? parsed.country;
    const label = asString(value.label) ?? asString(value.name);

    return [{
      code,
      language: parsed.language,
      ...(typeof territory === "string" ? { country: territory } : {}),
      ...(typeof label === "string" ? { label } : {}),
      default: asBoolean(value.default) ?? false,
    }];
  }

  return languages.flatMap((language, index): CmsLocale[] => {
    if (!isRecord(language)) {
      return [];
    }

    const base = normalizeLocaleEntryFromLanguage(language, index);
    const territory = asString(value.territory) ?? base.country;
    return [{
      ...base,
      ...(typeof territory === "string" ? { country: territory } : {}),
    }];
  });
}

export function normalizeLocales(input: unknown): ReadonlyArray<CmsLocale> {
  const source = unwrapCollection(input, ["locales", "languages", "items", "data"]);
  const locales = source.flatMap((entry, index): CmsLocale[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const resource = asString(entry.resource);
    if (resource === "locale") {
      return [...normalizeLocaleEntriesFromLocale(entry)];
    }

    return [normalizeLocaleEntryFromLanguage(entry, index)];
  });

  const unique = new Map<string, CmsLocale>();
  for (const locale of locales) {
    unique.set(locale.code, locale);
  }

  return Array.from(unique.values());
}

function normalizeChannelLanguage(input: unknown): CmsChannelLanguage | null {
  if (!isRecord(input)) {
    return null;
  }

  const code = asString(input.code);
  const name = asString(input.name);
  if (!code || !name) {
    return null;
  }

  const localeRecord = isRecord(input.locale)
    ? input.locale
    : isRecord(input._embedded) && isRecord(input._embedded.locale)
      ? input._embedded.locale
      : undefined;
  const direction = asString(input.direction);
  const localeCode = localeRecord ? asString(localeRecord.code) : undefined;
  const localeTerritory = localeRecord ? asString(localeRecord.territory) : undefined;
  const isActive = asBoolean(input.isActive);

  return {
    id: withDefaultId("channel-language", code, asString(input.id)),
    code: normalizeLocaleCode(code),
    name,
    ...(typeof direction === "string" ? { direction } : {}),
    ...(typeof localeCode === "string" ? { localeCode: normalizeLocaleCode(localeCode) } : {}),
    ...(typeof localeTerritory === "string" ? { localeTerritory } : {}),
    ...(typeof isActive === "boolean" ? { active: isActive } : {}),
  };
}

function normalizeChannelCountry(input: unknown): CmsChannelCountry | null {
  if (!isRecord(input)) {
    return null;
  }

  const code = asString(input.code);
  const name = asString(input.name);
  if (!code || !name) {
    return null;
  }
  const language = asString(input.language);
  const currency = asString(input.currency);
  const isEnabled = asBoolean(input.isEnabled);

  return {
    code: code.toUpperCase(),
    name,
    ...(typeof language === "string" ? { language } : {}),
    ...(typeof currency === "string" ? { currency: currency.toUpperCase() } : {}),
    ...(typeof isEnabled === "boolean" ? { enabled: isEnabled } : {}),
  };
}

function normalizeChannelCurrency(input: unknown): CmsChannelCurrency | null {
  if (!isRecord(input)) {
    return null;
  }

  const code = asString(input.code);
  if (!code) {
    return null;
  }

  const name = asString(input.name);
  const symbol = asString(input.symbol);

  return {
    code: code.toUpperCase(),
    ...(typeof name === "string" ? { name } : {}),
    ...(typeof symbol === "string" ? { symbol } : {}),
  };
}

export function normalizeChannel(input: unknown): CmsChannel {
  const value = unwrapSingle(input, ["channel", "data", "item"]);
  if (!isRecord(value)) {
    throw new CmsNormalizationError("Unable to normalize CMS channel", {
      details: {
        input,
      },
    });
  }

  const idRaw = asString(value.id);
  const identifier = asString(value.identifier);
  const name = asString(value.name);

  if (!idRaw || !identifier || !name) {
    throw new CmsNormalizationError("CMS channel payload is missing required fields", {
      details: {
        id: value.id,
        identifier: value.identifier,
        name: value.name,
      },
    });
  }

  const languages = asArray(value.languages ?? (isRecord(value._embedded) ? value._embedded.languages : undefined))
    .map((entry) => normalizeChannelLanguage(entry))
    .filter((entry): entry is CmsChannelLanguage => entry !== null);
  const countries = asArray(value.countries ?? (isRecord(value._embedded) ? value._embedded.countries : undefined))
    .map((entry) => normalizeChannelCountry(entry))
    .filter((entry): entry is CmsChannelCountry => entry !== null);
  const currencies = asArray(value.currencies ?? (isRecord(value._embedded) ? value._embedded.currencies : undefined))
    .map((entry) => normalizeChannelCurrency(entry))
    .filter((entry): entry is CmsChannelCurrency => entry !== null);

  const defaultLanguage = isRecord(value.defaultLanguage)
    ? value.defaultLanguage
    : isRecord(value._embedded) && isRecord(value._embedded.defaultLanguage)
      ? value._embedded.defaultLanguage
      : isRecord(value._embedded) && isRecord(value._embedded.default_language)
        ? value._embedded.default_language
      : undefined;
  const defaultCountry = isRecord(value.defaultCountry)
    ? value.defaultCountry
    : isRecord(value._embedded) && isRecord(value._embedded.defaultCountry)
      ? value._embedded.defaultCountry
      : isRecord(value._embedded) && isRecord(value._embedded.default_country)
        ? value._embedded.default_country
      : undefined;
  const defaultCurrency = isRecord(value.defaultCurrency)
    ? value.defaultCurrency
    : isRecord(value._embedded) && isRecord(value._embedded.defaultCurrency)
      ? value._embedded.defaultCurrency
      : isRecord(value._embedded) && isRecord(value._embedded.default_currency)
        ? value._embedded.default_currency
      : undefined;

  const defaultLanguageCode = defaultLanguage ? asString(defaultLanguage.code) : undefined;
  const defaultCountryCode = defaultCountry ? asString(defaultCountry.code) : undefined;
  const defaultCurrencyCode = defaultCurrency ? asString(defaultCurrency.code) : undefined;
  const normalizedDefaultLanguageCode = defaultLanguageCode ? normalizeLocaleCode(defaultLanguageCode) : undefined;
  const normalizedDefaultCountryCode = defaultCountryCode ? defaultCountryCode.toUpperCase() : undefined;
  const normalizedDefaultCurrencyCode = defaultCurrencyCode ? defaultCurrencyCode.toUpperCase() : undefined;

  const normalizedLanguages = languages.map((language) => ({
    ...language,
    ...(normalizedDefaultLanguageCode && language.code === normalizedDefaultLanguageCode
      ? { default: true }
      : {}),
  }));
  const normalizedCountries = countries.map((country) => ({
    ...country,
    ...(normalizedDefaultCountryCode && country.code === normalizedDefaultCountryCode
      ? { default: true }
      : {}),
  }));
  const normalizedCurrencies = currencies.map((currency) => ({
    ...currency,
    ...(normalizedDefaultCurrencyCode && currency.code === normalizedDefaultCurrencyCode
      ? { default: true }
      : {}),
  }));

  return {
    id: idRaw,
    identifier,
    name,
    ...(normalizedDefaultLanguageCode ? { defaultLanguageCode: normalizedDefaultLanguageCode } : {}),
    ...(normalizedDefaultCountryCode ? { defaultCountryCode: normalizedDefaultCountryCode } : {}),
    ...(normalizedDefaultCurrencyCode ? { defaultCurrencyCode: normalizedDefaultCurrencyCode } : {}),
    languages: normalizedLanguages,
    countries: normalizedCountries,
    currencies: normalizedCurrencies,
  };
}

export const defaultCmsNormalizers: CmsResponseNormalizers = {
  page: normalizePage,
  routes: normalizeRoutes,
  menus: normalizeMenus,
  locales: normalizeLocales,
  channel: normalizeChannel,
};
