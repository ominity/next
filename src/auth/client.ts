import { Ominity } from "@ominity/api-typescript";
import type { RequestOptions } from "@ominity/api-typescript/lib/sdks.js";

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
  normalizeUserLogin,
  normalizeUserLoginList,
} from "./normalize.js";
import type {
  AuthClient,
  AuthClientOptions,
  AuthIssuePasswordTokenInput,
  AuthIssueRefreshTokenInput,
  AuthIssueTokenInput,
  AuthIssueUserAccessTokenInput,
  AuthGetUserLoginInput,
  AuthListUserCustomersInput,
  AuthListUserLoginsInput,
  AuthListUserOAuthAccountsInput,
  AuthListUserRecoveryCodesInput,
  AuthRecordUserLoginInput,
  AuthRegenerateRecoveryCodesInput,
  AuthResetPasswordInput,
  AuthSendPasswordResetLinkInput,
  AuthUserMfaMethodInput,
  AuthValidateMfaInput,
  AuthValidateRecoveryCodeInput,
} from "./types.js";

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
  requestOptions?: RequestOptions,
): string | URL | undefined {
  if (requestOptions?.serverURL) {
    return stripApiVersion(requestOptions.serverURL);
  }

  if (!fallback) {
    return undefined;
  }

  return stripApiVersion(fallback);
}

function oauth2RequestOptions(
  fallback: string | undefined,
  requestOptions?: RequestOptions,
): RequestOptions {
  const serverURL = resolveOAuth2ServerURL(fallback, requestOptions);
  return {
    ...(requestOptions ?? {}),
    ...(serverURL ? { serverURL } : {}),
  };
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

  return {
    async issueToken(input) {
      debug.emit("debug", "Issuing OAuth2 token", { grantType: input.grantType });

      try {
        const payload = await sdk.oauth2.issueToken(
          toOAuthIssueRequest(input),
          oauth2RequestOptions(options.sdk.serverURL, input.requestOptions),
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
        const payload = await sdk.users.issueToken(
          { id: userId },
          input.requestOptions,
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
        const payload = await sdk.oauth2.refreshTransientTokenCookie(
          {},
          oauth2RequestOptions(options.sdk.serverURL, input.requestOptions),
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
        const payload = await sdk.oauth2.listAuthorizedTokens(
          {},
          oauth2RequestOptions(options.sdk.serverURL, input.requestOptions),
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
        await sdk.oauth2.revokeAuthorizedToken(
          { token_id: tokenId },
          oauth2RequestOptions(options.sdk.serverURL, input.requestOptions),
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
        const payload = await sdk.users.mfaMethods.list(
          { id: userId },
          input.requestOptions,
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
        const payload = await sdk.users.mfaMethods.get(
          { id: userId, method },
          input.requestOptions,
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
        const payload = await sdk.users.mfaMethods.enable(
          { id: userId, method },
          input.requestOptions,
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
        const payload = await sdk.users.mfaMethods.disable(
          { id: userId, method },
          input.requestOptions,
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
        const payload = await sdk.users.mfaMethods.send(
          { id: userId, method },
          input.requestOptions,
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
        const payload = await sdk.users.mfaMethods.validate(
          { id: userId, method, code },
          input.requestOptions,
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
        const payload = await sdk.users.recoveryCodes.list({
          id: userId,
          ...(typeof input.sort === "string" ? { sort: input.sort } : {}),
          ...(input.filter ? {
            filter: {
              ...(typeof input.filter.id === "number" ? { id: input.filter.id } : {}),
              ...(typeof input.filter.active === "boolean" ? { active: input.filter.active } : {}),
            },
          } : {}),
        }, input.requestOptions);
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
        const payload = await sdk.users.recoveryCodes.regenerate({
          id: userId,
          confirm: input.confirm === true,
        }, input.requestOptions);
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
        const payload = await sdk.users.recoveryCodes.validate(
          { id: userId, code },
          input.requestOptions,
        );
        return normalizeStatusResult(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to validate user recovery code.", error, {
          userId,
        });
      }
    },

    async listUserLogins(input: AuthListUserLoginsInput) {
      const userId = normalizeAuthUserId(input.userId);
      debug.emit("debug", "Listing user login activity", { userId });

      try {
        const payload = await sdk.users.logins.list({
          userId,
          ...(typeof input.page === "number" ? { page: input.page } : {}),
          ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
          ...(typeof input.sort === "string"
            ? { sort: input.sort }
            : Array.isArray(input.sort)
              ? { sort: [...input.sort] }
              : {}),
          ...(input.filter
            ? {
              filter: {
                ...(typeof input.filter.id === "number" ? { id: input.filter.id } : {}),
                ...(typeof input.filter.ipAddress === "string"
                  ? { ip_address: input.filter.ipAddress }
                  : {}),
                ...(typeof input.filter.location === "string"
                  ? { location: input.filter.location }
                  : {}),
              },
            }
            : {}),
        }, input.requestOptions);
        return normalizeUserLoginList(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to list user login activity.", error, {
          userId,
        });
      }
    },

    async getUserLogin(input: AuthGetUserLoginInput) {
      const userId = normalizeAuthUserId(input.userId);
      const loginId = normalizeAuthUserId(input.loginId, "loginId");
      debug.emit("debug", "Getting user login activity", { userId, loginId });

      try {
        return normalizeUserLogin(await sdk.users.logins.get({
          userId,
          loginId,
        }, input.requestOptions));
      } catch (error) {
        rethrowAuthClientError("Failed to get user login activity.", error, {
          userId,
          loginId,
        });
      }
    },

    async recordUserLogin(input: AuthRecordUserLoginInput) {
      const userId = normalizeAuthUserId(input.userId);
      const ipAddress = ensureNonEmptyString(input.ipAddress, "ipAddress");
      const userAgent = ensureNonEmptyString(input.userAgent, "userAgent");
      debug.emit("debug", "Recording user login activity", { userId });

      try {
        return normalizeUserLogin(await sdk.users.logins.create({
          userId,
          body: {
            ipAddress,
            userAgent,
          },
        }, input.requestOptions));
      } catch (error) {
        rethrowAuthClientError("Failed to record user login activity.", error, {
          userId,
        });
      }
    },

    async listUserOAuthAccounts(input: AuthListUserOAuthAccountsInput) {
      const userId = normalizeAuthUserId(input.userId);
      debug.emit("debug", "Listing user OAuth accounts", { userId });

      try {
        const payload = await sdk.users.oauthAccounts.list({
          id: userId,
          ...(typeof input.page === "number" ? { page: input.page } : {}),
          ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
          ...(typeof input.sort === "string" ? { sort: input.sort } : {}),
          ...(input.filter ? {
            filter: {
              ...(typeof input.filter.id === "number" ? { id: input.filter.id } : {}),
              ...(typeof input.filter.providerId === "number"
                ? { providerId: input.filter.providerId }
                : {}),
              ...(typeof input.filter.identifier === "string"
                ? { identifier: input.filter.identifier }
                : {}),
              ...(typeof input.filter.email === "string" ? { email: input.filter.email } : {}),
            },
          } : {}),
        }, input.requestOptions);
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
        const payload = await sdk.users.customers.list({
          id: userId,
          ...(typeof input.page === "number" ? { page: input.page } : {}),
          ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
        }, input.requestOptions);
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
        const payload = await sdk.users.sendPasswordResetLink({
          email: ensureNonEmptyString(input.email, "email"),
          redirectUrl: ensureNonEmptyString(input.redirectUrl, "redirectUrl"),
          ...(typeof input.userAgent === "string" || input.userAgent === null
            ? { userAgent: input.userAgent }
            : {}),
          ...(typeof input.ipAddress === "string" || input.ipAddress === null
            ? { ipAddress: input.ipAddress }
            : {}),
        }, input.requestOptions);
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
        const payload = await sdk.users.resetPassword({
          email: ensureNonEmptyString(input.email, "email"),
          token: ensureNonEmptyString(input.token, "token"),
          password: ensureNonEmptyString(input.password, "password"),
          ...(typeof input.userAgent === "string" || input.userAgent === null
            ? { userAgent: input.userAgent }
            : {}),
          ...(typeof input.ipAddress === "string" || input.ipAddress === null
            ? { ipAddress: input.ipAddress }
            : {}),
        }, input.requestOptions);
        return normalizeResetPasswordResult(payload);
      } catch (error) {
        rethrowAuthClientError("Failed to reset password.", error, {
          email: input.email,
        });
      }
    },
  };
}
