import { createFormsDebugLogger, type FormsClientDebugOptions } from "./debug.js";
import { FormsClientError } from "./errors.js";
import { defaultFormsNormalizers } from "./normalize.js";
import type { OminityForm, SubmissionPayload } from "./types.js";

const DEFAULT_FORMS_BASE_URL = "https://demo.ominity.com/api";

export interface FormsClientEndpoints {
  readonly forms: string;
  readonly submissions: string;
}

const defaultEndpoints: FormsClientEndpoints = {
  forms: "/v1/modules/forms",
  submissions: "/v1/modules/forms/submissions",
};

export interface FormsGetFormByIdInput {
  readonly formId: number;
  readonly include?: string;
  readonly locale?: string;
  readonly preview?: boolean;
  readonly requestId?: string;
}

export interface FormsGetFormsInput {
  readonly include?: string;
  readonly locale?: string;
  readonly preview?: boolean;
  readonly requestId?: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
}

export interface FormsSubmitInput {
  readonly payload: SubmissionPayload;
  readonly requestId?: string;
}

export interface FormsResponseNormalizers {
  readonly form: (input: unknown) => OminityForm;
  readonly forms: (input: unknown) => ReadonlyArray<OminityForm>;
}

export interface FormsClientAdapter {
  getFormById?(input: FormsGetFormByIdInput): Promise<unknown>;
  getForms?(input?: FormsGetFormsInput): Promise<unknown>;
  submit?(input: FormsSubmitInput): Promise<unknown>;
}

export interface FormsClientOptions {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
  readonly headers?: Readonly<Record<string, string>>;
  readonly debug?: FormsClientDebugOptions;
  readonly adapter?: FormsClientAdapter;
  readonly endpoints?: Partial<FormsClientEndpoints>;
  readonly normalizers?: Partial<FormsResponseNormalizers>;
}

export interface FormsClient {
  getFormById(input: FormsGetFormByIdInput): Promise<OminityForm | null>;
  getForms(input?: FormsGetFormsInput): Promise<ReadonlyArray<OminityForm>>;
  submit(input: FormsSubmitInput): Promise<unknown>;
}

function parseBaseUrl(input: string | undefined): string {
  const value = input ?? DEFAULT_FORMS_BASE_URL;
  return value.replace(/\/$/, "");
}

function buildUrl(
  baseUrl: string,
  endpoint: string,
  query: Readonly<Record<string, string>>,
): string {
  const url = new URL(endpoint.replace(/^\//, ""), `${baseUrl}/`);

  Object.entries(query).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

function buildCommonHeaders(options: {
  apiKey?: string | undefined;
  locale?: string | undefined;
  requestId?: string | undefined;
  headers?: Readonly<Record<string, string>> | undefined;
}): Headers {
  const headers = new Headers(options.headers ?? {});

  if (options.apiKey) {
    headers.set("Authorization", `Bearer ${options.apiKey}`);
  }

  if (options.locale) {
    headers.set("Accept-Language", options.locale);
  }

  if (options.requestId) {
    headers.set("X-Request-Id", options.requestId);
  }

  return headers;
}

function buildQuery(input: {
  include?: string | undefined;
  preview?: boolean | undefined;
  query?: Readonly<Record<string, string | number | boolean | undefined>> | undefined;
}): Readonly<Record<string, string>> {
  const query: Record<string, string> = {};

  if (input.include) {
    query.include = input.include;
  }

  if (typeof input.preview === "boolean") {
    query.preview = input.preview ? "true" : "false";
  }

  if (input.query) {
    Object.entries(input.query).forEach(([key, value]) => {
      if (typeof value === "undefined") {
        return;
      }

      query[key] = `${value}`;
    });
  }

  return query;
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

function mergeNormalizers(
  input: Partial<FormsResponseNormalizers> | undefined,
): FormsResponseNormalizers {
  return {
    form: input?.form ?? defaultFormsNormalizers.form,
    forms: input?.forms ?? defaultFormsNormalizers.forms,
  };
}

export function createFormsClient(options: FormsClientOptions = {}): FormsClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!fetchImpl) {
    throw new FormsClientError("Fetch implementation is required to create forms client.");
  }

  const baseUrl = parseBaseUrl(options.baseUrl);
  const endpoints = {
    ...defaultEndpoints,
    ...options.endpoints,
  };
  const normalizers = mergeNormalizers(options.normalizers);
  const debug = createFormsDebugLogger(options.debug, "forms-client");

  const request = async (
    endpoint: string,
    input: {
      method: "GET" | "POST";
      locale?: string | undefined;
      requestId?: string | undefined;
      query?: Readonly<Record<string, string>> | undefined;
      body?: unknown;
      allowNotFound?: boolean | undefined;
    },
  ): Promise<Response> => {
    const query = input.query ?? {};
    const url = buildUrl(baseUrl, endpoint, query);
    const headers = buildCommonHeaders({
      apiKey: options.apiKey,
      locale: input.locale,
      requestId: input.requestId,
      headers: options.headers,
    });

    if (input.method !== "GET") {
      headers.set("Content-Type", "application/json");
    }

    debug.emit("debug", "Requesting forms endpoint", {
      method: input.method,
      url,
      query,
      headers: Object.fromEntries(headers.entries()),
    });

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: input.method,
        headers,
        ...(typeof input.body !== "undefined" ? { body: JSON.stringify(input.body) } : {}),
      });
    } catch (error) {
      debug.emit("error", "Forms request failed", {
        method: input.method,
        url,
        query,
        error,
      });

      throw new FormsClientError("Forms request failed", {
        cause: error,
        details: {
          method: input.method,
          url,
          query,
        },
      });
    }

    if (input.allowNotFound && response.status === 404) {
      return response;
    }

    if (!response.ok) {
      throw new FormsClientError("Forms request returned non-success status", {
        code: "FORMS_CLIENT_RESPONSE_INVALID",
        details: {
          method: input.method,
          url,
          query,
          status: response.status,
        },
      });
    }

    return response;
  };

  return {
    async getFormById(input: FormsGetFormByIdInput): Promise<OminityForm | null> {
      if (input.formId <= 0 || !Number.isInteger(input.formId)) {
        throw new FormsClientError("Invalid formId provided.", {
          code: "FORMS_CLIENT_RESPONSE_INVALID",
          details: {
            formId: input.formId,
          },
        });
      }

      const payload = options.adapter?.getFormById
        ? await options.adapter.getFormById(input)
        : await (async () => {
          const response = await request(`${endpoints.forms}/${input.formId}`, {
            method: "GET",
            locale: input.locale,
            requestId: input.requestId,
            query: buildQuery({
              include: input.include,
              preview: input.preview,
            }),
            allowNotFound: true,
          });

          if (response.status === 404) {
            return null;
          }

          return parseResponseBody(response);
        })();

      if (payload === null) {
        return null;
      }

      return normalizers.form(payload);
    },

    async getForms(input: FormsGetFormsInput = {}): Promise<ReadonlyArray<OminityForm>> {
      const payload = options.adapter?.getForms
        ? await options.adapter.getForms(input)
        : await (async () => {
          const response = await request(endpoints.forms, {
            method: "GET",
            locale: input.locale,
            requestId: input.requestId,
            query: buildQuery({
              include: input.include,
              preview: input.preview,
              query: input.query,
            }),
          });

          return parseResponseBody(response);
        })();

      return normalizers.forms(payload);
    },

    async submit(input: FormsSubmitInput): Promise<unknown> {
      if (options.adapter?.submit) {
        return options.adapter.submit(input);
      }

      const response = await request(endpoints.submissions, {
        method: "POST",
        requestId: input.requestId,
        body: input.payload,
      });

      return parseResponseBody(response);
    },
  };
}

export type { FormsClientDebugOptions };
