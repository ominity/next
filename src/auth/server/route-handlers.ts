import type { OminityOptions } from "@ominity/api-typescript";

import { createAuthClient } from "../client.js";
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
  AuthSession,
  OAuthTokenResponse,
} from "../types.js";
import {
  clearAuthSessionCookie,
  readAuthSessionCookie,
  writeAuthSessionCookie,
  type AuthSessionCookieOptions,
} from "../../next/auth.js";
import { createPatchedOminitySdk } from "../../server/ominity-sdk.js";
import {
  asNonEmptyString,
  asObjectRecord,
  createRequestLanguageResolver,
  jsonError,
  loadNextCookiesStore,
  type OminityRequestLanguageResolver,
  parseJsonBody,
} from "../../server/route-utils.js";

const DEFAULT_OMINITY_BASE_URL = "https://demo.ominity.com/api";
const DEV_SESSION_SECRET = "development-only-ominity-session-secret-change-me";

export interface OminityAuthRouteUser {
  readonly id?: number;
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly isMfaEnabled?: boolean;
}

export interface OminityAuthRouteSession extends AuthSession {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly isMfaEnabled?: boolean;
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
  readonly useMockData?: boolean | undefined;
  readonly debugEnabled?: boolean | undefined;
  readonly sdkHttpClient?: OminityOptions["httpClient"] | undefined;
  readonly siteUrl?: string | undefined;
  readonly resolveLanguage?: OminityRequestLanguageResolver | undefined;
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

async function loadUserFromAccessToken(
  config: OminityAuthRouteHandlerConfig,
  accessToken: string,
  language?: string,
): Promise<OminityAuthRouteUser | null> {
  const sdk = createPatchedOminitySdk(resolveAuthSdkOptions(config, accessToken, language));
  const me = await sdk.me.get();
  return normalizeUser(me);
}

function toPublicMfaMethod(item: AuthMfaMethod): {
  method: string;
  isEnabled: boolean;
  verifiedAt?: string | null;
  lastUsedAt?: string | null;
  lastSentAt?: string | null;
} {
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

function siteOrigin(config: OminityAuthRouteHandlerConfig, request: Request): string {
  const configuredSiteUrl = asNonEmptyString(config.siteUrl);
  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/+$/, "");
  }

  return new URL(request.url).origin;
}

async function requireAuthenticatedUserContext(
  config: OminityAuthRouteHandlerConfig,
  getLanguage: (request: Request) => Promise<string | undefined>,
  request: Request,
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
  if (!session) {
    return jsonError(401, "UNAUTHENTICATED", "You must be authenticated.");
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

    if (config.useMockData) {
      const session: OminityAuthRouteSession = {
        accessToken: "mock-access-token",
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        email,
      };

      await writeRouteSession(config, cookieStore, session);
      return Response.json({
        session,
        user: {
          email,
        },
        mode: "mock",
      });
    }

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

      const user = await loadUserFromAccessToken(config, token.accessToken, language);
      const session = createRouteAuthSession(token, user);
      await writeRouteSession(config, cookieStore, session);

      return Response.json({
        session,
        user,
      });
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

  return async (request: Request): Promise<Response> => {
    const { cookieStore, session } = await readRouteSession(config);
    if (!session) {
      return Response.json({
        authenticated: false,
      });
    }

    if (isAuthSessionExpired(session)) {
      clearRouteSession(config, cookieStore);
      return Response.json({
        authenticated: false,
      });
    }

    if (config.useMockData) {
      return Response.json({
        authenticated: true,
        session,
        user: sessionUser(session),
        mode: "mock",
      });
    }

    try {
      const language = await getLanguage(request);
      const user = await loadUserFromAccessToken(config, session.accessToken, language);
      const mergedSession = mergeSessionWithUser(session, user);
      await writeRouteSession(config, cookieStore, mergedSession);

      return Response.json({
        authenticated: true,
        session: mergedSession,
        user,
      });
    } catch {
      clearRouteSession(config, cookieStore);
      return Response.json({
        authenticated: false,
      });
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

    if (config.useMockData) {
      const refreshed: OminityAuthRouteSession = {
        ...session,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      await writeRouteSession(config, cookieStore, refreshed);

      return Response.json({
        session: refreshed,
        mode: "mock",
      });
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
      const user = await loadUserFromAccessToken(config, token.accessToken, language);
      const refreshed = createRouteAuthSession(token, user);
      await writeRouteSession(config, cookieStore, refreshed);

      return Response.json({
        session: refreshed,
        user,
      });
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

    if (config.useMockData) {
      const session: OminityAuthRouteSession = {
        accessToken: "mock-access-token",
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        email,
        firstName,
        ...(lastName.length > 0 ? { lastName } : {}),
      };

      await writeRouteSession(config, cookieStore, session);
      return Response.json({
        user: {
          email,
          firstName,
          ...(lastName.length > 0 ? { lastName } : {}),
        },
        session,
        mode: "mock",
      });
    }

    try {
      const language = await getLanguage(request);
      const sdk = createPatchedOminitySdk(resolveApiKeySdkOptions(config, language));
      const createdUser = normalizeUser(await sdk.users.create({
        firstName,
        ...(lastName.length > 0 ? { lastName } : {}),
        email,
        password,
      }));

      let session: OminityAuthRouteSession | null = null;
      let authedUser: OminityAuthRouteUser | null = null;

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
        authedUser = await loadUserFromAccessToken(config, token.accessToken, language);
        session = createRouteAuthSession(token, authedUser);
        await writeRouteSession(config, cookieStore, session);
      } catch {}

      return Response.json({
        user: createdUser ?? {
          email,
          firstName,
          ...(lastName.length > 0 ? { lastName } : {}),
        },
        ...(authedUser ? { me: authedUser } : {}),
        ...(session ? { session } : {}),
      });
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

    if (config.useMockData) {
      return Response.json({
        ok: true,
        mode: "mock",
      });
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

    if (config.useMockData) {
      return Response.json({
        ok: true,
        mode: "mock",
      });
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
    if (config.useMockData) {
      const { session } = await readRouteSession(config);
      if (!session) {
        return jsonError(401, "UNAUTHENTICATED", "You must be authenticated.");
      }

      return Response.json({
        items: [{
          method: "email",
          isEnabled: true,
        }],
        mode: "mock",
      });
    }

    const context = await requireAuthenticatedUserContext(config, getLanguage, request);
    if (context instanceof Response) {
      return context;
    }

    const authClient = createServerAuthClient(config, context.session.accessToken, context.language);
    const response = await authClient.listUserMfaMethods({
      userId: context.userId,
    });

    return Response.json({
      items: response.items.map((item) => toPublicMfaMethod(item)),
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

    if (config.useMockData) {
      const { session } = await readRouteSession(config);
      if (!session) {
        return jsonError(401, "UNAUTHENTICATED", "You must be authenticated.");
      }

      return Response.json({
        ok: true,
        method,
        mode: "mock",
      });
    }

    const context = await requireAuthenticatedUserContext(config, getLanguage, request);
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

    if (config.useMockData) {
      const { session } = await readRouteSession(config);
      if (!session) {
        return jsonError(401, "UNAUTHENTICATED", "You must be authenticated.");
      }

      return Response.json({
        ok: true,
        method,
        mode: "mock",
      });
    }

    const context = await requireAuthenticatedUserContext(config, getLanguage, request);
    if (context instanceof Response) {
      return context;
    }

    const authClient = createServerAuthClient(config, context.session.accessToken, context.language);
    const result = await authClient.validateUserMfaCode({
      userId: context.userId,
      method,
      code,
    });

    let item: AuthMfaMethod | undefined;
    if (result.success) {
      try {
        item = await authClient.getUserMfaMethod({
          userId: context.userId,
          method,
        });
      } catch {}
    }

    return Response.json({
      ok: result.success === true,
      method,
      ...(item ? { item: toPublicMfaMethod(item) } : {}),
    });
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

    if (config.useMockData) {
      const { session } = await readRouteSession(config);
      if (!session) {
        return jsonError(401, "UNAUTHENTICATED", "You must be authenticated.");
      }

      return Response.json({
        ok: true,
        mode: "mock",
      });
    }

    const context = await requireAuthenticatedUserContext(config, getLanguage, request);
    if (context instanceof Response) {
      return context;
    }

    const authClient = createServerAuthClient(config, context.session.accessToken, context.language);
    const result = await authClient.validateUserRecoveryCode({
      userId: context.userId,
      code,
    });

    return Response.json({
      ok: result.success === true,
    });
  };
}
