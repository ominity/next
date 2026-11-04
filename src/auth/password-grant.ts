import { createAuthClient } from "./client.js";
import type {
  EmailCodeGrantRequestInput,
  OAuthTokenResponse,
  PasswordGrantRequestInput,
  RefreshTokenRequestInput,
  UserAccessTokenRequestInput,
} from "./types.js";

export async function requestPasswordGrantToken(input: PasswordGrantRequestInput): Promise<OAuthTokenResponse> {
  const client = createAuthClient({
    sdk: input.sdk,
  });

  return client.issuePasswordToken({
    username: input.username,
    password: input.password,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    ...(typeof input.scope === "string" ? { scope: input.scope } : {}),
    ...(input.requestOptions ? { requestOptions: input.requestOptions } : {}),
  });
}

export async function requestEmailCodeToken(input: EmailCodeGrantRequestInput): Promise<OAuthTokenResponse> {
  const client = createAuthClient({
    sdk: input.sdk,
  });

  return client.issueToken({
    grantType: "email_code",
    email: input.email,
    code: input.code,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    ...(typeof input.scope === "string" ? { scope: input.scope } : {}),
    ...(input.requestOptions ? { requestOptions: input.requestOptions } : {}),
  });
}

export async function requestRefreshToken(input: RefreshTokenRequestInput): Promise<OAuthTokenResponse> {
  const client = createAuthClient({
    sdk: input.sdk,
  });

  return client.issueRefreshToken({
    refreshToken: input.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    ...(typeof input.scope === "string" ? { scope: input.scope } : {}),
    ...(input.requestOptions ? { requestOptions: input.requestOptions } : {}),
  });
}

export async function requestUserAccessToken(input: UserAccessTokenRequestInput): Promise<OAuthTokenResponse> {
  const client = createAuthClient({
    sdk: input.sdk,
  });

  return client.issueUserAccessToken({
    userId: input.userId,
    ...(input.requestOptions ? { requestOptions: input.requestOptions } : {}),
  });
}

export function expiresAtFromTokenResponse(token: OAuthTokenResponse): string {
  return token.expiresAt;
}
