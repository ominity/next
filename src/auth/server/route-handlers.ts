import { Ominity, type OminityOptions } from "@ominity/api-typescript";
import type { User } from "@ominity/api-typescript/models/identity/users/user";
import type { UserMfaMethod } from "@ominity/api-typescript/models/identity/user-mfa-method";
import type { SocialProvider } from "@ominity/api-typescript/models/settings/social-provider";
import type { SocialProviderUser } from "@ominity/api-typescript/models/settings/social-provider-user";

import { createAuthClient } from "../client.js";
import { normalizeOAuthTokenResponse } from "../normalize.js";
import {
  requestPasswordGrantToken,
  requestRefreshToken,
} from "../password-grant.js";
import {
  createAuthSession,
  isAuthSessionExpired,
} from "../session.js";
import type {
  AuthMfaMethod,
  AuthPaginatedResult,
  AuthSession,
  AuthUserLogin,
  OAuthTokenResponse,
} from "../types.js";
import {
  clearAuthSessionCookie,
  readAuthSessionCookie,
  writeAuthSessionCookie,
  type AuthSessionCookieOptions,
} from "../../next/auth.js";
import { resolveRequestClientIp } from "../../server/client-ip.js";
import {
  asNonEmptyString,
  asObjectRecord,
  createRequestLanguageResolver,
  jsonError,
  loadNextCookiesStore,
  type OminityRequestLanguageResolver,
  parseJsonBody,
  type RouteCookieStore,
} from "../../server/route-utils.js";

const DEFAULT_OMINITY_BASE_URL = "https://demo.ominity.com/api";
const DEV_SESSION_SECRET = "development-only-ominity-session-secret-change-me";
const DEFAULT_LOGIN_ACTIVITY_BASE_PATH = "/api/auth/login-activity";
const DEFAULT_SOCIAL_LOGIN_BASE_PATH = "/api/auth/social";
const MAX_LOGIN_ACTIVITY_PAGE_LIMIT = 250;

export type OminityAuthRouteUser = Partial<
  Pick<User, "id" | "email" | "firstName" | "lastName" | "isMfaEnabled">
>;

export interface OminityAuthRouteSession extends AuthSession {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly isMfaEnabled?: boolean;
  /** Signed in with a password but the MFA challenge is not done yet; the session grants nothing else. */
  readonly mfaPending?: boolean;
}

/**
 * What the browser learns about its session. The tokens stay in the encrypted cookie; `user` is the SDK `User`.
 */
export type OminityAuthState =
  | { readonly status: "anonymous" }
  | { readonly status: "mfa_required"; readonly methods: ReadonlyArray<UserMfaMethod> }
  | { readonly status: "authenticated"; readonly user: User; readonly expiresAt: string };

/**
 * Browser-safe projection of the encrypted server session.
 * OAuth credentials intentionally remain confined to the HttpOnly cookie.
 */
export type OminityAuthPublicSession = Pick<
  OminityAuthRouteSession,
  "userId" | "email" | "firstName" | "lastName" | "isMfaEnabled" | "expiresAt"
>;

export type OminityAuthPublicMfaMethod = Pick<
  AuthMfaMethod,
  "method" | "isEnabled" | "verifiedAt" | "lastUsedAt" | "lastSentAt"
>;

export type OminityAuthPublicLoginActivity = Omit<AuthUserLogin, "raw">;

export interface OminityAuthPublicLoginActivityPage extends Omit<
  AuthPaginatedResult<AuthUserLogin>,
  "items" | "raw"
> {
  readonly items: ReadonlyArray<OminityAuthPublicLoginActivity>;
}

export interface OminityAuthLoginActivityErrorContext {
  readonly userId?: number;
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface OminityAuthRouteHandlerConfig {
  readonly ominityBaseUrl?: string | undefined;
  readonly ominityApiKey?: string | undefined;
  readonly channelId?: string | undefined;
  readonly authClientId?: string | undefined;
  readonly authClientSecret?: string | undefined;
  readonly authScope?: string | undefined;
  readonly authSessionSecret?: string | undefined;
  readonly authCookieName?: string | undefined;
  readonly authCookieMaxAgeSeconds?: number | undefined;
  readonly nodeEnv?: string | undefined;
  readonly debugEnabled?: boolean | undefined;
  readonly loginActivityEnabled?: boolean | undefined;
  readonly onLoginActivityError?: (
    error: unknown,
    context: OminityAuthLoginActivityErrorContext,
  ) => void | Promise<void>;
  readonly sdkHttpClient?: OminityOptions["httpClient"] | undefined;
  readonly siteUrl?: string | undefined;
  readonly resolveLanguage?: OminityRequestLanguageResolver | undefined;
}

export interface OminityAuthLoginActivityRouteHandlerConfig
  extends OminityAuthRouteHandlerConfig {
  readonly loginActivityBasePath?: string | undefined;
}

export interface OminityAuthLoginActivityRouteHandlers {
  readonly GET: (request: Request) => Promise<Response>;
}

export type OminityAuthPublicSocialProvider = Pick<
  SocialProvider,
  "id" | "provider" | "name" | "icon" | "isEnabled"
>;

export interface OminityAuthSocialRouteHandlerConfig
  extends OminityAuthRouteHandlerConfig {
  readonly socialLoginBasePath?: string | undefined;
  readonly socialLoginSuccessPath?: string | undefined;
  readonly socialLoginFailurePath?: string | undefined;
  /** Where a social sign-in goes when the user still has to pass MFA; defaults to the success path. */
  readonly socialLoginMfaPath?: string | undefined;
}

export interface OminityAuthSocialRouteHandlers {
  readonly GET: (request: Request) => Promise<Response>;
}

export interface OminityAuthSocialLoginResult {
  readonly providerUser: SocialProviderUser;
  readonly state: OminityAuthState;
}

export type OminityAuthSocialLoginErrorCode =
  | "SOCIAL_ACCOUNT_NOT_LINKED"
  | "SOCIAL_LOGIN_USER_MISMATCH"
  | "SOCIAL_LOGIN_USER_UNAVAILABLE";

export class OminityAuthSocialLoginError extends Error {
  readonly code: OminityAuthSocialLoginErrorCode;

  constructor(code: OminityAuthSocialLoginErrorCode, message: string) {
    super(message);
    this.name = "OminityAuthSocialLoginError";
    this.code = code;
  }
}

function resolveBaseUrl(value: string | undefined): string {
  return (value ?? DEFAULT_OMINITY_BASE_URL).replace(/\/$/, "");
}

function resolveAuthSessionSecret(config: OminityAuthRouteHandlerConfig): string {
  const secret = asNonEmptyString(config.authSessionSecret);
  if (secret && secret.length >= 32) {
    return secret;
  }

  if ((config.nodeEnv ?? "development") === "production") {
    throw new Error(
      "OMINITY_AUTH_SESSION_SECRET must be configured in production (minimum 32 characters).",
    );
  }

  return DEV_SESSION_SECRET;
}

function resolveCookieOptions(
  config: OminityAuthRouteHandlerConfig,
): AuthSessionCookieOptions {
  const cookieName = asNonEmptyString(config.authCookieName);

  return {
    ...(cookieName ? { name: cookieName } : {}),
    ...(typeof config.authCookieMaxAgeSeconds === "number"
      ? { maxAgeSeconds: config.authCookieMaxAgeSeconds }
      : {}),
    path: "/",
    httpOnly: true,
    secure: (config.nodeEnv ?? "development") === "production",
    sameSite: "lax",
    sessionSecret: resolveAuthSessionSecret(config),
  };
}

function resolveAuthSdkOptions(
  config: OminityAuthRouteHandlerConfig,
  accessToken?: string,
  language?: string,
): OminityOptions {
  const security = accessToken
    ? {
      oAuth: accessToken,
    }
    : asNonEmptyString(config.ominityApiKey)
      ? {
        apiKey: asNonEmptyString(config.ominityApiKey),
      }
      : undefined;

  return {
    serverURL: resolveBaseUrl(config.ominityBaseUrl),
    ...(language ? { language } : {}),
    ...(asNonEmptyString(config.channelId) ? { channelId: asNonEmptyString(config.channelId) } : {}),
    ...(security ? { security } : {}),
    ...(config.sdkHttpClient ? { httpClient: config.sdkHttpClient } : {}),
  };
}

function resolveApiKeySdkOptions(
  config: OminityAuthRouteHandlerConfig,
  language?: string,
): OminityOptions {
  const apiKey = asNonEmptyString(config.ominityApiKey);
  if (!apiKey) {
    throw new Error("OMINITY_API_KEY is required.");
  }

  return {
    ...resolveAuthSdkOptions(config, undefined, language),
    security: {
      apiKey,
    },
  };
}

/**
 * Creates an SDK client authenticated with the server-only Ominity API key.
 * Keep this helper in server modules and Route Handlers only.
 */
export function createOminityApiKeySdk(
  config: OminityAuthRouteHandlerConfig,
  language?: string,
) {
  return new Ominity(resolveApiKeySdkOptions(config, language));
}

function resolveTokenConfig(config: OminityAuthRouteHandlerConfig): {
  clientId: string;
  clientSecret: string;
  scope?: string;
} {
  const clientId = asNonEmptyString(config.authClientId);
  const clientSecret = asNonEmptyString(config.authClientSecret);
  const scope = asNonEmptyString(config.authScope);

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing auth config: OMINITY_AUTH_CLIENT_ID, OMINITY_AUTH_CLIENT_SECRET.",
    );
  }

  return {
    clientId,
    clientSecret,
    ...(scope ? { scope } : {}),
  };
}

function createServerAuthClient(
  config: OminityAuthRouteHandlerConfig,
  accessToken?: string,
  language?: string,
) {
  return createAuthClient({
    sdk: resolveAuthSdkOptions(config, accessToken, language),
    ...(typeof config.debugEnabled === "boolean"
      ? {
        debug: {
          enabled: config.debugEnabled,
        },
      }
      : {}),
  });
}

async function reportLoginActivityError(
  config: OminityAuthRouteHandlerConfig,
  error: unknown,
  context: OminityAuthLoginActivityErrorContext,
): Promise<void> {
  if (!config.onLoginActivityError) {
    return;
  }

  try {
    await config.onLoginActivityError(error, context);
  } catch {
    // An observability callback must never turn a valid login into a failure.
  }
}

/**
 * Records a successful interactive login with server-derived request metadata.
 * Login activity is auxiliary: recording failures are observable through
 * `onLoginActivityError`, but do not invalidate the authenticated session.
 */
export async function recordOminityAuthLoginActivity(
  config: OminityAuthRouteHandlerConfig,
  input: {
    readonly request: Request;
    readonly session: OminityAuthRouteSession;
    readonly user?: OminityAuthRouteUser | null;
    readonly language?: string;
  },
): Promise<OminityAuthPublicLoginActivity | null> {
  if (config.loginActivityEnabled === false) {
    return null;
  }

  const userId = typeof input.user?.id === "number"
    ? input.user.id
    : input.session.userId;
  const ipAddress = resolveRequestClientIp(input.request) ?? "unknown";
  const userAgent = asNonEmptyString(input.request.headers.get("user-agent")) ?? "unknown";
  const errorContext: OminityAuthLoginActivityErrorContext = {
    ...(typeof userId === "number" ? { userId } : {}),
    ipAddress,
    userAgent,
  };

  if (typeof userId !== "number") {
    await reportLoginActivityError(
      config,
      new Error("Authenticated session does not include a user id."),
      errorContext,
    );
    return null;
  }

  try {
    const activity = await createServerAuthClient(
      config,
      input.session.accessToken,
      input.language,
    ).recordUserLogin({
      userId,
      ipAddress,
      userAgent,
    });
    return toPublicLoginActivity(activity);
  } catch (error) {
    await reportLoginActivityError(config, error, errorContext);
    return null;
  }
}

function normalizeUser(input: unknown): OminityAuthRouteUser | null {
  const record = asObjectRecord(input);
  if (!record) {
    return null;
  }

  const email = asNonEmptyString(record.email);
  const firstName = asNonEmptyString(record.firstName);
  const lastName = asNonEmptyString(record.lastName);

  return {
    ...(typeof record.id === "number" ? { id: record.id } : {}),
    ...(email ? { email } : {}),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(typeof record.isMfaEnabled === "boolean" ? { isMfaEnabled: record.isMfaEnabled } : {}),
  };
}

function sessionUser(session: OminityAuthRouteSession): OminityAuthRouteUser {
  return {
    ...(typeof session.userId === "number" ? { id: session.userId } : {}),
    ...(typeof session.email === "string" ? { email: session.email } : {}),
    ...(typeof session.firstName === "string" ? { firstName: session.firstName } : {}),
    ...(typeof session.lastName === "string" ? { lastName: session.lastName } : {}),
    ...(typeof session.isMfaEnabled === "boolean" ? { isMfaEnabled: session.isMfaEnabled } : {}),
  };
}

export function toPublicAuthSession(
  session: OminityAuthRouteSession,
): OminityAuthPublicSession {
  return {
    ...(typeof session.userId === "number" ? { userId: session.userId } : {}),
    ...(typeof session.email === "string" ? { email: session.email } : {}),
    ...(typeof session.firstName === "string" ? { firstName: session.firstName } : {}),
    ...(typeof session.lastName === "string" ? { lastName: session.lastName } : {}),
    ...(typeof session.isMfaEnabled === "boolean"
      ? { isMfaEnabled: session.isMfaEnabled }
      : {}),
    expiresAt: session.expiresAt,
  };
}

function createRouteAuthSession(
  token: OAuthTokenResponse,
  user?: OminityAuthRouteUser | null,
): OminityAuthRouteSession {
  return {
    ...createAuthSession(token, {
      ...(typeof user?.id === "number" ? { userId: user.id } : {}),
      ...(typeof user?.email === "string" ? { email: user.email } : {}),
    }),
    ...(typeof user?.firstName === "string" ? { firstName: user.firstName } : {}),
    ...(typeof user?.lastName === "string" ? { lastName: user.lastName } : {}),
    ...(typeof user?.isMfaEnabled === "boolean" ? { isMfaEnabled: user.isMfaEnabled } : {}),
  };
}

function mergeSessionWithUser(
  session: OminityAuthRouteSession,
  user?: OminityAuthRouteUser | null,
): OminityAuthRouteSession {
  return {
    ...session,
    ...(typeof user?.id === "number" ? { userId: user.id } : {}),
    ...(typeof user?.email === "string" ? { email: user.email } : {}),
    ...(typeof user?.firstName === "string" ? { firstName: user.firstName } : {}),
    ...(typeof user?.lastName === "string" ? { lastName: user.lastName } : {}),
    ...(typeof user?.isMfaEnabled === "boolean" ? { isMfaEnabled: user.isMfaEnabled } : {}),
  };
}

async function readRouteSession(
  config: OminityAuthRouteHandlerConfig,
): Promise<{
  cookieStore: Awaited<ReturnType<typeof loadNextCookiesStore>>;
  session: OminityAuthRouteSession | null;
}> {
  const cookieStore = await loadNextCookiesStore();
  const session = await readAuthSessionCookie(
    cookieStore,
    resolveCookieOptions(config),
  ) as OminityAuthRouteSession | null;

  return {
    cookieStore,
    session,
  };
}

async function writeRouteSession(
  config: OminityAuthRouteHandlerConfig,
  cookieStore: Awaited<ReturnType<typeof loadNextCookiesStore>>,
  session: OminityAuthRouteSession,
): Promise<void> {
  await writeAuthSessionCookie(cookieStore, session, resolveCookieOptions(config));
}

function clearRouteSession(
  config: OminityAuthRouteHandlerConfig,
  cookieStore: Awaited<ReturnType<typeof loadNextCookiesStore>>,
): void {
  clearAuthSessionCookie(cookieStore, resolveCookieOptions(config));
}

/**
 * Reads the encrypted customer-user session without contacting Ominity.
 * Returns null when there is no session or it has expired, like the me route.
 */
export async function readOminityAuthSession(
  config: OminityAuthRouteHandlerConfig,
  cookieStore?: RouteCookieStore,
  options: { readonly allowPendingMfa?: boolean } = {},
): Promise<OminityAuthRouteSession | null> {
  const session = await readAuthSessionCookie(
    cookieStore ?? await loadNextCookiesStore(),
    resolveCookieOptions(config),
  ) as OminityAuthRouteSession | null;

  if (!session || isAuthSessionExpired(session)) return null;
  return session.mfaPending && !options.allowPendingMfa ? null : session;
}

async function loadUserFromAccessToken(
  config: OminityAuthRouteHandlerConfig,
  accessToken: string,
  language?: string,
): Promise<OminityAuthRouteUser | null> {
  const sdk = createOminityUserAccessSdk(config, accessToken, language);
  const me = await sdk.me.get();
  return normalizeUser(me);
}

/**
 * Creates a server-only SDK client authenticated as the current customer user.
 * The access token must come from the encrypted auth session, never browser input.
 */
export function createOminityUserAccessSdk(
  config: OminityAuthRouteHandlerConfig,
  accessToken: string,
  language?: string,
) {
  return new Ominity(resolveAuthSdkOptions(config, accessToken, language));
}

async function loadSdkUser(config: OminityAuthRouteHandlerConfig, accessToken: string, language?: string): Promise<User> {
  const me = await createOminityUserAccessSdk(config, accessToken, language).me.get();
  if (me.resource !== "user") {
    throw new Error("The access token does not belong to a user.");
  }
  return me;
}

/** The user's enabled sign-in challenges, without their setup secrets. */
async function challengeMethods(
  config: OminityAuthRouteHandlerConfig,
  accessToken: string,
  userId: number,
  language?: string,
): Promise<UserMfaMethod[]> {
  const { items } = await createOminityUserAccessSdk(config, accessToken, language).users.mfaMethods.list({ id: userId });
  return items
    // Ominity lists the methods the channel offers; the ones this user turned on are the challenge.
    .filter((method) => method.isEnabled)
    .map(({ details: _details, ...method }) => method);
}

/**
 * Writes the session of a new sign-in. A user with MFA gets a pending session until the challenge is passed; login
 * activity is recorded once the sign-in is complete.
 */
async function startRouteSession(
  config: OminityAuthRouteHandlerConfig,
  input: {
    readonly cookieStore: RouteCookieStore;
    readonly token: OAuthTokenResponse;
    readonly request: Request;
    readonly language?: string | undefined;
    /** The token's user when the caller loaded it already. */
    readonly user?: User | undefined;
  },
): Promise<OminityAuthState> {
  const user = input.user ?? await loadSdkUser(config, input.token.accessToken, input.language);
  const methods = await challengeMethods(config, input.token.accessToken, user.id, input.language);
  const session: OminityAuthRouteSession = {
    ...createRouteAuthSession(input.token, user),
    ...(methods.length > 0 ? { mfaPending: true } : {}),
  };
  await writeRouteSession(config, input.cookieStore, session);
  if (methods.length > 0) {
    return { status: "mfa_required", methods };
  }

  await recordOminityAuthLoginActivity(config, {
    request: input.request,
    session,
    user,
    ...(input.language ? { language: input.language } : {}),
  });
  return { status: "authenticated", user, expiresAt: session.expiresAt };
}

/** Ends the MFA challenge of a pending session and returns the signed-in state. */
async function completeMfaChallenge(
  config: OminityAuthRouteHandlerConfig,
  context: OminityAuthenticatedUserContext,
  request: Request,
): Promise<OminityAuthState> {
  const user = await loadSdkUser(config, context.session.accessToken, context.language);
  const { mfaPending: _pending, ...rest } = context.session;
  const session = mergeSessionWithUser(rest, user);
  await writeRouteSession(config, context.cookieStore, session);
  if (context.session.mfaPending) {
    await recordOminityAuthLoginActivity(config, {
      request,
      session,
      user,
      ...(context.language ? { language: context.language } : {}),
    });
  }
  return { status: "authenticated", user, expiresAt: session.expiresAt };
}

function toPublicMfaMethod(item: AuthMfaMethod): OminityAuthPublicMfaMethod {
  return {
    method: item.method,
    isEnabled: item.isEnabled,
    ...(typeof item.verifiedAt === "string" || item.verifiedAt === null
      ? { verifiedAt: item.verifiedAt }
      : {}),
    ...(typeof item.lastUsedAt === "string" || item.lastUsedAt === null
      ? { lastUsedAt: item.lastUsedAt }
      : {}),
    ...(typeof item.lastSentAt === "string" || item.lastSentAt === null
      ? { lastSentAt: item.lastSentAt }
      : {}),
  };
}

export function toPublicLoginActivity(
  item: AuthUserLogin,
): OminityAuthPublicLoginActivity {
  return {
    resource: "user_login",
    id: item.id,
    userId: item.userId,
    ...(typeof item.ipAddress === "string" ? { ipAddress: item.ipAddress } : {}),
    ...(typeof item.location === "string" || item.location === null
      ? { location: item.location }
      : {}),
    ...(typeof item.device === "string" || item.device === null
      ? { device: item.device }
      : {}),
    ...(typeof item.browser === "string" || item.browser === null
      ? { browser: item.browser }
      : {}),
    ...(typeof item.userAgent === "string" ? { userAgent: item.userAgent } : {}),
    ...(typeof item.createdAt === "string" ? { createdAt: item.createdAt } : {}),
  };
}

function toPublicLoginActivityPage(
  page: AuthPaginatedResult<AuthUserLogin>,
): OminityAuthPublicLoginActivityPage {
  return {
    items: page.items.map(toPublicLoginActivity),
    count: page.count,
    page: page.page,
    limit: page.limit,
    totalPages: page.totalPages,
    hasNext: page.hasNext,
    hasPrevious: page.hasPrevious,
  };
}

function siteOrigin(config: OminityAuthRouteHandlerConfig, request: Request): string {
  const configuredSiteUrl = asNonEmptyString(config.siteUrl);
  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/+$/, "");
  }

  return new URL(request.url).origin;
}

function normalizedSocialLoginBasePath(value: string | undefined): string {
  const path = (value ?? DEFAULT_SOCIAL_LOGIN_BASE_PATH).trim();
  if (!path.startsWith("/") || path === "/") {
    throw new TypeError("Social login base path must be an absolute non-root path.");
  }

  return path.replace(/\/+$/, "");
}

function socialLoginRouteSegments(
  request: Request,
  basePath: string,
): ReadonlyArray<string> | null {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (pathname === basePath) {
    return [];
  }
  if (!pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  try {
    return pathname.slice(basePath.length + 1).split("/").map(decodeURIComponent);
  } catch {
    return null;
  }
}

function positiveSocialProviderId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function toPublicSocialProvider(
  provider: SocialProvider,
): OminityAuthPublicSocialProvider {
  return {
    id: provider.id,
    provider: provider.provider,
    name: provider.name,
    icon: provider.icon,
    isEnabled: provider.isEnabled,
  };
}

function socialLoginRedirectUrl(
  config: OminityAuthSocialRouteHandlerConfig,
  request: Request,
  kind: "success" | "mfa" | "failure",
  parameters: Readonly<Record<string, string>>,
): URL {
  const origin = siteOrigin(config, request);
  const configuredPath = kind === "failure"
    ? config.socialLoginFailurePath
    : (kind === "mfa" ? config.socialLoginMfaPath : undefined) ?? config.socialLoginSuccessPath;
  const path = asNonEmptyString(configuredPath) ?? (kind === "success" ? "/" : "/login");
  const url = new URL(path, `${origin}/`);
  if (url.origin !== new URL(origin).origin) {
    throw new TypeError(`Social login ${kind} redirect must use the site origin.`);
  }

  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function socialLoginFailureCode(error: unknown): string {
  if (error instanceof OminityAuthSocialLoginError) {
    return error.code;
  }

  return "SOCIAL_LOGIN_FAILED";
}

/**
 * Completes a social-provider login after Ominity redirects back with its
 * one-time access code. The provider must already be linked to an Ominity user.
 * The user token and session remain server-only, and the successful login is
 * recorded with the callback request's browser metadata.
 */
export async function completeOminityAuthSocialLogin(
  config: OminityAuthRouteHandlerConfig,
  input: {
    readonly request: Request;
    readonly providerId: number;
    readonly code: string;
    readonly language?: string;
    readonly cookieStore?: RouteCookieStore;
  },
): Promise<OminityAuthSocialLoginResult> {
  if (!Number.isSafeInteger(input.providerId) || input.providerId <= 0) {
    throw new TypeError("providerId must be a positive integer.");
  }

  const code = asNonEmptyString(input.code);
  if (!code) {
    throw new TypeError("Social provider access code is required.");
  }

  const exchangeSdk = new Ominity(resolveAuthSdkOptions(
    config,
    undefined,
    input.language,
  ));
  const providerUser = await exchangeSdk.settings.socialProviders.exchangeAccessCode({
    providerId: input.providerId,
    code,
  });
  const userId = providerUser.userId;
  if (typeof userId !== "number") {
    throw new OminityAuthSocialLoginError(
      "SOCIAL_ACCOUNT_NOT_LINKED",
      "The social provider account is not linked to an Ominity user.",
    );
  }

  const tokenPayload = await createOminityApiKeySdk(
    config,
    input.language,
  ).users.issueToken({ id: userId });
  const token = normalizeOAuthTokenResponse(tokenPayload);
  const user = await loadSdkUser(config, token.accessToken, input.language).catch(() => null);
  if (!user) {
    throw new OminityAuthSocialLoginError(
      "SOCIAL_LOGIN_USER_UNAVAILABLE",
      "The linked Ominity user could not be loaded.",
    );
  }
  if (user.id !== userId) {
    throw new OminityAuthSocialLoginError(
      "SOCIAL_LOGIN_USER_MISMATCH",
      "The issued token does not belong to the linked Ominity user.",
    );
  }

  const state = await startRouteSession(config, {
    cookieStore: input.cookieStore ?? await loadNextCookiesStore(),
    token,
    request: input.request,
    language: input.language,
    user,
  });
  return { providerUser, state };
}

/**
 * Serves social-provider discovery, login start, and callback completion from
 * one optional catch-all App Router route:
 *
 * - GET /api/auth/social
 * - GET /api/auth/social/{providerId}/start
 * - GET /api/auth/social/{providerId}/callback?code=...
 */
export function createOminityAuthSocialRouteHandlers(
  config: OminityAuthSocialRouteHandlerConfig,
): OminityAuthSocialRouteHandlers {
  const basePath = normalizedSocialLoginBasePath(config.socialLoginBasePath);
  if (
    (config.nodeEnv ?? "development") === "production"
    && !asNonEmptyString(config.siteUrl)
  ) {
    throw new Error("siteUrl is required for social login in production.");
  }
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return {
    async GET(request: Request): Promise<Response> {
      const segments = socialLoginRouteSegments(request, basePath);
      if (segments === null) {
        return jsonError(404, "NOT_FOUND", "Social login route not found.");
      }

      if (segments.length === 0) {
        try {
          const language = await getLanguage(request);
          const result = await createOminityApiKeySdk(
            config,
            language,
          ).settings.socialProviders.list();
          const items = result.items
            .filter((provider) => provider.isEnabled)
            .map(toPublicSocialProvider);
          return Response.json({ items, count: items.length }, {
            headers: { "Cache-Control": "no-store" },
          });
        } catch {
          return jsonError(
            502,
            "SOCIAL_PROVIDERS_FAILED",
            "Could not load social login providers.",
          );
        }
      }

      const providerId = positiveSocialProviderId(segments[0]);
      if (providerId === null || segments.length !== 2) {
        return jsonError(404, "NOT_FOUND", "Social login route not found.");
      }

      if (segments[1] === "start") {
        try {
          const language = await getLanguage(request);
          const callbackUrl = new URL(
            `${basePath}/${providerId}/callback`,
            `${siteOrigin(config, request)}/`,
          ).toString();
          const link = await createOminityApiKeySdk(
            config,
            language,
          ).settings.socialProviders.createLink({
            id: providerId,
            redirectUrl: callbackUrl,
          });
          return Response.redirect(link.redirectUrl, 302);
        } catch (error) {
          const url = socialLoginRedirectUrl(config, request, "failure", {
            socialLogin: "error",
            socialError: socialLoginFailureCode(error),
            socialProviderId: String(providerId),
          });
          return Response.redirect(url, 302);
        }
      }

      if (segments[1] === "callback") {
        try {
          const code = asNonEmptyString(new URL(request.url).searchParams.get("code"));
          if (!code) {
            return Response.redirect(socialLoginRedirectUrl(config, request, "failure", {
              socialLogin: "error",
              socialError: "INVALID_SOCIAL_LOGIN_CODE",
              socialProviderId: String(providerId),
            }), 302);
          }

          const language = await getLanguage(request);
          const { state } = await completeOminityAuthSocialLogin(config, {
            request,
            providerId,
            code,
            ...(language ? { language } : {}),
          });
          const pendingMfa = state.status === "mfa_required";
          return Response.redirect(socialLoginRedirectUrl(config, request, pendingMfa ? "mfa" : "success", {
            socialLogin: pendingMfa ? "mfa_required" : "success",
            socialProviderId: String(providerId),
          }), 302);
        } catch (error) {
          return Response.redirect(socialLoginRedirectUrl(config, request, "failure", {
            socialLogin: "error",
            socialError: socialLoginFailureCode(error),
            socialProviderId: String(providerId),
          }), 302);
        }
      }

      return jsonError(404, "NOT_FOUND", "Social login route not found.");
    },
  };
}

async function requireAuthenticatedUserContext(
  config: OminityAuthRouteHandlerConfig,
  getLanguage: (request: Request) => Promise<string | undefined>,
  request: Request,
  options: { readonly allowPendingMfa?: boolean } = {},
): Promise<
  | {
    cookieStore: Awaited<ReturnType<typeof loadNextCookiesStore>>;
    session: OminityAuthRouteSession;
    language?: string;
    user: OminityAuthRouteUser | null;
    userId: number;
  }
  | Response
> {
  const { cookieStore, session } = await readRouteSession(config);
  if (!session || isAuthSessionExpired(session)) {
    return jsonError(401, "UNAUTHENTICATED", "You must be authenticated.");
  }
  if (session.mfaPending && !options.allowPendingMfa) {
    return jsonError(401, "MFA_REQUIRED", "Complete the two-factor challenge first.");
  }

  try {
    const language = await getLanguage(request);
    const user = await loadUserFromAccessToken(config, session.accessToken, language);
    const userId = typeof user?.id === "number" ? user.id : session.userId;
    if (!userId) {
      return jsonError(400, "MISSING_USER_ID", "Current session does not include a user id.");
    }

    return {
      cookieStore,
      session,
      ...(language ? { language } : {}),
      user,
      userId,
    };
  } catch {
    clearRouteSession(config, cookieStore);
    return jsonError(401, "UNAUTHENTICATED", "Current auth session is invalid.");
  }
}

export type OminityAuthenticatedUserContext = Exclude<
  Awaited<ReturnType<typeof requireAuthenticatedUserContext>>,
  Response
>;

/**
 * Resolves and validates the encrypted customer-user session for another
 * server route handler. Invalid or expired sessions return a browser-safe 401.
 */
export async function requireOminityAuthenticatedUserContext(
  config: OminityAuthRouteHandlerConfig,
  request: Request,
): Promise<OminityAuthenticatedUserContext | Response> {
  return requireAuthenticatedUserContext(
    config,
    createRequestLanguageResolver(config.resolveLanguage),
    request,
  );
}

function normalizedLoginActivityBasePath(value: string | undefined): string {
  const path = (value ?? DEFAULT_LOGIN_ACTIVITY_BASE_PATH).trim();
  if (!path.startsWith("/")) {
    throw new TypeError("Login activity base path must start with a slash.");
  }

  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function loginActivityRouteSegments(
  request: Request,
  basePath: string,
): ReadonlyArray<string> | null {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (pathname === basePath) {
    return [];
  }
  if (!pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  try {
    return pathname.slice(basePath.length + 1).split("/").map(decodeURIComponent);
  } catch {
    return null;
  }
}

function positiveLoginActivityInteger(value: string | null): number | null | undefined {
  if (value === null) {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function validLoginActivitySort(value: string): boolean {
  const allowed = new Set(["id", "ip_address", "location", "created_at"]);
  const fields = value.split(",").map((field) => field.trim()).filter(Boolean);
  return fields.length > 0 && fields.every((field) => {
    const name = field.startsWith("-") ? field.slice(1) : field;
    return allowed.has(name);
  });
}

function loginActivityErrorStatus(error: unknown, depth = 0): number {
  if (depth > 3 || typeof error !== "object" || error === null) {
    return 502;
  }

  const record = error as {
    readonly status?: unknown;
    readonly statusCode?: unknown;
    readonly cause?: unknown;
  };
  const status = typeof record.status === "number"
    ? record.status
    : typeof record.statusCode === "number"
      ? record.statusCode
      : undefined;
  if (typeof status === "number" && status >= 400 && status <= 599) {
    return status;
  }

  return loginActivityErrorStatus(record.cause, depth + 1);
}

function loginActivityErrorResponse(error: unknown): Response {
  const status = loginActivityErrorStatus(error);
  const code = status === 401
    ? "UNAUTHENTICATED"
    : status === 403
      ? "FORBIDDEN"
      : status === 404
        ? "LOGIN_ACTIVITY_NOT_FOUND"
        : "LOGIN_ACTIVITY_FAILED";
  const message = status === 404
    ? "Login activity was not found."
    : "Could not load login activity.";
  return jsonError(status, code, message);
}

function noStoreLoginActivity(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Creates a single GET handler for an optional catch-all App Router route.
 * The collection and item endpoints always use the current encrypted session's
 * user id and OAuth token.
 */
export function createOminityAuthLoginActivityRouteHandlers(
  config: OminityAuthLoginActivityRouteHandlerConfig,
): OminityAuthLoginActivityRouteHandlers {
  const basePath = normalizedLoginActivityBasePath(config.loginActivityBasePath);

  return {
    async GET(request: Request): Promise<Response> {
      const segments = loginActivityRouteSegments(request, basePath);
      if (segments === null || segments.length > 1) {
        return jsonError(404, "NOT_FOUND", "Login activity route not found.");
      }

      const context = await requireOminityAuthenticatedUserContext(config, request);
      if (context instanceof Response) {
        return context;
      }

      const authClient = createServerAuthClient(
        config,
        context.session.accessToken,
        context.language,
      );

      try {
        if (segments.length === 1) {
          const loginId = positiveLoginActivityInteger(segments[0] ?? null);
          if (loginId === null || typeof loginId === "undefined") {
            return jsonError(400, "INVALID_LOGIN_ID", "Login id must be a positive integer.");
          }
          const item = await authClient.getUserLogin({
            userId: context.userId,
            loginId,
          });
          return noStoreLoginActivity({ item: toPublicLoginActivity(item) });
        }

        const search = new URL(request.url).searchParams;
        const page = positiveLoginActivityInteger(search.get("page"));
        const limit = positiveLoginActivityInteger(search.get("limit"));
        const id = positiveLoginActivityInteger(search.get("id"));
        if (page === null) {
          return jsonError(400, "INVALID_PAGE", "page must be a positive integer.");
        }
        if (limit === null || (typeof limit === "number" && limit > MAX_LOGIN_ACTIVITY_PAGE_LIMIT)) {
          return jsonError(
            400,
            "INVALID_LIMIT",
            `limit must be between 1 and ${MAX_LOGIN_ACTIVITY_PAGE_LIMIT}.`,
          );
        }
        if (id === null) {
          return jsonError(400, "INVALID_LOGIN_ID", "id must be a positive integer.");
        }

        const sort = asNonEmptyString(search.get("sort")) ?? "-created_at";
        if (!validLoginActivitySort(sort)) {
          return jsonError(400, "INVALID_SORT", "sort contains an unsupported login activity field.");
        }

        const ipAddress = asNonEmptyString(search.get("ipAddress"));
        const location = asNonEmptyString(search.get("location"));
        const result = await authClient.listUserLogins({
          userId: context.userId,
          ...(typeof page === "number" ? { page } : {}),
          ...(typeof limit === "number" ? { limit } : {}),
          sort,
          ...((id || ipAddress || location)
            ? {
              filter: {
                ...(typeof id === "number" ? { id } : {}),
                ...(ipAddress ? { ipAddress } : {}),
                ...(location ? { location } : {}),
              },
            }
            : {}),
        });
        return noStoreLoginActivity(toPublicLoginActivityPage(result));
      } catch (error) {
        return loginActivityErrorResponse(error);
      }
    },
  };
}

export function createOminityAuthLoginRouteHandler(
  config: OminityAuthRouteHandlerConfig,
): (request: Request) => Promise<Response> {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return async (request: Request): Promise<Response> => {
    let payload: unknown;
    try {
      payload = await parseJsonBody(request);
    } catch {
      return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const record = asObjectRecord(payload);
    if (!record) {
      return jsonError(400, "INVALID_PAYLOAD", "Request body must be an object.");
    }

    const email = asNonEmptyString(record.email)?.toLowerCase() ?? "";
    const password = typeof record.password === "string" ? record.password : "";
    if (email.length === 0 || password.length === 0) {
      return jsonError(400, "INVALID_CREDENTIALS", "Email and password are required.");
    }

    const cookieStore = await loadNextCookiesStore();

    try {
      const language = await getLanguage(request);
      const tokenConfig = resolveTokenConfig(config);
      const token = await requestPasswordGrantToken({
        sdk: resolveAuthSdkOptions(config, undefined, language),
        username: email,
        password,
        clientId: tokenConfig.clientId,
        clientSecret: tokenConfig.clientSecret,
        ...(typeof tokenConfig.scope === "string" ? { scope: tokenConfig.scope } : {}),
      });

      return Response.json(await startRouteSession(config, { cookieStore, token, request, language }));
    } catch (error) {
      return jsonError(
        401,
        "LOGIN_FAILED",
        "Login failed. Verify credentials and auth configuration.",
        {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      );
    }
  };
}

export function createOminityAuthLogoutRouteHandler(
  config: OminityAuthRouteHandlerConfig,
): () => Promise<Response> {
  return async (): Promise<Response> => {
    const cookieStore = await loadNextCookiesStore();
    clearRouteSession(config, cookieStore);
    return Response.json({ ok: true });
  };
}

export function createOminityAuthMeRouteHandler(
  config: OminityAuthRouteHandlerConfig,
): (request: Request) => Promise<Response> {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);
  const anonymous = (): Response => Response.json({ status: "anonymous" } satisfies OminityAuthState);

  return async (request: Request): Promise<Response> => {
    const { cookieStore, session } = await readRouteSession(config);
    if (!session) return anonymous();
    if (isAuthSessionExpired(session)) {
      clearRouteSession(config, cookieStore);
      return anonymous();
    }

    try {
      const language = await getLanguage(request);
      if (session.mfaPending) {
        const methods = await challengeMethods(config, session.accessToken, session.userId ?? 0, language);
        return Response.json({ status: "mfa_required", methods } satisfies OminityAuthState);
      }
      const user = await loadSdkUser(config, session.accessToken, language);
      await writeRouteSession(config, cookieStore, mergeSessionWithUser(session, user));
      return Response.json({ status: "authenticated", user, expiresAt: session.expiresAt } satisfies OminityAuthState);
    } catch {
      clearRouteSession(config, cookieStore);
      return anonymous();
    }
  };
}

export function createOminityAuthRefreshRouteHandler(
  config: OminityAuthRouteHandlerConfig,
): (request: Request) => Promise<Response> {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return async (request: Request): Promise<Response> => {
    const { cookieStore, session } = await readRouteSession(config);
    if (!session?.refreshToken) {
      clearRouteSession(config, cookieStore);
      return jsonError(401, "NO_REFRESH_TOKEN", "No refresh token available.");
    }

    try {
      const language = await getLanguage(request);
      const tokenConfig = resolveTokenConfig(config);
      const token = await requestRefreshToken({
        sdk: resolveAuthSdkOptions(config, undefined, language),
        refreshToken: session.refreshToken,
        clientId: tokenConfig.clientId,
        clientSecret: tokenConfig.clientSecret,
        ...(typeof tokenConfig.scope === "string" ? { scope: tokenConfig.scope } : {}),
      });
      const user = await loadSdkUser(config, token.accessToken, language);
      // A refresh never completes a pending MFA challenge.
      const refreshed: OminityAuthRouteSession = {
        ...createRouteAuthSession(token, user),
        ...(session.mfaPending ? { mfaPending: true } : {}),
      };
      await writeRouteSession(config, cookieStore, refreshed);

      if (refreshed.mfaPending) {
        const methods = await challengeMethods(config, refreshed.accessToken, user.id, language);
        return Response.json({ status: "mfa_required", methods } satisfies OminityAuthState);
      }
      return Response.json({ status: "authenticated", user, expiresAt: refreshed.expiresAt } satisfies OminityAuthState);
    } catch (error) {
      clearRouteSession(config, cookieStore);
      return jsonError(
        401,
        "REFRESH_FAILED",
        "Could not refresh auth session.",
        {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      );
    }
  };
}

export function createOminityAuthRegisterRouteHandler(
  config: OminityAuthRouteHandlerConfig,
): (request: Request) => Promise<Response> {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return async (request: Request): Promise<Response> => {
    let payload: unknown;
    try {
      payload = await parseJsonBody(request);
    } catch {
      return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const record = asObjectRecord(payload);
    if (!record) {
      return jsonError(400, "INVALID_PAYLOAD", "Request body must be an object.");
    }

    const firstName = asNonEmptyString(record.firstName) ?? "";
    const lastName = asNonEmptyString(record.lastName) ?? "";
    const email = asNonEmptyString(record.email)?.toLowerCase() ?? "";
    const password = typeof record.password === "string" ? record.password : "";
    if (firstName.length === 0 || email.length === 0 || password.length < 6) {
      return jsonError(
        400,
        "INVALID_REGISTER_INPUT",
        "firstName, email, and password (min 6 chars) are required.",
      );
    }

    const cookieStore = await loadNextCookiesStore();

    try {
      const language = await getLanguage(request);
      const sdk = createOminityApiKeySdk(config, language);
      await sdk.users.create({
        firstName,
        ...(lastName.length > 0 ? { lastName } : {}),
        email,
        password,
      });

      try {
        const tokenConfig = resolveTokenConfig(config);
        const token = await requestPasswordGrantToken({
          sdk: resolveAuthSdkOptions(config, undefined, language),
          username: email,
          password,
          clientId: tokenConfig.clientId,
          clientSecret: tokenConfig.clientSecret,
          ...(typeof tokenConfig.scope === "string" ? { scope: tokenConfig.scope } : {}),
        });
        return Response.json(await startRouteSession(config, { cookieStore, token, request, language }));
      } catch {
        // The account exists; the user can still sign in when automatic sign-in is unavailable.
        return Response.json({ status: "anonymous" } satisfies OminityAuthState);
      }
    } catch (error) {
      return jsonError(
        400,
        "REGISTER_FAILED",
        "Registration failed.",
        {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      );
    }
  };
}

export function createOminityAuthPasswordForgotRouteHandler(
  config: OminityAuthRouteHandlerConfig,
): (request: Request) => Promise<Response> {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return async (request: Request): Promise<Response> => {
    let payload: unknown;
    try {
      payload = await parseJsonBody(request);
    } catch {
      return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const record = asObjectRecord(payload);
    if (!record) {
      return jsonError(400, "INVALID_PAYLOAD", "Request body must be an object.");
    }

    const email = asNonEmptyString(record.email)?.toLowerCase() ?? "";
    const redirectUrl = asNonEmptyString(record.redirectUrl)
      ?? `${siteOrigin(config, request)}/auth/reset-password`;

    if (email.length === 0) {
      return jsonError(400, "INVALID_EMAIL", "A valid email is required.");
    }

    try {
      const language = await getLanguage(request);
      const authClient = createServerAuthClient(config, undefined, language);
      const result = await authClient.sendPasswordResetLink({
        email,
        redirectUrl,
        ...(typeof request.headers.get("user-agent") === "string"
          ? { userAgent: request.headers.get("user-agent") }
          : {}),
        ...(typeof request.headers.get("x-forwarded-for") === "string"
          ? { ipAddress: request.headers.get("x-forwarded-for") }
          : {}),
      });

      return Response.json({
        ok: result.success === true,
        message: result.message,
        ...(typeof result.expiresAt === "string" ? { expiresAt: result.expiresAt } : {}),
      });
    } catch (error) {
      return jsonError(502, "PASSWORD_FORGOT_FAILED", "Failed to request password reset.", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}

export function createOminityAuthPasswordResetRouteHandler(
  config: OminityAuthRouteHandlerConfig,
): (request: Request) => Promise<Response> {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return async (request: Request): Promise<Response> => {
    let payload: unknown;
    try {
      payload = await parseJsonBody(request);
    } catch {
      return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const record = asObjectRecord(payload);
    if (!record) {
      return jsonError(400, "INVALID_PAYLOAD", "Request body must be an object.");
    }

    const email = asNonEmptyString(record.email)?.toLowerCase() ?? "";
    const token = asNonEmptyString(record.token) ?? "";
    const password = typeof record.password === "string" ? record.password : "";

    if (email.length === 0 || token.length === 0 || password.length < 6) {
      return jsonError(
        400,
        "INVALID_RESET_INPUT",
        "email, token, and password (min 6 chars) are required.",
      );
    }

    try {
      const language = await getLanguage(request);
      const authClient = createServerAuthClient(config, undefined, language);
      const result = await authClient.resetPassword({
        email,
        token,
        password,
        ...(typeof request.headers.get("user-agent") === "string"
          ? { userAgent: request.headers.get("user-agent") }
          : {}),
        ...(typeof request.headers.get("x-forwarded-for") === "string"
          ? { ipAddress: request.headers.get("x-forwarded-for") }
          : {}),
      });

      return Response.json({
        ok: result.success === true,
        message: result.message,
        ...(typeof result.updatedAt === "string" ? { updatedAt: result.updatedAt } : {}),
      });
    } catch (error) {
      return jsonError(502, "PASSWORD_RESET_FAILED", "Failed to reset password.", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}

export function createOminityAuthMfaMethodsRouteHandler(
  config: OminityAuthRouteHandlerConfig,
): (request: Request) => Promise<Response> {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return async (request: Request): Promise<Response> => {
    const context = await requireAuthenticatedUserContext(config, getLanguage, request, { allowPendingMfa: true });
    if (context instanceof Response) {
      return context;
    }

    return Response.json({
      items: await challengeMethods(config, context.session.accessToken, context.userId, context.language),
    });
  };
}

export function createOminityAuthMfaSendRouteHandler(
  config: OminityAuthRouteHandlerConfig,
): (request: Request) => Promise<Response> {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return async (request: Request): Promise<Response> => {
    let payload: unknown;
    try {
      payload = await parseJsonBody(request);
    } catch {
      return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const record = asObjectRecord(payload);
    const method = asNonEmptyString(record?.method) ?? "";
    if (method.length === 0) {
      return jsonError(400, "INVALID_METHOD", "A non-empty MFA method is required.");
    }

    const context = await requireAuthenticatedUserContext(config, getLanguage, request, { allowPendingMfa: true });
    if (context instanceof Response) {
      return context;
    }

    const authClient = createServerAuthClient(config, context.session.accessToken, context.language);
    const result = await authClient.sendUserMfaCode({
      userId: context.userId,
      method,
    });

    return Response.json({
      ok: result.success === true,
      method,
    });
  };
}

export function createOminityAuthMfaValidateRouteHandler(
  config: OminityAuthRouteHandlerConfig,
): (request: Request) => Promise<Response> {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return async (request: Request): Promise<Response> => {
    let payload: unknown;
    try {
      payload = await parseJsonBody(request);
    } catch {
      return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const record = asObjectRecord(payload);
    if (!record) {
      return jsonError(400, "INVALID_PAYLOAD", "Request body must be an object.");
    }

    const method = asNonEmptyString(record.method) ?? "";
    const code = asNonEmptyString(record.code) ?? "";
    if (method.length === 0 || code.length === 0) {
      return jsonError(400, "INVALID_MFA_INPUT", "Both method and code are required.");
    }

    const context = await requireAuthenticatedUserContext(config, getLanguage, request, { allowPendingMfa: true });
    if (context instanceof Response) {
      return context;
    }

    const authClient = createServerAuthClient(config, context.session.accessToken, context.language);
    const result = await authClient.validateUserMfaCode({
      userId: context.userId,
      method,
      code,
    }).catch(() => ({ success: false }));
    if (result.success !== true) {
      return jsonError(422, "INVALID_MFA_CODE", "The code is not valid.");
    }

    return Response.json(await completeMfaChallenge(config, context, request));
  };
}

export function createOminityAuthRecoveryValidateRouteHandler(
  config: OminityAuthRouteHandlerConfig,
): (request: Request) => Promise<Response> {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return async (request: Request): Promise<Response> => {
    let payload: unknown;
    try {
      payload = await parseJsonBody(request);
    } catch {
      return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const record = asObjectRecord(payload);
    if (!record) {
      return jsonError(400, "INVALID_PAYLOAD", "Request body must be an object.");
    }

    const code = asNonEmptyString(record.code) ?? "";
    if (code.length < 4) {
      return jsonError(400, "INVALID_CODE", "A valid recovery code is required.");
    }

    const context = await requireAuthenticatedUserContext(config, getLanguage, request, { allowPendingMfa: true });
    if (context instanceof Response) {
      return context;
    }

    const authClient = createServerAuthClient(config, context.session.accessToken, context.language);
    const result = await authClient.validateUserRecoveryCode({
      userId: context.userId,
      code,
    }).catch(() => ({ success: false }));
    if (result.success !== true) {
      return jsonError(422, "INVALID_RECOVERY_CODE", "The recovery code is not valid.");
    }

    return Response.json(await completeMfaChallenge(config, context, request));
  };
}
