export type MaybePromise<T> = T | Promise<T>;

export type OminityRequestLanguageResolver = (
  request: Request,
) => MaybePromise<string | undefined>;

export interface RouteCookieValue {
  readonly value: string;
}

export interface RouteCookieStore {
  get(name: string): RouteCookieValue | undefined;
  set(...args: any[]): unknown;
}

export function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers?: Readonly<Record<string, string>>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  });
}

export function jsonError(
  status: number,
  code: string,
  error: string,
  details?: unknown,
): Response {
  return jsonResponse({
    error,
    code,
    ...(typeof details !== "undefined" ? { details } : {}),
  }, status);
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export function createRequestLanguageResolver(
  resolver: OminityRequestLanguageResolver | undefined,
): (request: Request) => Promise<string | undefined> {
  const cache = new WeakMap<Request, Promise<string | undefined>>();

  return async (request: Request): Promise<string | undefined> => {
    const cached = cache.get(request);
    if (cached) {
      return cached;
    }

    const promise = (async (): Promise<string | undefined> => {
      const fromResolver = asNonEmptyString(await resolver?.(request));
      if (fromResolver) {
        return fromResolver;
      }

      const acceptLanguage = request.headers.get("accept-language");
      const firstToken = acceptLanguage?.split(",")[0]?.split(";")[0];
      return asNonEmptyString(firstToken);
    })();

    cache.set(request, promise);
    return promise;
  };
}

export async function loadNextCookiesStore(): Promise<RouteCookieStore> {
  const module = await import("next/headers");
  return await module.cookies() as RouteCookieStore;
}
