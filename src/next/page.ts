import type {
  CmsClient,
  CmsPage,
  CmsRoute,
  CmsRoutingConfig,
} from "../cms/index.js";
import {
  generateStaticParams,
  resolveCmsRoute,
  resolvePathFromParams,
} from "../cms/routing/index.js";

export interface ResolveCmsPathFromParamsInput {
  readonly params: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>;
  readonly catchAllParam?: string;
}

export interface FetchCmsPageForParamsInput {
  readonly client: CmsClient;
  readonly routes: ReadonlyArray<CmsRoute>;
  readonly params: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>;
  readonly routing: CmsRoutingConfig;
  readonly catchAllParam?: string;
  readonly preview?: boolean;
  readonly requestId?: string;
}

export interface GenerateCmsStaticParamsInput {
  readonly routes: ReadonlyArray<CmsRoute>;
  readonly routing: CmsRoutingConfig;
  readonly catchAllParam?: string;
}

export interface FetchCmsPageForParamsResult {
  readonly page: CmsPage;
  readonly route: {
    readonly locale: string;
    readonly incomingPath: string;
    readonly localizedPath: string;
    readonly canonicalPath: string;
    readonly shouldRedirect: boolean;
    readonly route: CmsRoute;
  };
}

export function resolveCmsPathFromParams(input: ResolveCmsPathFromParamsInput): string {
  if (typeof input.catchAllParam === "string") {
    return resolvePathFromParams(input.params, input.catchAllParam);
  }

  return resolvePathFromParams(input.params);
}

export async function fetchCmsPageForParams(input: FetchCmsPageForParamsInput): Promise<FetchCmsPageForParamsResult | null> {
  const incomingPath = resolveCmsPathFromParams({
    params: input.params,
    ...(typeof input.catchAllParam === "string" ? { catchAllParam: input.catchAllParam } : {}),
  });

  const resolvedRoute = resolveCmsRoute({
    routes: input.routes,
    incomingPath,
    config: input.routing,
  });

  if (!resolvedRoute) {
    return null;
  }

  const page = await input.client.getPageByPath({
    path: resolvedRoute.localizedPath,
    locale: resolvedRoute.locale,
    ...(typeof input.preview === "boolean" ? { preview: input.preview } : {}),
    ...(typeof input.requestId === "string" ? { requestId: input.requestId } : {}),
  });

  if (!page) {
    return null;
  }

  return {
    page,
    route: {
      locale: resolvedRoute.locale,
      incomingPath: resolvedRoute.incomingPath,
      localizedPath: resolvedRoute.localizedPath,
      canonicalPath: resolvedRoute.canonicalPath,
      shouldRedirect: resolvedRoute.shouldRedirect,
      route: resolvedRoute.route,
    },
  };
}

export function generateCmsStaticParams(input: GenerateCmsStaticParamsInput): ReadonlyArray<
  Readonly<Record<string, ReadonlyArray<string>>>
> {
  return generateStaticParams({
    routes: input.routes,
    config: input.routing,
    ...(typeof input.catchAllParam === "string" ? { catchAllParam: input.catchAllParam } : {}),
  });
}
