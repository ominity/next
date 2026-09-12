"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { OminityActionError } from "./client.js";

export interface OminityQueryLoaderOptions {
  readonly signal: AbortSignal;
}

export type OminityQueryLoader<TData> = (
  options: OminityQueryLoaderOptions,
) => Promise<TData>;

export interface UseOminityQueryOptions<TData> {
  readonly enabled?: boolean;
  readonly initialData?: TData | undefined;
  readonly onError?: ((error: OminityActionError) => void) | undefined;
}

export interface UseOminityQueryResult<TData> {
  readonly data: TData | undefined;
  readonly error: OminityActionError | null;
  readonly loading: boolean;
  readonly ready: boolean;
  refresh(): Promise<TData | undefined>;
}

export interface UseOminityMutationOptions<TResult> {
  readonly onSuccess?: ((result: TResult) => void | Promise<void>) | undefined;
  readonly onError?: ((error: OminityActionError) => void | Promise<void>) | undefined;
}

export interface UseOminityMutationResult<TInput, TResult> {
  readonly data: TResult | undefined;
  readonly error: OminityActionError | null;
  readonly pending: boolean;
  execute(input: TInput): Promise<TResult>;
  reset(): void;
}

function normalizedError(error: unknown): OminityActionError {
  if (error instanceof OminityActionError) return error;
  return new OminityActionError(
    "The operation could not be completed.",
    0,
    "ACTION_FAILED",
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Loads data with cancellation, stale-response protection, and refresh state. */
export function useOminityQuery<TData>(
  loader: OminityQueryLoader<TData>,
  options: UseOminityQueryOptions<TData> = {},
): UseOminityQueryResult<TData> {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<TData | undefined>(options.initialData);
  const [error, setError] = useState<OminityActionError | null>(null);
  const [loading, setLoading] = useState(enabled && typeof options.initialData === "undefined");
  const [ready, setReady] = useState(!enabled || typeof options.initialData !== "undefined");
  const generation = useRef(0);
  const activeController = useRef<AbortController | null>(null);

  const refresh = useCallback(async (): Promise<TData | undefined> => {
    const current = generation.current + 1;
    generation.current = current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setLoading(true);
    setError(null);

    try {
      const result = await loader({ signal: controller.signal });
      if (generation.current === current && !controller.signal.aborted) {
        setData(result);
        setReady(true);
        setLoading(false);
      }
      return result;
    } catch (caught) {
      if (isAbortError(caught) || controller.signal.aborted) return undefined;
      const nextError = normalizedError(caught);
      if (generation.current === current) {
        setError(nextError);
        setReady(true);
        setLoading(false);
        try {
          options.onError?.(nextError);
        } catch {
          // A UI callback must not replace the original query failure.
        }
      }
      throw nextError;
    }
  }, [loader, options.onError]);

  useEffect(() => {
    if (!enabled) {
      generation.current += 1;
      activeController.current?.abort();
      setLoading(false);
      setReady(true);
      return;
    }

    void refresh().catch(() => undefined);
    return () => {
      generation.current += 1;
      activeController.current?.abort();
    };
  }, [enabled, refresh]);

  return { data, error, loading, ready, refresh };
}

/** Runs an action while exposing reusable pending, result, and error state. */
export function useOminityMutation<TInput, TResult>(
  action: (input: TInput) => Promise<TResult>,
  options: UseOminityMutationOptions<TResult> = {},
): UseOminityMutationResult<TInput, TResult> {
  const [data, setData] = useState<TResult | undefined>(undefined);
  const [error, setError] = useState<OminityActionError | null>(null);
  const [pending, setPending] = useState(false);
  const generation = useRef(0);

  const execute = useCallback(async (input: TInput): Promise<TResult> => {
    const current = generation.current + 1;
    generation.current = current;
    setPending(true);
    setError(null);
    let result: TResult;
    try {
      result = await action(input);
    } catch (caught) {
      const nextError = normalizedError(caught);
      if (generation.current === current) {
        setError(nextError);
        setPending(false);
        try {
          await options.onError?.(nextError);
        } catch {
          // A UI callback must not replace the original action failure.
        }
      }
      throw nextError;
    }

    if (generation.current === current) {
      setData(result);
      setPending(false);
      await options.onSuccess?.(result);
    }
    return result;
  }, [action, options.onError, options.onSuccess]);

  const reset = useCallback(() => {
    generation.current += 1;
    setData(undefined);
    setError(null);
    setPending(false);
  }, []);

  return { data, error, pending, execute, reset };
}
