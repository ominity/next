import {
  createOminityApiKeySdk,
  createOminityUserAccessSdk,
  requireOminityAuthenticatedUserContext,
  type OminityAuthenticatedUserContext,
  type OminityAuthRouteHandlerConfig,
} from "../../auth/server/route-handlers.js";
import {
  requireOminityActiveCustomerContext,
  type OminityActiveCustomerContext,
  type OminityCustomerContextConfig,
} from "../../customer-accounts/server/context.js";
import {
  hasAnyCustomerPermission,
  hasEveryCustomerPermission,
  hasCustomerPermission,
} from "../../customer-accounts/permissions.js";
import {
  asNonEmptyString,
  createRequestLanguageResolver,
  jsonError,
  jsonResponse,
  type MaybePromise,
} from "../../server/route-utils.js";
import type { OminityActionMethod } from "../types.js";

export interface OminityStandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<
    | PropertyKey
    | { readonly key: PropertyKey }
  > | undefined;
}

export interface OminityStandardSchemaV1<TOutput> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => MaybePromise<
      | { readonly value: TOutput; readonly issues?: undefined }
      | { readonly issues: ReadonlyArray<OminityStandardSchemaIssue> }
    >;
  };
}

export type OminityActionValidator<TOutput> =
  | OminityStandardSchemaV1<TOutput>
  | ((value: unknown) => MaybePromise<TOutput>);

export type OminityActionQueryInput = Readonly<Record<string, string | ReadonlyArray<string>>>;
export type OminityActionParamsInput = Readonly<Record<string, unknown>>;

export interface OminityActionRouteContext {
  readonly params?: OminityActionParamsInput | Promise<OminityActionParamsInput> | undefined;
}

export interface OminityActionIdempotencyOptions {
  readonly required?: boolean | undefined;
  readonly headerName?: string | undefined;
}

export type OminityActionIdempotency = boolean | OminityActionIdempotencyOptions;

export interface OminityActionFallbackError {
  readonly status?: number | undefined;
  readonly code: string;
  readonly message: string;
}

export interface OminityActionErrorContext {
  readonly request: Request;
  readonly method: OminityActionMethod;
}

export type OminityActionHandlerContext<
  TContext extends object,
  TQuery,
  TBody,
  TParams,
> = TContext & {
  readonly request: Request;
  readonly input: {
    readonly query: TQuery;
    readonly body: TBody;
    readonly params: TParams;
  };
  readonly idempotencyKey?: string | undefined;
};

export type OminityActionContextResolver<TContext extends object> = (
  request: Request,
) => MaybePromise<TContext | Response>;

export interface OminityActionOptions<
  TContext extends object,
  TQuery = OminityActionQueryInput,
  TBody = undefined,
  TParams = OminityActionParamsInput,
  TResult = unknown,
  TResponse = TResult,
> {
  readonly method: OminityActionMethod;
  readonly resolveContext: OminityActionContextResolver<TContext>;
  readonly query?: OminityActionValidator<TQuery> | undefined;
  readonly body?: OminityActionValidator<TBody> | undefined;
  readonly params?: OminityActionValidator<TParams> | undefined;
  readonly authorize?: (
    context: OminityActionHandlerContext<TContext, TQuery, TBody, TParams>,
  ) => MaybePromise<boolean | Response>;
  readonly execute: (
    context: OminityActionHandlerContext<TContext, TQuery, TBody, TParams>,
  ) => MaybePromise<TResult | Response>;
  readonly transform?: (
    result: TResult,
    context: OminityActionHandlerContext<TContext, TQuery, TBody, TParams>,
  ) => MaybePromise<TResponse>;
  readonly successStatus?: number | undefined;
  readonly responseHeaders?: Readonly<Record<string, string>> | undefined;
  readonly sameOrigin?: boolean | undefined;
  readonly siteUrl?: string | undefined;
  readonly idempotency?: OminityActionIdempotency | undefined;
  readonly error?: OminityActionFallbackError | undefined;
  readonly onError?: ((
    error: unknown,
    context: OminityActionErrorContext,
  ) => MaybePromise<void>) | undefined;
}

export type OminityActionHandler = (
  request: Request,
  routeContext?: OminityActionRouteContext,
) => Promise<Response>;

export interface OminityApiKeyActionContext {
  readonly sdk: ReturnType<typeof createOminityApiKeySdk>;
  readonly language?: string | undefined;
}

export interface OminityUserActionContext extends OminityAuthenticatedUserContext {
  readonly sdk: ReturnType<typeof createOminityUserAccessSdk>;
}

export type OminityCustomerActionContext = OminityActiveCustomerContext;

type ActionWithoutResolver<
  TContext extends object,
  TQuery,
  TBody,
  TParams,
  TResult,
  TResponse,
> = Omit<
  OminityActionOptions<TContext, TQuery, TBody, TParams, TResult, TResponse>,
  "resolveContext" | "siteUrl"
>;

export type OminityApiKeyActionOptions<
  TQuery = OminityActionQueryInput,
  TBody = undefined,
  TParams = OminityActionParamsInput,
  TResult = unknown,
  TResponse = TResult,
> = ActionWithoutResolver<
  OminityApiKeyActionContext,
  TQuery,
  TBody,
  TParams,
  TResult,
  TResponse
> & {
  readonly config: OminityAuthRouteHandlerConfig;
};

export type OminityUserActionOptions<
  TQuery = OminityActionQueryInput,
  TBody = undefined,
  TParams = OminityActionParamsInput,
  TResult = unknown,
  TResponse = TResult,
> = ActionWithoutResolver<
  OminityUserActionContext,
  TQuery,
  TBody,
  TParams,
  TResult,
  TResponse
> & {
  readonly config: OminityAuthRouteHandlerConfig;
};

export type OminityCustomerActionOptions<
  TQuery = OminityActionQueryInput,
  TBody = undefined,
  TParams = OminityActionParamsInput,
  TResult = unknown,
  TResponse = TResult,
> = ActionWithoutResolver<
  OminityCustomerActionContext,
  TQuery,
  TBody,
  TParams,
  TResult,
  TResponse
> & {
  readonly config: OminityCustomerContextConfig;
  readonly permission?: string | undefined;
  readonly everyPermission?: string | ReadonlyArray<string> | undefined;
  readonly anyPermission?: string | ReadonlyArray<string> | undefined;
};

export class OminityActionHttpError extends Error {
  readonly name: string = "OminityActionHttpError";

  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export class OminityActionValidationError extends OminityActionHttpError {
  readonly name = "OminityActionValidationError";

  constructor(
    message = "The submitted data is invalid.",
    details?: unknown,
  ) {
    super(422, "VALIDATION_FAILED", message, details);
  }
}

function queryInput(request: Request): OminityActionQueryInput {
  const result: Record<string, string | ReadonlyArray<string>> = {};
  const search = new URL(request.url).searchParams;
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    result[key] = values.length === 1 ? values[0] ?? "" : values;
  }
  return result;
}

async function bodyInput(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new OminityActionHttpError(
      400,
      "INVALID_JSON",
      "Request body must be valid JSON.",
    );
  }
}

function issuePath(issue: OminityStandardSchemaIssue): string {
  if (!issue.path || issue.path.length === 0) return "_form";
  return issue.path.map((segment) => {
    const key = typeof segment === "object" && segment !== null && "key" in segment
      ? segment.key
      : segment;
    return String(key);
  }).join(".");
}

function validationDetails(issues: ReadonlyArray<OminityStandardSchemaIssue>): {
  readonly fields: Readonly<Record<string, ReadonlyArray<string>>>;
} {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issuePath(issue);
    (fields[key] ??= []).push(issue.message);
  }
  return { fields };
}

async function validate<TOutput>(
  validator: OminityActionValidator<TOutput> | undefined,
  input: unknown,
): Promise<TOutput> {
  if (!validator) return input as TOutput;

  if (typeof validator === "function") {
    try {
      return await validator(input);
    } catch (error) {
      if (error instanceof OminityActionHttpError) throw error;
      throw new OminityActionValidationError();
    }
  }

  let result: Awaited<ReturnType<typeof validator["~standard"]["validate"]>>;
  try {
    result = await validator["~standard"].validate(input);
  } catch {
    throw new OminityActionValidationError();
  }
  if ("issues" in result && result.issues) {
    throw new OminityActionValidationError(
      "The submitted data is invalid.",
      validationDetails(result.issues),
    );
  }
  return result.value;
}

function statusFromError(error: unknown, seen = new Set<unknown>()): number | null {
  if (typeof error !== "object" || error === null || seen.has(error)) return null;
  seen.add(error);
  const record = error as {
    readonly status?: unknown;
    readonly statusCode?: unknown;
    readonly rawResponse?: unknown;
    readonly response?: unknown;
    readonly cause?: unknown;
  };
  for (const value of [record.status, record.statusCode]) {
    if (typeof value === "number" && value >= 400 && value <= 599) return value;
  }
  if (record.rawResponse instanceof Response) return record.rawResponse.status;
  if (record.response instanceof Response) return record.response.status;
  return statusFromError(record.cause, seen);
}

function errorFields(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  const fields = (error as { readonly fields?: unknown }).fields;
  return typeof fields === "object" && fields !== null ? fields : undefined;
}

function mappedErrorResponse(
  error: unknown,
  fallback: OminityActionFallbackError | undefined,
): Response {
  if (error instanceof OminityActionHttpError) {
    return jsonError(error.status, error.code, error.message, error.details);
  }

  const upstreamStatus = statusFromError(error);
  const status = upstreamStatus ?? fallback?.status ?? 500;
  const code = status === 400
    ? "BAD_REQUEST"
    : status === 401
      ? "UNAUTHENTICATED"
      : status === 403
        ? "FORBIDDEN"
        : status === 404
          ? "NOT_FOUND"
          : status === 409
            ? "CONFLICT"
            : status === 422
              ? "VALIDATION_FAILED"
              : status === 429
                ? "RATE_LIMITED"
                : fallback?.code ?? "ACTION_FAILED";
  const defaultMessage = status === 400
    ? "The request is invalid."
    : status === 401
      ? "Authentication is required."
      : status === 403
        ? "You do not have permission to perform this action."
        : status === 404
          ? "The requested resource was not found."
          : status === 409
            ? "The action conflicts with the current resource state."
            : status === 422
              ? "The submitted data is invalid."
              : status === 429
                ? "Too many requests were made. Try again later."
                : fallback?.message ?? "The operation could not be completed.";
  const fields = errorFields(error);

  return jsonError(
    status,
    code,
    defaultMessage,
    typeof fields !== "undefined" ? { fields } : undefined,
  );
}

function expectedOrigin(siteUrl: string | undefined): string | undefined {
  const value = asNonEmptyString(siteUrl);
  return value ? new URL(value).origin : undefined;
}

function isSameOrigin(request: Request, configuredOrigin: string | undefined): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = asNonEmptyString(request.headers.get("origin"));
  if (!origin) return true;
  return origin === (configuredOrigin ?? new URL(request.url).origin);
}

function idempotencyConfig(value: OminityActionIdempotency | undefined): {
  readonly enabled: boolean;
  readonly required: boolean;
  readonly headerName: string;
} {
  if (!value) return { enabled: false, required: false, headerName: "Idempotency-Key" };
  if (value === true) return { enabled: true, required: false, headerName: "Idempotency-Key" };
  return {
    enabled: true,
    required: value.required === true,
    headerName: asNonEmptyString(value.headerName) ?? "Idempotency-Key",
  };
}

function noStore(response: Response): Response {
  if (!response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

/**
 * Low-level action factory. Prefer the API-key, user, or customer wrappers so
 * authentication is derived from trusted server configuration and sessions.
 */
export function createOminityAction<
  TContext extends object,
  TQuery = OminityActionQueryInput,
  TBody = undefined,
  TParams = OminityActionParamsInput,
  TResult = unknown,
  TResponse = TResult,
>(
  options: OminityActionOptions<TContext, TQuery, TBody, TParams, TResult, TResponse>,
): OminityActionHandler {
  const configuredOrigin = expectedOrigin(options.siteUrl);
  const idempotency = idempotencyConfig(options.idempotency);

  return async (request, routeContext = {}): Promise<Response> => {
    if (request.method.toUpperCase() !== options.method) {
      const response = jsonError(405, "METHOD_NOT_ALLOWED", `Use ${options.method} for this action.`);
      response.headers.set("Allow", options.method);
      return noStore(response);
    }
    if (options.sameOrigin && !isSameOrigin(request, configuredOrigin)) {
      return noStore(jsonError(
        403,
        "INVALID_ORIGIN",
        "This request must come from the same site.",
      ));
    }

    try {
      const idempotencyKey = idempotency.enabled
        ? asNonEmptyString(request.headers.get(idempotency.headerName))
        : undefined;
      if (idempotency.required && !idempotencyKey) {
        return noStore(jsonError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          `${idempotency.headerName} is required.`,
        ));
      }

      const [context, query, body, params] = await Promise.all([
        options.resolveContext(request),
        validate(options.query, queryInput(request)),
        options.body ? bodyInput(request).then((value) => validate(options.body, value)) : undefined,
        Promise.resolve(routeContext.params ?? {}).then((value) => validate(options.params, value)),
      ]);
      if (context instanceof Response) return noStore(context);

      const actionContext = {
        ...context,
        request,
        input: { query, body: body as TBody, params },
        ...(idempotencyKey ? { idempotencyKey } : {}),
      } as OminityActionHandlerContext<TContext, TQuery, TBody, TParams>;
      const authorized = await options.authorize?.(actionContext);
      if (authorized instanceof Response) return noStore(authorized);
      if (authorized === false) {
        return noStore(jsonError(
          403,
          "FORBIDDEN",
          "You do not have permission to perform this action.",
        ));
      }

      const result = await options.execute(actionContext);
      if (result instanceof Response) return result;
      const response = options.transform
        ? await options.transform(result, actionContext)
        : result as unknown as TResponse;
      const status = options.successStatus ?? 200;
      if (status === 204) {
        return new Response(null, {
          status,
          headers: {
            "Cache-Control": "no-store",
            ...(options.responseHeaders ?? {}),
          },
        });
      }
      return jsonResponse(response, status, {
        "Cache-Control": "no-store",
        ...(options.responseHeaders ?? {}),
      });
    } catch (error) {
      try {
        await options.onError?.(error, { request, method: options.method });
      } catch {
        // Observability must not replace the original safe action response.
      }
      return noStore(mappedErrorResponse(error, options.error));
    }
  };
}

/** Creates an action backed by the server-only Ominity API key. */
export function createOminityApiKeyAction<
  TQuery = OminityActionQueryInput,
  TBody = undefined,
  TParams = OminityActionParamsInput,
  TResult = unknown,
  TResponse = TResult,
>(
  options: OminityApiKeyActionOptions<TQuery, TBody, TParams, TResult, TResponse>,
): OminityActionHandler {
  const { config, ...action } = options;
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);
  return createOminityAction({
    ...action,
    siteUrl: config.siteUrl,
    async resolveContext(request): Promise<OminityApiKeyActionContext> {
      const language = await getLanguage(request);
      return {
        sdk: createOminityApiKeySdk(config, language),
        ...(language ? { language } : {}),
      };
    },
  });
}

/** Creates an action authenticated from the encrypted user session cookie. */
export function createOminityUserAction<
  TQuery = OminityActionQueryInput,
  TBody = undefined,
  TParams = OminityActionParamsInput,
  TResult = unknown,
  TResponse = TResult,
>(
  options: OminityUserActionOptions<TQuery, TBody, TParams, TResult, TResponse>,
): OminityActionHandler {
  const { config, ...action } = options;
  return createOminityAction({
    ...action,
    sameOrigin: action.sameOrigin ?? action.method !== "GET",
    siteUrl: config.siteUrl,
    async resolveContext(request): Promise<OminityUserActionContext | Response> {
      const context = await requireOminityAuthenticatedUserContext(config, request);
      if (context instanceof Response) return context;
      return {
        ...context,
        sdk: createOminityUserAccessSdk(
          config,
          context.session.accessToken,
          context.language,
        ),
      };
    },
  });
}

/**
 * Creates an authenticated active-customer action with optional role-derived
 * permission requirements. Ominity remains the final authorization boundary.
 */
export function createOminityCustomerAction<
  TQuery = OminityActionQueryInput,
  TBody = undefined,
  TParams = OminityActionParamsInput,
  TResult = unknown,
  TResponse = TResult,
>(
  options: OminityCustomerActionOptions<TQuery, TBody, TParams, TResult, TResponse>,
): OminityActionHandler {
  const {
    config,
    permission,
    everyPermission,
    anyPermission,
    authorize,
    ...action
  } = options;
  return createOminityAction({
    ...action,
    sameOrigin: action.sameOrigin ?? action.method !== "GET",
    siteUrl: config.siteUrl,
    resolveContext: (request) => requireOminityActiveCustomerContext(config, request),
    async authorize(context) {
      const allowed = (!permission || hasCustomerPermission(context.membership, permission))
        && (!everyPermission || hasEveryCustomerPermission(context.membership, everyPermission))
        && (!anyPermission || hasAnyCustomerPermission(context.membership, anyPermission));
      if (!allowed) {
        return jsonError(
          403,
          "MISSING_CUSTOMER_PERMISSION",
          "You do not have permission to perform this customer action.",
        );
      }
      return authorize ? authorize(context) : true;
    },
  });
}
