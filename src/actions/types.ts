export type OminityActionMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type OminityActionQueryPrimitive = string | number | boolean;
export type OminityActionQueryValue =
  | OminityActionQueryPrimitive
  | null
  | undefined
  | ReadonlyArray<OminityActionQueryPrimitive | null | undefined>;

export type OminityActionQuery = Readonly<Record<string, OminityActionQueryValue>>;

export interface OminityActionErrorPayload {
  readonly code: string;
  readonly error: string;
  readonly details?: unknown;
}

export interface OminityActionRequestOptions<TBody = unknown> {
  readonly method?: OminityActionMethod;
  readonly query?: OminityActionQuery;
  readonly body?: TBody;
  readonly headers?: HeadersInit;
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export interface OminityResourceRequestOptions {
  readonly headers?: HeadersInit;
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
}

export type OminityResourceId = string | number;

export interface OminityResourceClientOptions {
  readonly basePath: string;
  readonly fetch?: typeof globalThis.fetch;
}

export interface OminityResourceClient<
  TItem,
  TList = ReadonlyArray<TItem>,
  TCreate = unknown,
  TUpdate = Partial<TCreate>,
> {
  list(
    query?: OminityActionQuery,
    options?: OminityResourceRequestOptions,
  ): Promise<TList>;
  get(id: OminityResourceId, options?: OminityResourceRequestOptions): Promise<TItem>;
  create(input: TCreate, options?: OminityResourceRequestOptions): Promise<TItem>;
  replace(
    id: OminityResourceId,
    input: TCreate,
    options?: OminityResourceRequestOptions,
  ): Promise<TItem>;
  update(
    id: OminityResourceId,
    input: TUpdate,
    options?: OminityResourceRequestOptions,
  ): Promise<TItem>;
  remove(id: OminityResourceId, options?: OminityResourceRequestOptions): Promise<void>;
  request<TResult, TBody = unknown>(
    path: string,
    options?: OminityActionRequestOptions<TBody>,
  ): Promise<TResult>;
}
