import {
  createOminityAuthEmailCodeSendRouteHandler,
  createOminityAuthEmailCodeVerifyRouteHandler,
  createOminityAuthLoginActivityRouteHandlers,
  createOminityAuthLoginRouteHandler,
  createOminityAuthLogoutRouteHandler,
  createOminityAuthMeRouteHandler,
  createOminityAuthMfaMethodsRouteHandler,
  createOminityAuthMfaSendRouteHandler,
  createOminityAuthMfaValidateRouteHandler,
  createOminityAuthPasskeyChallengeRouteHandler,
  createOminityAuthPasskeyVerifyRouteHandler,
  createOminityAuthPasswordForgotRouteHandler,
  createOminityAuthPasswordResetRouteHandler,
  createOminityAuthRecoveryValidateRouteHandler,
  createOminityAuthRefreshRouteHandler,
  createOminityAuthRegisterRouteHandler,
  createOminityAuthSocialRouteHandlers,
} from "../auth/server/route-handlers.js";
import {
  createOminityCommerceRouteHandlers,
  type OminityCommerceRouteHandlerConfig,
} from "../commerce/server/route-handlers.js";
import {
  createOminityCustomerAccountsRouteHandlers,
  type OminityCustomerAccountsRouteHandlerConfig,
} from "../customer-accounts/server/route-handlers.js";
import { getCachedOminityDebugHttpClient } from "../debug/fetcher.js";
import { createOminityDebugRouteHandlers } from "../debug/route.js";
import {
  createOminityFormSubmitRouteHandler,
  type CreateOminityFormSubmitRouteHandlerConfig,
} from "../forms/server/route-handlers.js";
import { createOminityDraftRouteHandlers } from "../next/draft-mode.js";
import {
  createOminityTrackingProxyRouteHandlers,
  type OminityTrackingProxyRouteHandlersConfig,
} from "../next/tracking-proxy.js";
import {
  createOminitySdkGatewayRouteHandlers,
  type OminitySdkGatewayConfig,
} from "../sdk/server/gateway.js";
import type { MaybePromise } from "../server/route-utils.js";

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

export type OminityRouteMethod = typeof METHODS[number];
type Handler = (request: Request) => Promise<Response>;
type MethodHandlers = Partial<Record<OminityRouteMethod, Handler>>;

/**
 * Everything the browser-facing package features need, mounted once:
 *
 * | Path (below `basePath`) | Feature |
 * |---|---|
 * | `auth/*` | sign-in, registration, MFA, password reset, session, login activity, social login, passkey sign-in |
 * | `commerce/*` | cart, checkout, shipping and payment methods, order payments |
 * | `customer-accounts/*` | account context, switching, team and invitations |
 * | `ominity/*` | the browser SDK gateway |
 * | `events` | visitor tracking |
 * | `forms/submit` | CMS form submissions |
 * | `draft` | draft mode for CMS previews |
 * | `dev-tool/requests` | the Ominity Dev Tool |
 *
 * Set a feature to `false` to switch it off; its paths then answer 404.
 */
export interface OminityRouteHandlersConfig extends Omit<OminityCustomerAccountsRouteHandlerConfig, "basePath"> {
  /** Where the catch-all route is mounted. Defaults to `/api`, matching the package's client defaults. */
  readonly basePath?: string | undefined;
  readonly auth?: false | {
    /** Where social login returns to; evaluated per request so it can follow the channel's default locale. */
    readonly socialLoginSuccessPath?: string | (() => MaybePromise<string>) | undefined;
    readonly socialLoginFailurePath?: string | (() => MaybePromise<string>) | undefined;
    /** The MFA page, for social sign-ins that still need a second factor. */
    readonly socialLoginMfaPath?: string | (() => MaybePromise<string>) | undefined;
  } | undefined;
  readonly commerce?: false | Pick<
    OminityCommerceRouteHandlerConfig,
    "cartCookieName" | "cartCookieMaxAgeSeconds" | "paymentMethodsLimit" | "resolveCountry" | "guestCheckout" | "checkoutFields"
  > | undefined;
  readonly customerAccounts?: boolean | undefined;
  readonly sdkGateway?: false | Partial<Pick<OminitySdkGatewayConfig, "rules" | "denyRules" | "maxBodyBytes" | "membershipCacheSeconds">> | undefined;
  readonly tracking?: false | Partial<Pick<
    OminityTrackingProxyRouteHandlersConfig,
    "enabled" | "debug" | "logDebugSnapshots" | "disabledReason" | "onBeforeForward" | "enrichEvent"
  >> | undefined;
  readonly forms?: false | Partial<Pick<
    CreateOminityFormSubmitRouteHandlerConfig,
    "recaptchaSecret" | "recaptchaVerificationUrl" | "formsValidateFormId"
  >> | undefined;
  /** Secret for `draft?secret=…`; draft mode is off without it. */
  readonly draftToken?: string | undefined;
  readonly devTool?: boolean | undefined;
}

export type OminityRouteHandlers = Readonly<Record<OminityRouteMethod, Handler>>;

function normalizedBasePath(value: string | undefined): string {
  const path = (value ?? "/api").trim();
  if (!path.startsWith("/")) {
    throw new TypeError("Ominity route basePath must start with a slash.");
  }
  return path.length > 1 ? path.replace(/\/+$/, "") : "";
}

async function resolvePath(value: string | (() => MaybePromise<string>) | undefined): Promise<string | undefined> {
  return typeof value === "function" ? value() : value;
}

function notFound(): Response {
  return new Response(JSON.stringify({ error: "Route not found.", code: "NOT_FOUND" }), {
    status: 404,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function methodNotAllowed(allowed: ReadonlyArray<string>): Response {
  return new Response(JSON.stringify({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" }), {
    status: 405,
    headers: { "Content-Type": "application/json", Allow: allowed.join(", "), "Cache-Control": "no-store" },
  });
}

/**
 * One App Router catch-all for every package route, configured once:
 *
 * ```ts
 * // app/api/[...ominity]/route.ts
 * export const { GET, POST, PATCH, PUT, DELETE } = createOminityRouteHandlers(config);
 * ```
 */
export function createOminityRouteHandlers(config: OminityRouteHandlersConfig): OminityRouteHandlers {
  const basePath = normalizedBasePath(config.basePath);
  const exact = new Map<string, MethodHandlers>();
  const prefixes: Array<{ readonly prefix: string; readonly handlers: MethodHandlers }> = [];

  // With the dev tool on, commerce and customer-account API calls show up in its request log. Auth calls stay out:
  // the log keeps request bodies, and those carry passwords and tokens.
  const debugClient = (source: "commerce" | "customer-accounts") => config.sdkHttpClient
    ?? (config.devTool ? getCachedOminityDebugHttpClient({ source }) : undefined);
  const commerceClient = debugClient("commerce");
  const customerAccountsClient = debugClient("customer-accounts");

  const commerceConfig: OminityCommerceRouteHandlerConfig = {
    ...config,
    ...(config.commerce || {}),
    ...(commerceClient ? { sdkHttpClient: commerceClient } : {}),
    basePath: `${basePath}/commerce`,
  };
  const formsConfig: CreateOminityFormSubmitRouteHandlerConfig = {
    ominityApiKey: config.ominityApiKey,
    ominityBaseUrl: config.ominityBaseUrl,
    resolveLanguage: config.resolveLanguage,
    ...(config.forms || {}),
  };

  if (config.auth !== false) {
    const auth = config.auth ?? {};
    exact.set("auth/login", { POST: createOminityAuthLoginRouteHandler(config) });
    exact.set("auth/logout", { POST: createOminityAuthLogoutRouteHandler(config) });
    exact.set("auth/me", { GET: createOminityAuthMeRouteHandler(config) });
    exact.set("auth/refresh", { POST: createOminityAuthRefreshRouteHandler(config) });
    exact.set("auth/register", { POST: createOminityAuthRegisterRouteHandler(config) });
    exact.set("auth/email-code/send", { POST: createOminityAuthEmailCodeSendRouteHandler(config) });
    exact.set("auth/email-code/verify", { POST: createOminityAuthEmailCodeVerifyRouteHandler(config) });
    exact.set("auth/passkey/challenge", { POST: createOminityAuthPasskeyChallengeRouteHandler(config) });
    exact.set("auth/passkey/verify", { POST: createOminityAuthPasskeyVerifyRouteHandler(config) });
    exact.set("auth/password/forgot", { POST: createOminityAuthPasswordForgotRouteHandler(config) });
    exact.set("auth/password/reset", { POST: createOminityAuthPasswordResetRouteHandler(config) });
    exact.set("auth/mfa/methods", { GET: createOminityAuthMfaMethodsRouteHandler(config) });
    exact.set("auth/mfa/send", { POST: createOminityAuthMfaSendRouteHandler(config) });
    exact.set("auth/mfa/validate", { POST: createOminityAuthMfaValidateRouteHandler(config) });
    exact.set("auth/mfa/recovery/validate", { POST: createOminityAuthRecoveryValidateRouteHandler(config) });
    prefixes.push({
      prefix: "auth/login-activity",
      handlers: createOminityAuthLoginActivityRouteHandlers({
        ...config,
        loginActivityBasePath: `${basePath}/auth/login-activity`,
      }),
    });
    prefixes.push({
      prefix: "auth/social",
      handlers: {
        async GET(request) {
          const [successPath, failurePath, mfaPath] = await Promise.all([
            resolvePath(auth.socialLoginSuccessPath),
            resolvePath(auth.socialLoginFailurePath),
            resolvePath(auth.socialLoginMfaPath),
          ]);
          return createOminityAuthSocialRouteHandlers({
            ...config,
            socialLoginBasePath: `${basePath}/auth/social`,
            ...(successPath ? { socialLoginSuccessPath: successPath } : {}),
            ...(failurePath ? { socialLoginFailurePath: failurePath } : {}),
            ...(mfaPath ? { socialLoginMfaPath: mfaPath } : {}),
          }).GET(request);
        },
      },
    });
  }

  if (config.commerce !== false) {
    prefixes.push({ prefix: "commerce", handlers: createOminityCommerceRouteHandlers(commerceConfig) });
  }

  if (config.customerAccounts !== false) {
    prefixes.push({
      prefix: "customer-accounts",
      handlers: createOminityCustomerAccountsRouteHandlers({
        ...config,
        ...(customerAccountsClient ? { sdkHttpClient: customerAccountsClient } : {}),
        basePath: `${basePath}/customer-accounts`,
      }),
    });
  }

  if (config.sdkGateway !== false) {
    prefixes.push({
      prefix: "ominity",
      handlers: createOminitySdkGatewayRouteHandlers({
        ...config,
        ...(config.sdkGateway || {}),
        basePath: `${basePath}/ominity`,
      }),
    });
  }

  if (config.tracking !== false) {
    const tracking = config.tracking ?? {};
    exact.set("events", createOminityTrackingProxyRouteHandlers({
      ominityApiKey: config.ominityApiKey,
      ominityBaseUrl: config.ominityBaseUrl,
      enabled: Boolean(config.ominityApiKey && config.ominityBaseUrl),
      ...tracking,
    }));
  }

  if (config.forms !== false) {
    exact.set("forms/submit", { POST: createOminityFormSubmitRouteHandler(formsConfig) });
  }

  exact.set("draft", createOminityDraftRouteHandlers({ draftToken: config.draftToken }));

  if (config.devTool) {
    const devTool = createOminityDebugRouteHandlers({ enabled: true });
    exact.set("dev-tool/requests", { GET: devTool.GET, DELETE: () => devTool.DELETE() });
  }

  function resolve(request: Request): MethodHandlers | null {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    if (!pathname.startsWith(`${basePath}/`)) return null;
    const path = pathname.slice(basePath.length + 1);

    const handlers = exact.get(path);
    if (handlers) return handlers;
    return prefixes.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`))?.handlers ?? null;
  }

  const dispatch = (method: OminityRouteMethod): Handler => async (request) => {
    const handlers = resolve(request);
    if (!handlers) return notFound();
    const handler = handlers[method];
    return handler ? handler(request) : methodNotAllowed(Object.keys(handlers));
  };

  return {
    GET: dispatch("GET"),
    POST: dispatch("POST"),
    PATCH: dispatch("PATCH"),
    PUT: dispatch("PUT"),
    DELETE: dispatch("DELETE"),
  };
}
