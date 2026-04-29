import { Ominity } from "@ominity/api-typescript";

import { AuthClientError } from "../cms/errors.js";
import { createAuthDebugLogger } from "./debug.js";
import {
  ensureNonEmptyString,
  normalizeAuthTokenId,
  normalizeAuthUserId,
  normalizeAuthorizedTokenList,
  normalizeMfaMethod,
  normalizeMfaMethodList,
  normalizeOAuthAccountList,
  normalizeOAuthTokenResponse,
  normalizePasswordResetLinkResult,
  normalizeRecoveryCodeList,
  normalizeResetPasswordResult,
  normalizeStatusResult,
  normalizeUserCustomerList,
} from "./normalize.js";
import type {
  AuthClient,
  AuthClientOptions,
  AuthIssuePasswordTokenInput,
  AuthIssueRefreshTokenInput,
  AuthIssueTokenInput,
  AuthIssueUserAccessTokenInput,
  AuthListUserCustomersInput,
  AuthListUserOAuthAccountsInput,
  AuthListUserRecoveryCodesInput,
  AuthRegenerateRecoveryCodesInput,
  AuthRequestOptions,
  AuthResetPasswordInput,
  AuthSendPasswordResetLinkInput,
  AuthUserMfaMethodInput,
  AuthValidateMfaInput,
  AuthValidateRecoveryCodeInput,
} from "./types.js";

interface AuthRequestInput {
  readonly requestOptions?: AuthRequestOptions | undefined;
  readonly serverURL?: string | URL | undefined;
  readonly accept?: string | undefined;
  readonly query?: Record<string, unknown> | string | undefined;
  readonly json?: unknown | undefined;
  readonly security?: Record<string, unknown> | undefined;
}

function rethrowAuthClientError(
  message: string,
  error: unknown,
  details?: Readonly<Record<string, unknown>>,
): never {
  if (error instanceof AuthClientError) {
    throw error;
  }

  throw new AuthClientError(message, {
    cause: error,
    ...(details ? { details } : {}),
  });
}

function stripApiVersion(serverURL: string | URL): URL {
  const url = new URL(serverURL.toString());
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname.replace(/\/v[0-9]+$/i, "") || "/";
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url;
}

function resolveOAuth2ServerURL(
  fallback: string | undefined,
  requestOptions?: AuthRequestOptions,
): string | URL | undefined {
  if (requestOptions?.serverURL) {
    return stripApiVersion(requestOptions.serverURL);
  }

  if (!fallback) {
    return undefined;
  }

  return stripApiVersion(fallback);
}

function createPath(...segments: ReadonlyArray<string | number>): string {
  const encoded = segments.map((value) => encodeURIComponent(String(value)));
  return `/${encoded.join("/")}`;
}

function buildHttpRequestOptions(input: AuthRequestInput): Record<string, unknown> {
  const headers = new Headers(input.requestOptions?.headers);
  if (typeof input.accept === "string") {
    headers.set("Accept", input.accept);
  }

  return {
    ...(input.requestOptions ?? {}),
    headers,
    ...(typeof input.serverURL !== "undefined" ? { serverURL: input.serverURL } : {}),
    ...(typeof input.query !== "undefined" ? { query: input.query } : {}),
    ...(typeof input.json !== "undefined" ? { json: input.json } : {}),
    ...(typeof input.security !== "undefined" ? { security: input.security } : {}),
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    return response.json();
  }

  return response.text();
}

function toOAuthIssueRequest(input: AuthIssueTokenInput): {
  grant_type: string;
  client_id: string;
  client_secret: string;
  username?: string;
  password?: string;
  scope?: string;
  refresh_token?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
} {
  const grantType = ensureNonEmptyString(input.grantType, "grantType");
  const clientId = ensureNonEmptyString(input.clientId, "clientId");
  const clientSecret = ensureNonEmptyString(input.clientSecret, "clientSecret");

  return {
    grant_type: grantType,
    client_id: clientId,
    client_secret: clientSecret,
    ...(typeof input.username === "string" ? { username: input.username } : {}),
    ...(typeof input.password === "string" ? { password: input.password } : {}),
    ...(typeof input.scope === "string" ? { scope: input.scope } : {}),
    ...(typeof input.refreshToken === "string" ? { refresh_token: input.refreshToken } : {}),
    ...(typeof input.code === "string" ? { code: input.code } : {}),
    ...(typeof input.redirectUri === "string" ? { redirect_uri: input.redirectUri } : {}),
    ...(typeof input.codeVerifier === "string" ? { code_verifier: input.codeVerifier } : {}),
  };
}

export function createAuthClient(options: AuthClientOptions): AuthClient {
  const sdk = new Ominity(options.sdk);
  const debug = createAuthDebugLogger(options.debug, "auth-client");

  const requestJson = async (
    method: string,
    path: string,
    input: AuthRequestInput = {},
  ): Promise<unknown> => {
    const response = await sdk.http.request(method, path, buildHttpRequestOptions(input));
    return parseResponseBody(response);
  };

  return {
    async issueToken(input) {
      debug.emit("debug", "Issuing OAuth2 token", { grantType: input.grantType });

      try {
        const payload = await requestJson(
          "POST",
          "/oauth2/token",
          {
            requestOptions: input.requestOptions,
            serverURL: resolveOAuth2ServerURL(options.sdk.serverURL, input.requestOptions),
            accept: "application/json",
            json: toOAuthIssueRequest(input),
            security: {},
          },
        );
        return normalizeOAuthTokenResponse(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to issue OAuth2 token.", error, {
          grantType: input.grantType,
        });
      }
    },

    async issuePasswordToken(input: AuthIssuePasswordTokenInput) {
      return this.issueToken({
        grantType: "password",
        username: input.username,
        password: input.password,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        ...(typeof input.scope === "string" ? { scope: input.scope } : {}),
        ...(input.requestOptions ? { requestOptions: input.requestOptions } : {}),
      });
    },

    async issueRefreshToken(input: AuthIssueRefreshTokenInput) {
      return this.issueToken({
        grantType: "refresh_token",
        refreshToken: input.refreshToken,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        ...(typeof input.scope === "string" ? { scope: input.scope } : {}),
        ...(input.requestOptions ? { requestOptions: input.requestOptions } : {}),
      });
    },

    async issueUserAccessToken(input: AuthIssueUserAccessTokenInput) {
      const userId = normalizeAuthUserId(input.userId);
      debug.emit("debug", "Issuing user access token", { userId });

      try {
        const payload = await requestJson(
          "POST",
          createPath("users", userId, "token"),
          {
            requestOptions: input.requestOptions,
            accept: "application/json",
          },
        );
        return normalizeOAuthTokenResponse(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to issue user access token.", error, {
          userId,
        });
      }
    },

    async refreshTransientTokenCookie(input = {}) {
      debug.emit("debug", "Refreshing transient OAuth2 token cookie");

      try {
        const payload = await requestJson(
          "POST",
          "/oauth2/token/refresh",
          {
            requestOptions: input.requestOptions,
            serverURL: resolveOAuth2ServerURL(options.sdk.serverURL, input.requestOptions),
            accept: "text/plain",
            security: {},
          },
        );

        if (typeof payload !== "string") {
          throw new AuthClientError("Transient token refresh response is invalid.", {
            details: {
              payload,
            },
          });
        }

        return payload;
      } catch (error) {
        rethrowAuthClientError("Failed to refresh transient token cookie.", error);
      }
    },

    async listAuthorizedTokens(input = {}) {
      debug.emit("debug", "Listing authorized OAuth2 tokens");

      try {
        const payload = await requestJson(
          "GET",
          "/oauth2/tokens",
          {
            requestOptions: input.requestOptions,
            serverURL: resolveOAuth2ServerURL(options.sdk.serverURL, input.requestOptions),
            accept: "application/json",
            security: {},
          },
        );
        return normalizeAuthorizedTokenList(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to list authorized OAuth2 tokens.", error);
      }
    },

    async revokeAuthorizedToken(input) {
      const tokenId = normalizeAuthTokenId(input.tokenId);
      debug.emit("debug", "Revoking authorized OAuth2 token", { tokenId });

      try {
        await requestJson(
          "DELETE",
          createPath("oauth2", "tokens", tokenId),
          {
            requestOptions: input.requestOptions,
            serverURL: resolveOAuth2ServerURL(options.sdk.serverURL, input.requestOptions),
            accept: "application/json",
            security: {},
          },
        );
      } catch (error) {
        rethrowAuthClientError("Failed to revoke authorized OAuth2 token.", error, {
          tokenId,
        });
      }
    },

    async listUserMfaMethods(input) {
      const userId = normalizeAuthUserId(input.userId);
      debug.emit("debug", "Listing user MFA methods", { userId });

      try {
        const payload = await requestJson(
          "GET",
          createPath("users", userId, "mfa-methods"),
          {
            requestOptions: input.requestOptions,
            accept: "application/hal+json",
          },
        );
        return normalizeMfaMethodList(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to list user MFA methods.", error, {
          userId,
        });
      }
    },

    async getUserMfaMethod(input: AuthUserMfaMethodInput) {
      const userId = normalizeAuthUserId(input.userId);
      const method = ensureNonEmptyString(input.method, "method");
      debug.emit("debug", "Getting user MFA method", { userId, method });

      try {
        const payload = await requestJson(
          "GET",
          createPath("users", userId, "mfa-methods", method),
          {
            requestOptions: input.requestOptions,
            accept: "application/json",
          },
        );
        return normalizeMfaMethod(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to fetch user MFA method.", error, {
          userId,
          method,
        });
      }
    },

    async enableUserMfaMethod(input: AuthUserMfaMethodInput) {
      const userId = normalizeAuthUserId(input.userId);
      const method = ensureNonEmptyString(input.method, "method");
      debug.emit("debug", "Enabling user MFA method", { userId, method });

      try {
        const payload = await requestJson(
          "POST",
          createPath("users", userId, "mfa-methods", method, "enable"),
          {
            requestOptions: input.requestOptions,
            accept: "application/json",
          },
        );
        return normalizeMfaMethod(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to enable user MFA method.", error, {
          userId,
          method,
        });
      }
    },

    async disableUserMfaMethod(input: AuthUserMfaMethodInput) {
      const userId = normalizeAuthUserId(input.userId);
      const method = ensureNonEmptyString(input.method, "method");
      debug.emit("debug", "Disabling user MFA method", { userId, method });

      try {
        const payload = await requestJson(
          "DELETE",
          createPath("users", userId, "mfa-methods", method),
          {
            requestOptions: input.requestOptions,
            accept: "application/json",
          },
        );
        return normalizeStatusResult(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to disable user MFA method.", error, {
          userId,
          method,
        });
      }
    },

    async sendUserMfaCode(input: AuthUserMfaMethodInput) {
      const userId = normalizeAuthUserId(input.userId);
      const method = ensureNonEmptyString(input.method, "method");
      debug.emit("debug", "Sending MFA code", { userId, method });

      try {
        const payload = await requestJson(
          "POST",
          createPath("users", userId, "mfa-methods", method, "send"),
          {
            requestOptions: input.requestOptions,
            accept: "application/json",
          },
        );
        return normalizeStatusResult(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to send MFA code.", error, {
          userId,
          method,
        });
      }
    },

    async validateUserMfaCode(input: AuthValidateMfaInput) {
      const userId = normalizeAuthUserId(input.userId);
      const method = ensureNonEmptyString(input.method, "method");
      const code = ensureNonEmptyString(input.code, "code");
      debug.emit("debug", "Validating MFA code", { userId, method });

      try {
        const payload = await requestJson(
          "POST",
          createPath("users", userId, "mfa-methods", method, "validate"),
          {
            requestOptions: input.requestOptions,
            accept: "application/json",
            json: { code },
          },
        );
        return normalizeStatusResult(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to validate MFA code.", error, {
          userId,
          method,
        });
      }
    },

    async listUserRecoveryCodes(input: AuthListUserRecoveryCodesInput) {
      const userId = normalizeAuthUserId(input.userId);
      debug.emit("debug", "Listing user recovery codes", { userId });

      try {
        const payload = await requestJson(
          "GET",
          createPath("users", userId, "recovery-codes"),
          {
            requestOptions: input.requestOptions,
            accept: "application/hal+json",
            query: {
              ...(typeof input.sort === "string" ? { sort: input.sort } : {}),
              ...(typeof input.filter?.id === "number" ? { "filter[id]": input.filter.id } : {}),
              ...(typeof input.filter?.active === "boolean" ? { "filter[active]": input.filter.active } : {}),
            },
          },
        );
        return normalizeRecoveryCodeList(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to list user recovery codes.", error, {
          userId,
        });
      }
    },

    async regenerateUserRecoveryCodes(input: AuthRegenerateRecoveryCodesInput) {
      const userId = normalizeAuthUserId(input.userId);
      debug.emit("debug", "Regenerating user recovery codes", { userId });

      try {
        const payload = await requestJson(
          "POST",
          createPath("users", userId, "recovery-codes"),
          {
            requestOptions: input.requestOptions,
            accept: "application/hal+json",
            json: {
              confirm: input.confirm === true,
            },
          },
        );
        return normalizeRecoveryCodeList(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to regenerate user recovery codes.", error, {
          userId,
        });
      }
    },

    async validateUserRecoveryCode(input: AuthValidateRecoveryCodeInput) {
      const userId = normalizeAuthUserId(input.userId);
      const code = ensureNonEmptyString(input.code, "code");
      debug.emit("debug", "Validating user recovery code", { userId });

      try {
        const payload = await requestJson(
          "POST",
          createPath("users", userId, "recovery-codes", "validate"),
          {
            requestOptions: input.requestOptions,
            accept: "application/json",
            json: { code },
          },
        );
        return normalizeStatusResult(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to validate user recovery code.", error, {
          userId,
        });
      }
    },

    async listUserOAuthAccounts(input: AuthListUserOAuthAccountsInput) {
      const userId = normalizeAuthUserId(input.userId);
      debug.emit("debug", "Listing user OAuth accounts", { userId });

      try {
        const payload = await requestJson(
          "GET",
          createPath("users", userId, "oauthaccounts"),
          {
            requestOptions: input.requestOptions,
            accept: "application/hal+json",
            query: {
              ...(typeof input.page === "number" ? { page: input.page } : {}),
              ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
              ...(typeof input.sort === "string" ? { sort: input.sort } : {}),
              ...(typeof input.filter?.id === "number" ? { "filter[id]": input.filter.id } : {}),
              ...(typeof input.filter?.providerId === "number"
                ? { "filter[providerId]": input.filter.providerId }
                : {}),
              ...(typeof input.filter?.identifier === "string"
                ? { "filter[identifier]": input.filter.identifier }
                : {}),
              ...(typeof input.filter?.email === "string" ? { "filter[email]": input.filter.email } : {}),
            },
          },
        );
        return normalizeOAuthAccountList(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to list user OAuth accounts.", error, {
          userId,
        });
      }
    },

    async listUserCustomers(input: AuthListUserCustomersInput) {
      const userId = normalizeAuthUserId(input.userId);
      debug.emit("debug", "Listing user customers", { userId });

      try {
        const payload = await requestJson(
          "GET",
          createPath("users", userId, "customers"),
          {
            requestOptions: input.requestOptions,
            accept: "application/hal+json",
            query: {
              ...(typeof input.page === "number" ? { page: input.page } : {}),
              ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
            },
          },
        );
        return normalizeUserCustomerList(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to list user customers.", error, {
          userId,
        });
      }
    },

    async sendPasswordResetLink(input: AuthSendPasswordResetLinkInput) {
      debug.emit("debug", "Sending password reset link", {
        email: input.email,
      });

      try {
        const payload = await requestJson(
          "POST",
          createPath("users", "password-reset", "send"),
          {
            requestOptions: input.requestOptions,
            accept: "application/json",
            json: {
              email: ensureNonEmptyString(input.email, "email"),
              redirectUrl: ensureNonEmptyString(input.redirectUrl, "redirectUrl"),
              ...(typeof input.userAgent === "string" || input.userAgent === null
                ? { userAgent: input.userAgent }
                : {}),
              ...(typeof input.ipAddress === "string" || input.ipAddress === null
                ? { ipAddress: input.ipAddress }
                : {}),
            },
          },
        );
        return normalizePasswordResetLinkResult(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to send password reset link.", error, {
          email: input.email,
        });
      }
    },

    async resetPassword(input: AuthResetPasswordInput) {
      debug.emit("debug", "Resetting password", {
        email: input.email,
      });

      try {
        const payload = await requestJson(
          "POST",
          createPath("users", "password-reset", "update"),
          {
            requestOptions: input.requestOptions,
            accept: "application/json",
            json: {
              email: ensureNonEmptyString(input.email, "email"),
              token: ensureNonEmptyString(input.token, "token"),
              password: ensureNonEmptyString(input.password, "password"),
              ...(typeof input.userAgent === "string" || input.userAgent === null
                ? { userAgent: input.userAgent }
                : {}),
              ...(typeof input.ipAddress === "string" || input.ipAddress === null
                ? { ipAddress: input.ipAddress }
                : {}),
            },
          },
        );
        return normalizeResetPasswordResult(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to reset password.", error, {
          email: input.email,
        });
      }
    },
  };
}
