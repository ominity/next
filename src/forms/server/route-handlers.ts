import type { CreateSubmitHandlerConfig, MetadataValue, SubmissionPayload } from "../types.js";
import { createOminityFormSubmitHandler } from "./submitHandler.js";

const DEFAULT_OMINITY_BASE_URL = "https://demo.ominity.com/api";

type MaybePromise<T> = T | Promise<T>;

export type OminityRequestLanguageResolver = (
  request: Request,
) => MaybePromise<string | undefined>;

export interface CreateOminityFormSubmitRouteHandlerConfig {
  readonly ominityApiKey?: string | undefined;
  readonly ominityBaseUrl?: string | undefined;
  readonly recaptchaSecret?: string | undefined;
  readonly recaptchaVerificationUrl?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly useMockData?: boolean | undefined;
  readonly formsValidateFormId?: boolean | undefined;
  readonly resolveLanguage?: OminityRequestLanguageResolver | undefined;
  readonly forwardSubmission?: (params: {
    payload: SubmissionPayload;
    request: Request;
    baseUrl: string;
    ominityApiKey: string;
    fetchImpl: typeof fetch;
    language?: string;
  }) => Promise<
    | Response
    | {
      status: number;
      body?: unknown;
      headers?: Readonly<Record<string, string>>;
    }
    | unknown
  > | undefined;
  readonly enrichMetadata?: CreateSubmitHandlerConfig["enrichMetadata"] | undefined;
  readonly onBeforeForward?: CreateSubmitHandlerConfig["onBeforeForward"] | undefined;
}

interface PresignRequestPayload {
  readonly formId: number;
  readonly fieldName?: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface CreateOminityFormUploadPresignRouteHandlerConfig {
  readonly ominityApiKey?: string | undefined;
  readonly ominityBaseUrl?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly useMockData?: boolean | undefined;
  readonly siteUrl?: string | undefined;
  readonly resolveLanguage?: OminityRequestLanguageResolver | undefined;
}

export interface CreateOminityFormSubmissionUpdateRouteHandlerConfig {
  readonly ominityApiKey?: string | undefined;
  readonly ominityBaseUrl?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly useMockData?: boolean | undefined;
  readonly resolveLanguage?: OminityRequestLanguageResolver | undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function nonEmpty(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function baseUrl(value: string | undefined): string {
  return (value ?? DEFAULT_OMINITY_BASE_URL).replace(/\/$/, "");
}

function withLanguageHeader(headers: Headers, language: string | undefined): Headers {
  const resolved = nonEmpty(language);
  if (resolved) {
    headers.set("Accept-Language", resolved);
  }

  return headers;
}

function createRequestLanguageResolver(
  resolver: OminityRequestLanguageResolver | undefined,
): (request: Request) => Promise<string | undefined> {
  const cache = new WeakMap<Request, Promise<string | undefined>>();

  return async (request: Request): Promise<string | undefined> => {
    const cached = cache.get(request);
    if (cached) {
      return cached;
    }

    const promise = (async (): Promise<string | undefined> => {
      const fromResolver = nonEmpty(await resolver?.(request));
      if (fromResolver) {
        return fromResolver;
      }

      const acceptLanguage = request.headers.get("accept-language");
      const firstToken = acceptLanguage?.split(",")[0]?.split(";")[0];
      return nonEmpty(firstToken);
    })();

    cache.set(request, promise);
    return promise;
  };
}

async function verifyOminityFormExists(input: {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly formId: number | string;
  readonly fetchImpl: typeof fetch;
  readonly language?: string;
}): Promise<boolean> {
  const response = await input.fetchImpl(
    `${input.baseUrl}/v1/modules/forms/${input.formId}`,
    {
      method: "GET",
      headers: withLanguageHeader(
        new Headers({
          Authorization: `Bearer ${input.apiKey}`,
        }),
        input.language,
      ),
    },
  );

  if (!response.ok) {
    return false;
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  return payload?.resource === "form";
}

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  const sanitized = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized.length > 0 ? sanitized : "upload";
}

function buildTempPath(formId: number, filename: string): { path: string; key: string } {
  const safeFilename = `${crypto.randomUUID()}-${sanitizeFilename(filename)}`;
  const path = `forms/tmp/${formId}`;

  return {
    path,
    key: `${path}/${safeFilename}`,
  };
}

function uploadPresignUrl(input: string): string {
  const normalized = input.replace(/\/$/, "");
  if (normalized.endsWith("/api")) {
    return `${normalized}/v1/media-library/uploads/presign`;
  }

  return `${normalized}/api/v1/media-library/uploads/presign`;
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function publicUrlFromRequest(request: Request, key: string, siteUrl: string | undefined): string {
  const resolvedBase = nonEmpty(siteUrl) ?? new URL(request.url).origin;
  return `${resolvedBase.replace(/\/$/, "")}/${key}`;
}

type ParamsContext = { params: Promise<{ id: string }> };

async function contextParamId(context: ParamsContext): Promise<string> {
  const params = await context.params;
  return params.id;
}

export function createOminityFormSubmitRouteHandler(
  config: CreateOminityFormSubmitRouteHandlerConfig,
): (request: Request) => Promise<Response> {
  const fetchImpl = config.fetchImpl ?? fetch;
  if (!fetchImpl) {
    throw new Error("Fetch implementation is required for forms route handler.");
  }

  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);
  const resolvedBaseUrl = baseUrl(config.ominityBaseUrl);

  const submitHandler = createOminityFormSubmitHandler({
    ominityApiKey: config.ominityApiKey ?? "missing-api-key",
    ...(config.ominityBaseUrl ? { ominityBaseUrl: config.ominityBaseUrl } : {}),
    ...(config.recaptchaSecret ? { recaptchaSecret: config.recaptchaSecret } : {}),
    ...(config.recaptchaVerificationUrl
      ? { recaptchaVerificationUrl: config.recaptchaVerificationUrl }
      : {}),
    fetchImpl,
    enrichMetadata: async (params): Promise<MetadataValue | null | undefined> => {
      const [customMetadata, language] = await Promise.all([
        config.enrichMetadata?.(params) ?? null,
        getLanguage(params.request),
      ]);

      const locale = nonEmpty(customMetadata?.locale) ?? language;
      if (!locale && !customMetadata) {
        return null;
      }

      return {
        ...(customMetadata ?? {}),
        ...(locale ? { locale } : {}),
      };
    },
    forwardSubmission: async (params) => {
      const language = await getLanguage(params.request);

      if (config.forwardSubmission) {
        return config.forwardSubmission({
          ...params,
          ...(language ? { language } : {}),
        });
      }

      if (config.useMockData) {
        return {
          status: 201,
          body: {
            ok: true,
            mode: "mock",
            payload: params.payload,
          },
        };
      }

      const response = await fetchImpl(`${resolvedBaseUrl}/v1/modules/forms/submissions`, {
        method: "POST",
        headers: withLanguageHeader(
          new Headers({
            "Content-Type": "application/json",
            Authorization: `Bearer ${params.ominityApiKey}`,
          }),
          language,
        ),
        body: JSON.stringify(params.payload),
      });

      return new Response(await response.text(), {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("content-type") ?? "application/json",
        },
      });
    },
    ...(config.onBeforeForward ? { onBeforeForward: config.onBeforeForward } : {}),
  });

  return async (request: Request): Promise<Response> => {
    if (!config.useMockData && !nonEmpty(config.ominityApiKey)) {
      return jsonResponse(
        {
          error: "OMINITY_API_KEY is required when OMINITY_USE_MOCK_DATA=false.",
        },
        500,
      );
    }

    if (
      !config.useMockData
      && config.formsValidateFormId
      && nonEmpty(config.ominityApiKey)
      && nonEmpty(config.ominityBaseUrl)
    ) {
      const clonedRequest = request.clone();

      try {
        const payload = await clonedRequest.json() as unknown;
        const record = asObjectRecord(payload);
        const formId = record?.formId;

        if (typeof formId === "number" || typeof formId === "string") {
          const language = await getLanguage(request);
          const formExists = await verifyOminityFormExists({
            baseUrl: resolvedBaseUrl,
            apiKey: config.ominityApiKey!,
            formId,
            fetchImpl,
            ...(language ? { language } : {}),
          });

          if (!formExists) {
            return jsonResponse({ error: "Invalid form ID." }, 400);
          }
        }
      } catch {
        return jsonResponse({ error: "Invalid JSON payload." }, 400);
      }
    }

    return submitHandler(request);
  };
}

export function createOminityFormUploadPresignRouteHandler(
  config: CreateOminityFormUploadPresignRouteHandlerConfig,
): (request: Request) => Promise<Response> {
  const fetchImpl = config.fetchImpl ?? fetch;
  if (!fetchImpl) {
    throw new Error("Fetch implementation is required for upload presign route handler.");
  }

  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return async (request: Request): Promise<Response> => {
    if (
      !config.useMockData
      && (!nonEmpty(config.ominityApiKey) || !nonEmpty(config.ominityBaseUrl))
    ) {
      return jsonResponse(
        {
          error: "OMINITY_API_URL and OMINITY_API_KEY are required for file uploads.",
        },
        500,
      );
    }

    let payload: PresignRequestPayload;

    try {
      payload = (await request.json()) as PresignRequestPayload;
    } catch {
      return jsonResponse({ error: "Invalid JSON payload." }, 400);
    }

    if (
      typeof payload.formId !== "number"
      || !Number.isFinite(payload.formId)
      || payload.formId <= 0
      || typeof payload.filename !== "string"
      || payload.filename.trim().length === 0
      || typeof payload.mimeType !== "string"
      || payload.mimeType.trim().length === 0
      || typeof payload.size !== "number"
      || !Number.isFinite(payload.size)
      || payload.size <= 0
    ) {
      return jsonResponse({ error: "Invalid upload request." }, 400);
    }

    const { key, path } = buildTempPath(payload.formId, payload.filename);

    if (config.useMockData) {
      return jsonResponse({
        key,
        url: "",
        headers: {},
        publicUrl: publicUrlFromRequest(request, key, config.siteUrl),
      });
    }

    const response = await fetchImpl(uploadPresignUrl(baseUrl(config.ominityBaseUrl)), {
      method: "POST",
      headers: withLanguageHeader(
        new Headers({
          Authorization: `Bearer ${config.ominityApiKey!}`,
          "Content-Type": "application/json",
        }),
        await getLanguage(request),
      ),
      body: JSON.stringify({
        filename: key.split("/").pop(),
        path,
        mimeType: payload.mimeType,
        size: payload.size,
        metadata: {
          display_name: payload.filename,
          type: payload.fieldName ?? "form-file",
        },
      }),
    });

    const responseBody = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
      return jsonResponse(
        {
          error:
            typeof responseBody.detail === "string"
              ? responseBody.detail
              : "Unable to generate an upload URL.",
        },
        response.status || 500,
      );
    }

    return jsonResponse({
      key,
      url: typeof responseBody.url === "string" ? responseBody.url : "",
      headers:
        typeof responseBody.headers === "object" && responseBody.headers !== null
          ? responseBody.headers
          : {},
      publicUrl: typeof responseBody.publicUrl === "string" ? responseBody.publicUrl : "",
    });
  };
}

export function createOminityFormSubmissionUpdateRouteHandler(
  config: CreateOminityFormSubmissionUpdateRouteHandlerConfig,
): (request: Request, context: ParamsContext) => Promise<Response> {
  const fetchImpl = config.fetchImpl ?? fetch;
  if (!fetchImpl) {
    throw new Error("Fetch implementation is required for submission update route handler.");
  }

  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);
  const resolvedBaseUrl = baseUrl(config.ominityBaseUrl);

  return async (request: Request, context: ParamsContext): Promise<Response> => {
    const id = await contextParamId(context);
    const submissionId = Number.parseInt(id, 10);

    if (!Number.isFinite(submissionId) || submissionId <= 0) {
      return jsonResponse({ error: "Invalid submission ID." }, 400);
    }

    if (
      !config.useMockData
      && (!nonEmpty(config.ominityApiKey) || !nonEmpty(config.ominityBaseUrl))
    ) {
      return jsonResponse(
        { error: "OMINITY_API_URL and OMINITY_API_KEY are required." },
        500,
      );
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON payload." }, 400);
    }

    const record = asObjectRecord(payload);
    if (!record) {
      return jsonResponse({ error: "Invalid update payload." }, 400);
    }

    if ("data" in record && !asObjectRecord(record.data)) {
      return jsonResponse({ error: "Submission data must be an object." }, 400);
    }

    if (config.useMockData) {
      return jsonResponse(
        {
          resource: "form_submission",
          id: submissionId,
          ...(record.data && typeof record.data === "object" ? { data: record.data } : {}),
          updatedAt: new Date().toISOString(),
        },
        200,
      );
    }

    const response = await fetchImpl(
      `${resolvedBaseUrl}/v1/modules/forms/submissions/${submissionId}`,
      {
        method: "PATCH",
        headers: withLanguageHeader(
          new Headers({
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.ominityApiKey!}`,
          }),
          await getLanguage(request),
        ),
        body: JSON.stringify(record),
      },
    );

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
      },
    });
  };
}
