import { CmsNormalizationError } from "./errors.js";
import { normalizeLocaleCode, parseLocaleCode } from "./locales/index.js";
import type {
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

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asArray(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
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
  }

  return [];
}

function isPageContentComponentMarker(value: UnknownRecord): boolean {
  const marker = value.type ?? value._type ?? value.kind ?? value.content_type;
  return marker === "page_content_component";
}

function looksLikeComponent(value: UnknownRecord): boolean {
  const hasFields = isRecord(value.fields ?? value.data ?? value.props ?? value.values);
  const hasTypeOrKey = typeof value.type === "string"
    || typeof value.key === "string"
    || typeof value.component_type === "string"
    || typeof value.component_key === "string";

  return hasFields && hasTypeOrKey;
}

function normalizeFieldValue(value: unknown, fallbackIdPrefix: string): CmsFieldValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeFieldValue(item, `${fallbackIdPrefix}[${index}]`));
  }

  if (!isRecord(value)) {
    return null;
  }

  if (isPageContentComponentMarker(value)) {
    const nested = value.component ?? value.value ?? value.data ?? value;
    return normalizeComponent(nested, fallbackIdPrefix);
  }

  if (looksLikeComponent(value)) {
    return normalizeComponent(value, fallbackIdPrefix);
  }

  const result: Record<string, CmsFieldValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = normalizeFieldValue(entry, `${fallbackIdPrefix}.${key}`);
  }

  return result;
}

function normalizeComponent(input: unknown, fallbackId: string): CmsPageComponent {
  const value = unwrapSingle(input, ["component", "item"]);
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
    ?? asString(value.type)
    ?? asString(value.component_type)
    ?? "unknown";

  const type = asString(value.type)
    ?? asString(value.component_type)
    ?? asString(value.componentType)
    ?? key;

  const rawFields = (value.fields ?? value.data ?? value.values ?? value.props) as unknown;
  const fieldsRecord = isRecord(rawFields) ? rawFields : {};

  const fields: Record<string, CmsFieldValue> = {};
  for (const [fieldKey, fieldValue] of Object.entries(fieldsRecord)) {
    fields[fieldKey] = normalizeFieldValue(fieldValue, `${id}.${fieldKey}`);
  }

  const rawChildren = (value.children ?? value.components ?? value.child_components) as unknown;
  const childrenSource = asArray(rawChildren);
  const children = childrenSource.map((child, index) => normalizeComponent(child, `${id}.children.${index}`));

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

function normalizePageTranslation(input: unknown, fallbackLocale: string): CmsPageTranslation | null {
  if (!isRecord(input)) {
    return null;
  }

  const locale = normalizeLocaleCode(asString(input.locale) ?? fallbackLocale);
  const path = normalizePath(asString(input.path) ?? asString(input.slug) ?? "/");
  const canonical = asBoolean(input.canonical);

  return {
    locale,
    path,
    slug: toSlug(path),
    ...(typeof canonical === "boolean" ? { canonical } : {}),
  };
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

  const og = input.open_graph ?? input.opengraph ?? input.openGraph;
  let openGraph: CmsSeo["openGraph"];

  if (isRecord(og)) {
    const ogTitle = asString(og.title);
    const ogDescription = asString(og.description);
    const ogType = asString(og.type);
    const images = asArray(og.images).flatMap((image) => {
      if (!isRecord(image)) {
        return [];
      }

      const url = asString(image.url);
      if (!url) {
        return [];
      }

      const alt = asString(image.alt);
      return [{
        url,
        ...(typeof alt === "string" ? { alt } : {}),
      }];
    });

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
  const title = asString(input.title);
  const description = asString(input.description);
  const canonicalUrl = asString(input.canonical_url) ?? asString(input.canonicalUrl);

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
  const value = unwrapSingle(input, ["page", "data", "item"]);
  if (!isRecord(value)) {
    throw new CmsNormalizationError("Unable to normalize CMS page", {
      details: {
        input,
      },
    });
  }

  const locale = normalizeLocaleCode(asString(value.locale) ?? asString(value.language) ?? "en");
  const path = normalizePath(asString(value.path) ?? asString(value.slug) ?? "/");
  const canonicalPath = normalizePath(
    asString(value.canonical_path) ?? asString(value.canonicalPath) ?? path,
  );

  const rawComponents = value.components ?? value.page_content ?? value.content ?? value.body;
  const components = asArray(rawComponents).map((entry, index) => normalizeComponent(entry, `root.${index}`));

  const rawTranslations = value.translations ?? value.localized_paths ?? value.localizations;
  const translations = asArray(rawTranslations)
    .map((entry) => normalizePageTranslation(entry, locale))
    .filter((entry): entry is CmsPageTranslation => entry !== null);

  if (translations.length === 0) {
    translations.push({
      locale,
      path,
      slug: toSlug(path),
      canonical: true,
    });
  }

  const title = asString(value.title);
  const description = asString(value.description);
  const seo = normalizeSeo(value.seo ?? value.metadata);

  return {
    id: withDefaultId("page", path, asString(value.id) ?? asString(value.uuid) ?? asString(value._id)),
    locale,
    path,
    slug: toSlug(path),
    canonicalPath,
    ...(typeof title === "string" ? { title } : {}),
    ...(typeof description === "string" ? { description } : {}),
    status: (asString(value.status) as CmsPage["status"] | undefined) ?? "unknown",
    components,
    translations,
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
  if (Array.isArray(input)) {
    const entries: Array<[string, string]> = [];
    for (const entry of input) {
      if (!isRecord(entry)) {
        continue;
      }

      const locale = asString(entry.locale);
      const path = asString(entry.path) ?? asString(entry.slug);
      if (!locale || !path) {
        continue;
      }

      entries.push([normalizeLocaleCode(locale), normalizePath(path)]);
    }

    return Object.fromEntries(entries);
  }

  if (isRecord(input)) {
    const entries: Array<[string, string]> = [];
    for (const [locale, path] of Object.entries(input)) {
      if (typeof path !== "string") {
        continue;
      }

      entries.push([normalizeLocaleCode(locale), normalizePath(path)]);
    }

    return Object.fromEntries(entries);
  }

  return {};
}

export function normalizeRoutes(input: unknown): ReadonlyArray<CmsRoute> {
  const source = unwrapCollection(input, ["routes", "items", "data"]);

  return source.map((entry, index) => {
    const value = isRecord(entry) ? entry : {};
    const locale = normalizeLocaleCode(asString(value.locale) ?? "en");
    const path = normalizePath(asString(value.path) ?? asString(value.slug) ?? "/");
    const translations = normalizeRouteTranslations(value.translations ?? value.localized_paths);
    const canonicalPath = normalizePath(
      asString(value.canonical_path) ?? asString(value.canonicalPath) ?? path,
    );
    const redirectsToCanonical = asBoolean(value.redirects_to_canonical) ?? asBoolean(value.redirectsToCanonical);

    return {
      id: withDefaultId("route", `${index}`, asString(value.id) ?? asString(value.uuid)),
      pageId: withDefaultId("page", `${index}`, asString(value.page_id) ?? asString(value.pageId) ?? asString(value.page)),
      locale,
      path,
      slug: toSlug(path),
      canonicalPath,
      translations,
      ...(typeof redirectsToCanonical === "boolean" ? { redirectsToCanonical } : {}),
    };
  });
}

export function normalizeLocales(input: unknown): ReadonlyArray<CmsLocale> {
  const source = unwrapCollection(input, ["locales", "items", "data"]);

  return source.map((entry, index) => {
    const value = isRecord(entry) ? entry : {};
    const code = normalizeLocaleCode(asString(value.code) ?? asString(value.locale) ?? "en");
    const parsed = parseLocaleCode(code);
    const country = asString(value.country) ?? parsed.country;
    const label = asString(value.label) ?? asString(value.name);

    return {
      code,
      language: asString(value.language) ?? parsed.language,
      ...(typeof country === "string" ? { country } : {}),
      ...(typeof label === "string" ? { label } : {}),
      default: asBoolean(value.default) ?? false,
    };
  });
}

export const defaultCmsNormalizers: CmsResponseNormalizers = {
  page: normalizePage,
  routes: normalizeRoutes,
  menus: normalizeMenus,
  locales: normalizeLocales,
};
