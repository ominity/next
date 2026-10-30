"use client";

import type { Ominity } from "@ominity/api-typescript";
import type { Paginated } from "@ominity/api-typescript/models";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { OminityActionError } from "../actions/client.js";
import {
  useOminityMutation,
  useOminityQuery,
  type UseOminityMutationOptions,
  type UseOminityMutationResult,
  type UseOminityQueryResult,
} from "../actions/react.js";
import { useOminityCustomerAccounts } from "../customer-accounts/react.js";
import { CustomerAccountsError } from "../customer-accounts/errors.js";
import type { CustomerPermissionRequirement } from "../customer-accounts/types.js";
import { createOminityBrowserSdk, type OminityBrowserSdkOptions } from "./client.js";
import { toOminitySdkError } from "./errors.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 250;

const OminitySdkContext = createContext<Ominity | null>(null);
let defaultSdk: Ominity | null = null;

export interface OminitySdkProviderProps {
  readonly children: ReactNode;
  /** A ready SDK instance; otherwise one is created from `options`. */
  readonly sdk?: Ominity | undefined;
  /** Read once, when the provider mounts. */
  readonly options?: OminityBrowserSdkOptions | undefined;
}

export function OminitySdkProvider(props: OminitySdkProviderProps) {
  const created = useRef<Ominity | null>(null);
  if (!props.sdk && !created.current) created.current = createOminityBrowserSdk(props.options);
  const sdk = props.sdk ?? created.current as Ominity;
  return <OminitySdkContext.Provider value={sdk}>{props.children}</OminitySdkContext.Provider>;
}

/**
 * The browser SDK from the nearest `OminitySdkProvider`, or a shared one talking to the default gateway path.
 */
export function useOminitySdk(): Ominity {
  const sdk = useContext(OminitySdkContext);
  if (sdk) return sdk;
  defaultSdk ??= createOminityBrowserSdk();
  return defaultSdk;
}

/** Reloads happen when this changes; compared by value. */
export type OminitySdkQueryKey = unknown;

function serializedKey(key: OminitySdkQueryKey): string {
  try {
    return JSON.stringify(key ?? null) ?? "null";
  } catch {
    throw new TypeError("An Ominity query key must be JSON-serializable.");
  }
}

async function sdkCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toOminitySdkError(error);
  }
}

/** Keeps a callback's latest version without changing its identity. */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export interface OminitySdkQueryContext {
  /** Pass on as `{ signal }` in the SDK call's options so a superseded request is cancelled. */
  readonly signal: AbortSignal;
}

export type OminitySdkQueryLoader<TData> = (sdk: Ominity, context: OminitySdkQueryContext) => Promise<TData>;

export interface UseOminitySdkQueryOptions<TData> {
  /** The values the loader depends on, e.g. `[subscriptionId]`. The query reloads when they change. */
  readonly key?: OminitySdkQueryKey;
  readonly enabled?: boolean | undefined;
  readonly initialData?: TData | undefined;
  readonly onError?: ((error: OminityActionError) => void) | undefined;
}

interface Keyed<TData> {
  readonly key: string;
  readonly data: TData;
}

/**
 * Loads data with the browser SDK: loading and error state, cancellation, and a reload when `key` changes. Data of a
 * previous key is never returned.
 *
 * ```tsx
 * const { data, loading } = useOminitySdkQuery(
 *   (sdk, { signal }) => sdk.commerce.products.get({ id }, { signal }),
 *   { key: [id] },
 * );
 * ```
 */
export function useOminitySdkQuery<TData>(
  loader: OminitySdkQueryLoader<TData>,
  options: UseOminitySdkQueryOptions<TData> = {},
): UseOminityQueryResult<TData> {
  const sdk = useOminitySdk();
  const enabled = options.enabled ?? true;
  const key = serializedKey(options.key);
  const loaderRef = useLatest(loader);
  const onErrorRef = useLatest(options.onError);
  const initialKey = useRef(key);

  const keyedLoader = useCallback(async ({ signal }: { signal: AbortSignal }): Promise<Keyed<TData>> => ({
    key,
    data: await sdkCall(() => loaderRef.current(sdk, { signal })),
  }), [sdk, key, loaderRef]);
  const onError = useCallback((error: OminityActionError) => onErrorRef.current?.(error), [onErrorRef]);

  const query = useOminityQuery<Keyed<TData>>(keyedLoader, {
    enabled,
    onError,
    ...(typeof options.initialData !== "undefined" ? { initialData: { key: initialKey.current, data: options.initialData } } : {}),
  });
  const current = query.data?.key === key ? query.data : undefined;
  const settled = Boolean(current) || query.error !== null;

  return {
    data: current?.data,
    error: query.error,
    loading: enabled && (query.loading || !settled),
    ready: !enabled || (query.ready && settled),
    async refresh() {
      const result = await query.refresh();
      return result?.key === key ? result.data : undefined;
    },
  };
}

/**
 * Runs a write with the browser SDK, exposing `pending`, the result and the error.
 *
 * ```tsx
 * const quote = useOminitySdkMutation((sdk, offerId: number) =>
 *   sdk.commerce.customerSubscriptions.quoteChange({ customerId, subscriptionId, data: { toOfferId: offerId } }));
 * ```
 */
export function useOminitySdkMutation<TInput, TResult>(
  action: (sdk: Ominity, input: TInput) => Promise<TResult>,
  options: UseOminityMutationOptions<TResult> = {},
): UseOminityMutationResult<TInput, TResult> {
  const sdk = useOminitySdk();
  const actionRef = useLatest(action);
  const onSuccessRef = useLatest(options.onSuccess);
  const onErrorRef = useLatest(options.onError);

  const run = useCallback(
    (input: TInput) => sdkCall(() => actionRef.current(sdk, input)),
    [sdk, actionRef],
  );
  const onSuccess = useCallback(async (result: TResult) => onSuccessRef.current?.(result), [onSuccessRef]);
  const onError = useCallback(async (error: OminityActionError) => onErrorRef.current?.(error), [onErrorRef]);

  return useOminityMutation(run, { onSuccess, onError });
}

export interface OminitySdkPageContext extends OminitySdkQueryContext {
  readonly page: number;
  readonly limit: number;
}

export type OminitySdkPageLoader<TItem> = (sdk: Ominity, context: OminitySdkPageContext) => Promise<Paginated<TItem>>;

export interface UseOminitySdkPaginatedQueryOptions {
  readonly key?: OminitySdkQueryKey;
  readonly enabled?: boolean | undefined;
  /** Items per page, 1–250. Defaults to 20. */
  readonly pageSize?: number | undefined;
  readonly initialPage?: number | undefined;
  /** `pages` shows one page at a time; `append` adds each next page to the list ("load more"). Defaults to `pages`. */
  readonly mode?: "pages" | "append" | undefined;
  readonly onError?: ((error: OminityActionError) => void) | undefined;
}

export interface UseOminitySdkPaginatedQueryResult<TItem> {
  /** The current page, or every page loaded so far in `append` mode. */
  readonly items: ReadonlyArray<TItem>;
  readonly page: number;
  readonly pageSize: number;
  /** Total number of items, 0 until the first page is loaded. */
  readonly count: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
  readonly loading: boolean;
  /** Loading a next page in `append` mode, while the earlier pages stay shown. */
  readonly loadingMore: boolean;
  readonly ready: boolean;
  readonly error: OminityActionError | null;
  setPage(page: number): void;
  next(): void;
  previous(): void;
  /** Loads the next page; in `append` mode it is added to `items`. */
  loadMore(): void;
  /** Reloads the current page, or in `append` mode starts again from the first page. */
  refresh(): Promise<void>;
}

interface PageResult<TItem> {
  readonly key: string;
  readonly page: number;
  readonly result: Paginated<TItem>;
}

/**
 * Paginated lists with the browser SDK. While a next page loads the current one stays shown; a change of `key`
 * starts again from the first page and never shows the previous key's items.
 *
 * ```tsx
 * const orders = useOminitySdkPaginatedQuery(
 *   (sdk, { page, limit, signal }) => sdk.commerce.customerOrders.list({ customerId, page, limit }, { signal }),
 *   { key: [customerId], mode: "append" },
 * );
 * ```
 */
export function useOminitySdkPaginatedQuery<TItem>(
  loader: OminitySdkPageLoader<TItem>,
  options: UseOminitySdkPaginatedQueryOptions = {},
): UseOminitySdkPaginatedQueryResult<TItem> {
  const sdk = useOminitySdk();
  const enabled = options.enabled ?? true;
  const mode = options.mode ?? "pages";
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const initialPage = Math.max(Math.trunc(options.initialPage ?? 1), 1);
  const key = serializedKey([options.key, pageSize, mode, initialPage]);
  const loaderRef = useLatest(loader);
  const onErrorRef = useLatest(options.onError);

  const [position, setPosition] = useState({ key, page: initialPage, generation: 0 });
  const page = position.key === key ? position.page : initialPage;
  const generation = position.key === key ? position.generation : 0;
  const [loaded, setLoaded] = useState<{ key: string; generation: number; pages: ReadonlyMap<number, ReadonlyArray<TItem>> }>(
    { key, generation: 0, pages: new Map() },
  );

  const pageLoader = useCallback(async ({ signal }: { signal: AbortSignal }): Promise<PageResult<TItem>> => ({
    key: `${key}#${generation}`,
    page,
    result: await sdkCall(() => loaderRef.current(sdk, { signal, page, limit: pageSize })),
  }), [sdk, key, generation, page, pageSize, loaderRef]);
  const onError = useCallback((error: OminityActionError) => onErrorRef.current?.(error), [onErrorRef]);
  const query = useOminityQuery<PageResult<TItem>>(pageLoader, { enabled, onError });

  const current = query.data?.key === `${key}#${generation}` ? query.data : undefined;

  useEffect(() => {
    if (mode !== "append" || !current) return;
    setLoaded((previous) => {
      const pages = new Map(previous.key === key && previous.generation === generation ? previous.pages : []);
      pages.set(current.page, current.result.items);
      return { key, generation, pages };
    });
  }, [current, generation, key, mode]);

  const items = useMemo((): ReadonlyArray<TItem> => {
    if (mode !== "append") return current?.result.items ?? [];
    if (loaded.key !== key || loaded.generation !== generation) return [];
    const all: TItem[] = [];
    for (let index = initialPage; loaded.pages.has(index); index += 1) {
      all.push(...(loaded.pages.get(index) ?? []));
    }
    return all;
  }, [current, generation, initialPage, key, loaded, mode]);

  const result = current?.result;
  const hasNext = result?.hasNext ?? false;
  const hasPrevious = page > 1;
  const loading = enabled && (query.loading || (!current && query.error === null));

  const setPage = useCallback((next: number) => {
    setPosition({ key, page: Math.max(Math.trunc(next), 1), generation });
  }, [generation, key]);
  const next = useCallback(() => {
    if (hasNext && !loading) setPage(page + 1);
  }, [hasNext, loading, page, setPage]);
  const previous = useCallback(() => {
    if (page > 1) setPage(page - 1);
  }, [page, setPage]);

  return {
    items,
    page,
    pageSize,
    count: result?.count ?? 0,
    totalPages: result?.totalPages ?? 0,
    hasNext,
    hasPrevious,
    loading,
    loadingMore: mode === "append" && loading && page > initialPage,
    ready: !enabled || (query.ready && (Boolean(current) || query.error !== null)),
    error: query.error,
    setPage,
    next,
    previous,
    loadMore: next,
    async refresh() {
      if (mode === "append") {
        setPosition({ key, page: initialPage, generation: generation + 1 });
        return;
      }
      await query.refresh().catch(() => undefined);
    },
  };
}

export interface OminityCustomerSdkContext {
  readonly customerId: number;
}

export interface UseOminityCustomerSdkOptions {
  /** Only loads when the active customer membership has these permissions. */
  readonly permission?: CustomerPermissionRequirement | undefined;
  readonly permissionMode?: "all" | "any" | undefined;
}

function useActiveCustomer(options: UseOminityCustomerSdkOptions): { customerId: number | null; enabled: boolean } {
  const accounts = useOminityCustomerAccounts();
  const allowed = !options.permission
    || (options.permissionMode === "any" ? accounts.canAny(options.permission) : accounts.canAll(options.permission));
  return {
    customerId: accounts.activeCustomerId,
    enabled: accounts.ready && accounts.activeCustomerId !== null && allowed,
  };
}

/**
 * `useOminitySdkQuery` for the active customer (needs `OminityCustomerAccountsProvider`). Reloads when the customer is
 * switched and never returns the previous customer's data.
 */
export function useOminityCustomerSdkQuery<TData>(
  loader: (sdk: Ominity, context: OminitySdkQueryContext & OminityCustomerSdkContext) => Promise<TData>,
  options: UseOminitySdkQueryOptions<TData> & UseOminityCustomerSdkOptions = {},
): UseOminityQueryResult<TData> {
  const { customerId, enabled } = useActiveCustomer(options);
  const loaderRef = useLatest(loader);

  return useOminitySdkQuery(
    (sdk, context) => loaderRef.current(sdk, { ...context, customerId: customerId as number }),
    {
      ...options,
      key: [customerId, options.key],
      enabled: (options.enabled ?? true) && enabled,
    },
  );
}

/** `useOminitySdkPaginatedQuery` for the active customer (needs `OminityCustomerAccountsProvider`). */
export function useOminityCustomerSdkPaginatedQuery<TItem>(
  loader: (sdk: Ominity, context: OminitySdkPageContext & OminityCustomerSdkContext) => Promise<Paginated<TItem>>,
  options: UseOminitySdkPaginatedQueryOptions & UseOminityCustomerSdkOptions = {},
): UseOminitySdkPaginatedQueryResult<TItem> {
  const { customerId, enabled } = useActiveCustomer(options);
  const loaderRef = useLatest(loader);

  return useOminitySdkPaginatedQuery(
    (sdk, context) => loaderRef.current(sdk, { ...context, customerId: customerId as number }),
    {
      ...options,
      key: [customerId, options.key],
      enabled: (options.enabled ?? true) && enabled,
    },
  );
}

/** `useOminitySdkMutation` for the active customer (needs `OminityCustomerAccountsProvider`). */
export function useOminityCustomerSdkMutation<TInput, TResult>(
  action: (sdk: Ominity, input: TInput, context: OminityCustomerSdkContext) => Promise<TResult>,
  options: UseOminityMutationOptions<TResult> = {},
): UseOminityMutationResult<TInput, TResult> {
  const accounts = useOminityCustomerAccounts();
  const customerId = accounts.activeCustomerId;
  const actionRef = useLatest(action);

  return useOminitySdkMutation((sdk, input: TInput) => {
    if (customerId === null) {
      throw new CustomerAccountsError("No customer account is active.", 409, "NO_ACTIVE_CUSTOMER");
    }
    return actionRef.current(sdk, input, { customerId });
  }, options);
}
