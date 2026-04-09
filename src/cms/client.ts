import { Ominity } from "@ominity/api-typescript";

import { createCmsDebugLogger } from "./debug.js";
import { CmsClientError } from "./errors.js";
import { defaultCmsNormalizers } from "./normalize.js";
import type {
  CmsClient,
  CmsClientEndpoints,
  CmsClientOptions,
  CmsClientQueryParamNames,
  CmsClientQueryParams,
  CmsGetLocalesInput,
  CmsGetMenusInput,
  CmsGetPageByPathInput,
  CmsGetRoutesInput,
  CmsResponseNormalizers,
} from "./types.js";

const defaultEndpoints: CmsClientEndpoints = {
  pageByPath: "/cms/pages",
  routes: "/cms/routes",
  menus: "/cms/menus",
  locales: "/cms/locales",
};

const defaultQueryParamNames: CmsClientQueryParamNames = {
  path: "path",
  locale: "locale",
  preview: "preview",
  menuKey: "key",
};

function mergeNormalizers(input: Partial<CmsResponseNormalizers> | undefined): CmsResponseNormalizers {
  return {
    page: input?.page ?? defaultCmsNormalizers.page,
    routes: input?.routes ?? defaultCmsNormalizers.routes,
    menus: input?.menus ?? defaultCmsNormalizers.menus,
    locales: input?.locales ?? defaultCmsNormalizers.locales,
  };
}

function buildQuery(
  queryParamNames: CmsClientQueryParamNames,
  params: CmsClientQueryParams,
): Readonly<Record<string, string>> {
  const query: Record<string, string> = {};

  if (params.path) {
    query[queryParamNames.path] = params.path;
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

  return query;
}

function buildHeaders(locale: string | undefined, requestId: string | undefined): Headers {
  const headers = new Headers();

  if (locale) {
    headers.set("Accept-Language", locale);
  }

  if (requestId) {
    headers.set("X-Request-Id", requestId);
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
    options: {
      locale?: string;
      requestId?: string;
      allowNotFound?: boolean;
    },
  ): Promise<Response> => {
    const query = buildQuery(queryParamNames, params);
    const headers = buildHeaders(options.locale, options.requestId);

    debug.emit("debug", "Requesting CMS endpoint", {
      endpoint,
      query,
      headers: Object.fromEntries(headers.entries()),
    });

    try {
      return await sdk.http.get(endpoint, {
        query,
        headers,
        errorCodes: options.allowNotFound ? ["5XX"] : ["4XX", "5XX"],
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

  const client: CmsClient = {
    ...(typeof options.sdk.language === "string" ? { sdkLanguage: options.sdk.language } : {}),
    async getPageByPath(input: CmsGetPageByPathInput) {
      const response = await requestJson(
        endpoints.pageByPath,
        {
          path: input.path,
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.preview === "boolean" ? { preview: input.preview } : {}),
        },
        {
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.requestId === "string" ? { requestId: input.requestId } : {}),
          allowNotFound: true,
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
      const page = normalizers.page(payload);

      debug.emit("debug", "Normalized CMS page", {
        pageId: page.id,
        path: page.path,
      });

      return page;
    },

    async getRoutes(input: CmsGetRoutesInput = {}) {
      const response = await requestJson(
        endpoints.routes,
        {
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.preview === "boolean" ? { preview: input.preview } : {}),
        },
        {
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
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

    async getMenus(input: CmsGetMenusInput = {}) {
      const response = await requestJson(
        endpoints.menus,
        {
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.preview === "boolean" ? { preview: input.preview } : {}),
          ...(typeof input.key === "string" ? { key: input.key } : {}),
        },
        {
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
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

    async getLocales(input: CmsGetLocalesInput = {}) {
      const response = await requestJson(
        endpoints.locales,
        {
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.preview === "boolean" ? { preview: input.preview } : {}),
        },
        {
          ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
          ...(typeof input.requestId === "string" ? { requestId: input.requestId } : {}),
          allowNotFound: true,
        },
      );

      if (response.status === 404) {
        return [];
      }

      if (!response.ok) {
        throw new CmsClientError("CMS locales request returned non-success status", {
          details: {
            status: response.status,
            endpoint: endpoints.locales,
          },
        });
      }

      const payload = await parseResponseBody(response);
      return normalizers.locales(payload);
    },
  };

  return client;
}
