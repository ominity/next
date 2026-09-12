import type {
  OminityActionErrorPayload,
  OminityActionQuery,
  OminityActionRequestOptions,
  OminityResourceClient,
  OminityResourceClientOptions,
  OminityResourceId,
  OminityResourceRequestOptions,
} from "./types.js";

export class OminityActionError extends Error {
  readonly name = "OminityActionError";

  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  get fields(): Readonly<Record<string, ReadonlyArray<string>>> | undefined {
    if (typeof this.details !== "object" || this.details === null) return undefined;
    const fields = (this.details as { readonly fields?: unknown }).fields;
    return typeof fields === "object" && fields !== null
      ? fields as Readonly<Record<string, ReadonlyArray<string>>>
      : undefined;
  }

  get isAuthenticationError(): boolean {
    return this.status === 401;
  }

  get isAuthorizationError(): boolean {
    return this.status === 403;
  }

  get isValidationError(): boolean {
    return this.status === 400 || this.status === 422;
  }

  get isRetryable(): boolean {
    return this.status === 0
      || this.status === 408
      || this.status === 425
      || this.status === 429
      || this.status >= 500;
  }
}

function sameOriginPath(value: string, name: string): string {
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new TypeError(`${name} must be a same-origin path starting with a single slash.`);
  }
  return path;
}

function normalizedBasePath(value: string): string {
  const path = sameOriginPath(value, "basePath");
  return path.length > 1 ? path.replace(/\/+$/, "") : "";
}

function appendQuery(path: string, query: OminityActionQuery | undefined): string {
  if (!query) return path;

  const [pathname = "", existing = ""] = path.split("?", 2);
  const params = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(query)) {
    params.delete(key);
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== null && typeof item !== "undefined") {
        params.append(key, String(item));
      }
    }
  }
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

async function responsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

function actionError(response: Response, payload: unknown): OminityActionError {
  const record = typeof payload === "object" && payload !== null
    ? payload as Partial<OminityActionErrorPayload>
    : null;
  return new OminityActionError(
    typeof record?.error === "string"
      ? record.error
      : `Request failed (${response.status}).`,
    response.status,
    typeof record?.code === "string" ? record.code : "ACTION_REQUEST_FAILED",
    record?.details,
  );
}

/** Calls a same-origin action route and normalizes its structured errors. */
export async function requestOminityAction<TResult, TBody = unknown>(
  path: string,
  options: OminityActionRequestOptions<TBody> = {},
): Promise<TResult> {
  const url = appendQuery(sameOriginPath(path, "path"), options.query);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new OminityActionError(
      "A fetch implementation is required.",
      0,
      "FETCH_UNAVAILABLE",
    );
  }

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (typeof options.body !== "undefined") {
    headers.set("Content-Type", "application/json");
  }
  if (options.idempotencyKey?.trim()) {
    headers.set("Idempotency-Key", options.idempotencyKey.trim());
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: options.method ?? "GET",
      headers,
      ...(typeof options.body !== "undefined"
        ? { body: JSON.stringify(options.body) }
        : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw caught;
    }
    throw new OminityActionError(
      "The request could not reach the application.",
      0,
      "NETWORK_ERROR",
    );
  }

  const payload = await responsePayload(response);
  if (!response.ok) {
    throw actionError(response, payload);
  }
  return payload as TResult;
}

function resourceId(value: OminityResourceId): string {
  const normalized = String(value).trim();
  if (!normalized || normalized === "." || normalized === "..") {
    throw new TypeError("resource id cannot be empty.");
  }
  return encodeURIComponent(normalized);
}

function requestOptions<TBody>(
  method: NonNullable<OminityActionRequestOptions<TBody>["method"]>,
  body: TBody | undefined,
  options: OminityResourceRequestOptions | undefined,
): OminityActionRequestOptions<TBody> {
  return {
    method,
    ...(typeof body !== "undefined" ? { body } : {}),
    ...(options?.headers ? { headers: options.headers } : {}),
    ...(options?.signal ? { signal: options.signal } : {}),
    ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
  };
}

/** Creates conventional list/get/create/replace/update/delete route helpers. */
export function createOminityResourceClient<
  TItem,
  TList = ReadonlyArray<TItem>,
  TCreate = unknown,
  TUpdate = Partial<TCreate>,
>(
  options: OminityResourceClientOptions,
): OminityResourceClient<TItem, TList, TCreate, TUpdate> {
  const basePath = normalizedBasePath(options.basePath);
  const call = <TResult, TBody = unknown>(
    path: string,
    input: OminityActionRequestOptions<TBody> = {},
  ) => requestOminityAction<TResult, TBody>(
    path === "" ? basePath || "/" : `${basePath}${sameOriginPath(path, "resource path")}`,
    {
      ...input,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    },
  );

  return {
    list(query, requestOptionsValue) {
      return call<TList>("", {
        ...(query ? { query } : {}),
        ...requestOptions("GET", undefined, requestOptionsValue),
      });
    },
    get(id, requestOptionsValue) {
      return call<TItem>(`/${resourceId(id)}`, requestOptions("GET", undefined, requestOptionsValue));
    },
    create(input, requestOptionsValue) {
      return call<TItem, TCreate>("", requestOptions("POST", input, requestOptionsValue));
    },
    replace(id, input, requestOptionsValue) {
      return call<TItem, TCreate>(
        `/${resourceId(id)}`,
        requestOptions("PUT", input, requestOptionsValue),
      );
    },
    update(id, input, requestOptionsValue) {
      return call<TItem, TUpdate>(
        `/${resourceId(id)}`,
        requestOptions("PATCH", input, requestOptionsValue),
      );
    },
    async remove(id, requestOptionsValue) {
      await call<void>(
        `/${resourceId(id)}`,
        requestOptions("DELETE", undefined, requestOptionsValue),
      );
    },
    request<TResult, TBody = unknown>(path: string, input: OminityActionRequestOptions<TBody> = {}) {
      return call<TResult, TBody>(path, input);
    },
  };
}
