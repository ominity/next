import { Ominity, type OminityOptions } from "@ominity/api-typescript";

export interface OminitySdkCacheOptions {
  readonly getOptions: () => OminityOptions;
  readonly defaultLanguage?: string;
}

export interface OminitySdkCache {
  get(language?: string): Ominity;
  clear(): void;
}

/** Creates server SDK instances cached per language without exposing credentials to the browser. */
export function createOminitySdkCache(options: OminitySdkCacheOptions): OminitySdkCache {
  const clients = new Map<string, Ominity>();

  return {
    get(language?: string) {
      const resolvedLanguage = language ?? options.defaultLanguage ?? "";
      const key = resolvedLanguage || "__default__";
      const current = clients.get(key);
      if (current) {
        return current;
      }

      const client = new Ominity({
        ...options.getOptions(),
        ...(resolvedLanguage ? { language: resolvedLanguage } : {}),
      });
      clients.set(key, client);
      return client;
    },

    clear() {
      clients.clear();
    },
  };
}
