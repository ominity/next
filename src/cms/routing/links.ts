import { CmsRouteResolutionError } from "../errors.js";
import { normalizeLocaleCode } from "../locales/index.js";
import type { CmsRoutingConfig } from "./config.js";
import { localePrefixSegments } from "./config.js";

export interface CmsRouteObject {
  readonly resource: "route";
  readonly name: string;
  readonly locale?: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export type CmsLinkTarget = string | CmsRouteObject;

export interface CmsLinkContext {
  readonly route: CmsRouteObject;
  readonly locale: string;
  readonly config: CmsRoutingConfig;
}

export type CmsRouteLinkResolver = (context: CmsLinkContext) => string | ReadonlyArray<string>;

export type UnknownRoutePolicy = "throw" | "passthrough";

export type StringLinkStrategy = "passthrough" | "localize-relative";

export interface CmsLinkResolverOptions {
  readonly config: CmsRoutingConfig;
  readonly routeResolvers?: Readonly<Record<string, CmsRouteLinkResolver>>;
  readonly unknownRoutePolicy?: UnknownRoutePolicy;
  readonly stringLinkStrategy?: StringLinkStrategy;
}

export interface ResolveCmsLinkOptions {
  readonly locale?: string;
}

export interface CmsResolvedLink {
  readonly href: string;
  readonly locale: string;
  readonly external: boolean;
  readonly source: "string" | "route";
  readonly routeName?: string;
}

export interface CmsLinkResolver {
  readonly config: CmsRoutingConfig;
  readonly routeResolvers: Readonly<Record<string, CmsRouteLinkResolver>>;
  resolve(target: CmsLinkTarget, options?: ResolveCmsLinkOptions): CmsResolvedLink;
}

function isExternalHref(href: string): boolean {
  return href.startsWith("http://")
    || href.startsWith("https://")
    || href.startsWith("mailto:")
    || href.startsWith("tel:")
    || href.startsWith("#")
    || href.startsWith("//");
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

function splitPath(path: string): ReadonlyArray<string> {
  return normalizePath(path)
    .split("/")
    .filter((segment) => segment.length > 0);
}

function sanitizePathSegment(segment: string): string {
  return encodeURIComponent(segment);
}

function normalizeSlugSegments(value: unknown): ReadonlyArray<string> {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .flatMap((entry) => entry.split("/"))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map(sanitizePathSegment);
  }

  if (typeof value === "string") {
    return value
      .split("/")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map(sanitizePathSegment);
  }

  return [];
}

function joinSegments(segments: ReadonlyArray<string>): string {
  if (segments.length === 0) {
    return "/";
  }

  return `/${segments.join("/")}`;
}

function applyLocalePrefix(path: string, locale: string, config: CmsRoutingConfig): string {
  const routeSegments = splitPath(path);
  const localeSegments = localePrefixSegments(locale, config);
  const merged = [...localeSegments, ...routeSegments];

  const prefixedPath = joinSegments(merged);
  const withBasePath = config.basePath.length > 0
    ? normalizePath(`${config.basePath}${prefixedPath === "/" ? "" : prefixedPath}`)
    : prefixedPath;

  if (config.trailingSlash && withBasePath !== "/") {
    return `${withBasePath}/`;
  }

  return withBasePath;
}

function productPath(parameters: Readonly<Record<string, unknown>>): string {
  const rawSku = parameters.sku;
  const rawSlug = parameters.slug;

  const sku = typeof rawSku === "number"
    ? `${rawSku}`
    : typeof rawSku === "string"
      ? rawSku
      : null;

  if (!sku || sku.trim().length === 0) {
    throw new CmsRouteResolutionError("Product route requires parameters.sku", {
      details: {
        parameters,
      },
    });
  }

  const slugSegments = normalizeSlugSegments(rawSlug);
  if (slugSegments.length === 0) {
    throw new CmsRouteResolutionError("Product route requires parameters.slug", {
      details: {
        parameters,
      },
    });
  }

  const skuPart = sanitizePathSegment(sku.trim());
  const slugPart = slugSegments.join("-");
  return `/p/${skuPart}-${slugPart}`;
}

function categoryPath(parameters: Readonly<Record<string, unknown>>): string {
  const slugSegments = normalizeSlugSegments(parameters.slug);
  if (slugSegments.length === 0) {
    throw new CmsRouteResolutionError("Category route requires parameters.slug", {
      details: {
        parameters,
      },
    });
  }

  return `/c/${slugSegments.join("/")}`;
}

function pagePath(parameters: Readonly<Record<string, unknown>>): string {
  const slugSegments = normalizeSlugSegments(parameters.slug);
  if (slugSegments.length > 0) {
    return `/${slugSegments.join("/")}`;
  }

  const id = parameters.id;
  if (typeof id === "number") {
    return `/${id}`;
  }

  if (typeof id === "string" && id.trim().length > 0) {
    return `/${sanitizePathSegment(id.trim())}`;
  }

  return "/";
}

function defaultPageRouteResolver(context: CmsLinkContext): string {
  return pagePath(context.route.parameters);
}

function defaultProductRouteResolver(context: CmsLinkContext): string {
  return productPath(context.route.parameters);
}

function defaultCategoryRouteResolver(context: CmsLinkContext): string {
  return categoryPath(context.route.parameters);
}

export function createDefaultRouteResolvers(): Readonly<Record<string, CmsRouteLinkResolver>> {
  return {
    page: defaultPageRouteResolver,
    product: defaultProductRouteResolver,
    category: defaultCategoryRouteResolver,
  };
}

function localizeRelativeStringHref(inputHref: string, locale: string, config: CmsRoutingConfig): string {
  if (!inputHref.startsWith("/")) {
    return inputHref;
  }

  return applyLocalePrefix(inputHref, locale, config);
}

function resolveLocale(target: CmsLinkTarget, options: ResolveCmsLinkOptions | undefined, config: CmsRoutingConfig): string {
  const explicitLocale = typeof options?.locale === "string"
    ? options.locale
    : typeof target !== "string" && typeof target.locale === "string"
      ? target.locale
      : config.defaultLocale;

  return normalizeLocaleCode(explicitLocale);
}

function toRoutePath(value: string | ReadonlyArray<string>): string {
  if (typeof value === "string") {
    return normalizePath(value);
  }

  return joinSegments(value.map((segment) => sanitizePathSegment(segment)));
}

export function createCmsLinkResolver(options: CmsLinkResolverOptions): CmsLinkResolver {
  const defaultResolvers = createDefaultRouteResolvers();
  const routeResolvers = {
    ...defaultResolvers,
    ...options.routeResolvers,
  };

  const unknownRoutePolicy = options.unknownRoutePolicy ?? "throw";
  const stringLinkStrategy = options.stringLinkStrategy ?? "passthrough";

  return {
    config: options.config,
    routeResolvers,
    resolve(target: CmsLinkTarget, resolveOptions?: ResolveCmsLinkOptions): CmsResolvedLink {
      const locale = resolveLocale(target, resolveOptions, options.config);

      if (typeof target === "string") {
        const external = isExternalHref(target);
        if (external) {
          return {
            href: target,
            locale,
            external: true,
            source: "string",
          };
        }

        const href = stringLinkStrategy === "localize-relative"
          ? localizeRelativeStringHref(target, locale, options.config)
          : target;

        return {
          href,
          locale,
          external: false,
          source: "string",
        };
      }

      const resolver = routeResolvers[target.name];
      if (!resolver) {
        if (unknownRoutePolicy === "passthrough") {
          const fallbackPath = target.parameters.path;
          const fallbackHref = typeof fallbackPath === "string" ? normalizePath(fallbackPath) : "/";

          return {
            href: applyLocalePrefix(fallbackHref, locale, options.config),
            locale,
            external: false,
            source: "route",
            routeName: target.name,
          };
        }

        throw new CmsRouteResolutionError(`No link resolver registered for route type: ${target.name}`, {
          details: {
            routeName: target.name,
          },
        });
      }

      const routePath = toRoutePath(resolver({
        route: target,
        locale,
        config: options.config,
      }));
      const href = applyLocalePrefix(routePath, locale, options.config);

      return {
        href,
        locale,
        external: false,
        source: "route",
        routeName: target.name,
      };
    },
  };
}
