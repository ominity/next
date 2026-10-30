import { HTTPClient, Ominity, type OminityOptions } from "@ominity/api-typescript";

export const DEFAULT_OMINITY_SDK_GATEWAY_PATH = "/api/ominity";

export interface OminityBrowserSdkOptions {
  /** Where the gateway route is mounted. Defaults to `/api/ominity`. */
  readonly basePath?: string | undefined;
  /** Defaults to the page's origin. */
  readonly origin?: string | undefined;
  /** Sent as `Accept-Language` unless the gateway resolves the language itself. */
  readonly language?: string | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly timeoutMs?: number | undefined;
  readonly retryConfig?: OminityOptions["retryConfig"] | undefined;
}

/**
 * The `@ominity/api-typescript` SDK for browser code, talking to the gateway route
 * (`createOminitySdkGatewayRouteHandlers`). It carries no credentials: the gateway adds the signed-in user's token
 * server-side, so every SDK method can be used as documented without an API key in the browser.
 */
export function createOminityBrowserSdk(options: OminityBrowserSdkOptions = {}): Ominity {
  const origin = (options.origin ?? (typeof window === "undefined" ? "http://localhost" : window.location.origin))
    .replace(/\/+$/, "");
  const basePath = (options.basePath ?? DEFAULT_OMINITY_SDK_GATEWAY_PATH).replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));

  return new Ominity({
    serverURL: `${origin}${basePath}`,
    httpClient: new HTTPClient({
      fetcher: (input, init) => fetchImpl(input, { ...init, credentials: "same-origin" }),
    }),
    ...(options.language ? { language: options.language } : {}),
    ...(typeof options.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.retryConfig ? { retryConfig: options.retryConfig } : {}),
  });
}
