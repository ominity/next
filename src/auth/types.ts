import type { OminityOptions } from "@ominity/api-typescript";
import type { RequestOptions } from "@ominity/api-typescript/lib/sdks.js";

export type AuthRequestOptions = RequestOptions;

export type AuthUserId = number | string;
export type AuthTokenId = number | string;

export interface AuthClientDebugOptions {
  readonly enabled?: boolean;
  readonly logger?: AuthClientLogger;
  readonly namespace?: string;
}

export type AuthClientLogLevel = "debug" | "info" | "warn" | "error";

export interface AuthClientLogEvent {
  readonly scope: string;
  readonly message: string;
  readonly level: AuthClientLogLevel;
  readonly payload?: unknown;
}

export interface AuthClientLogger {
  log(event: AuthClientLogEvent): void;
}

export interface AuthClientOptions {
  readonly sdk: OminityOptions;
  readonly debug?: AuthClientDebugOptions;
}

export interface OAuthTokenResponse {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresIn: number;
  readonly expiresAt: string;
  readonly refreshToken?: string;
  readonly raw: unknown;
}

export interface AuthSession {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly tokenType: string;
  readonly expiresAt: string;
  readonly userId?: number;
  readonly email?: string;
}

export interface AuthOAuthTokenInput {
  readonly grantType: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly username?: string;
  readonly password?: string;
  readonly scope?: string;
  readonly refreshToken?: string;
  readonly code?: string;
  readonly redirectUri?: string;
  readonly codeVerifier?: string;
  readonly requestOptions?: AuthRequestOptions;
}

export interface PasswordGrantRequestInput {
  readonly sdk: OminityOptions;
  readonly username: string;
  readonly password: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scope?: string;
  readonly requestOptions?: AuthRequestOptions;
}

export interface RefreshTokenRequestInput {
  readonly sdk: OminityOptions;
  readonly refreshToken: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scope?: string;
  readonly requestOptions?: AuthRequestOptions;
}

export interface UserAccessTokenRequestInput {
  readonly sdk: OminityOptions;
  readonly userId: AuthUserId;
  readonly requestOptions?: AuthRequestOptions;
}

export interface AuthMfaMethod {
  readonly userId: number;
  readonly method: string;
  readonly isEnabled: boolean;
  readonly verifiedAt?: string | null;
  readonly lastUsedAt?: string | null;
  readonly lastSentAt?: string | null;
  readonly details?: {
    readonly qrCode?: string;
    readonly secret?: string;
  };
  readonly raw: unknown;
}

export interface AuthRecoveryCode {
  readonly id: number;
  readonly code: string;
  readonly usedAt?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  readonly raw: unknown;
}

export interface AuthOAuthAccount {
  readonly id: number;
  readonly providerId: number;
  readonly userId?: number | null;
  readonly identifier?: string;
  readonly name?: string;
  readonly email?: string | null;
  readonly avatar?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly raw: unknown;
}

export interface AuthUserCustomer {
  readonly userId: number;
  readonly customerId: number;
  readonly roleId: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly avatar?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly raw: unknown;
}

export interface AuthPaginatedResult<TItem> {
  readonly items: ReadonlyArray<TItem>;
  readonly count: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
  readonly raw: unknown;
}

export interface AuthStatusResult {
  readonly success: boolean;
  readonly message?: string;
  readonly raw: unknown;
}

export interface AuthPasswordResetLinkResult {
  readonly success: boolean;
  readonly message: string;
  readonly expiresAt?: string;
  readonly createdAt?: string;
  readonly raw: unknown;
}

export interface AuthResetPasswordResult {
  readonly success: boolean;
  readonly message: string;
  readonly updatedAt?: string;
  readonly raw: unknown;
}

export interface AuthIssuePasswordTokenInput {
  readonly username: string;
  readonly password: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scope?: string;
  readonly requestOptions?: AuthRequestOptions;
}

export interface AuthIssueRefreshTokenInput {
  readonly refreshToken: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scope?: string;
  readonly requestOptions?: AuthRequestOptions;
}

export interface AuthIssueUserAccessTokenInput {
  readonly userId: AuthUserId;
  readonly requestOptions?: AuthRequestOptions;
}

export interface AuthIssueTokenInput extends AuthOAuthTokenInput {}

export interface AuthListUserOAuthAccountsInput {
  readonly userId: AuthUserId;
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: string;
  readonly filter?: {
    readonly id?: number;
    readonly providerId?: number;
    readonly identifier?: string;
    readonly email?: string;
  };
  readonly requestOptions?: AuthRequestOptions;
}

export interface AuthListUserCustomersInput {
  readonly userId: AuthUserId;
  readonly page?: number;
  readonly limit?: number;
  readonly requestOptions?: AuthRequestOptions;
}

export interface AuthListUserRecoveryCodesInput {
  readonly userId: AuthUserId;
  readonly sort?: string;
  readonly filter?: {
    readonly id?: number;
    readonly active?: boolean;
  };
  readonly requestOptions?: AuthRequestOptions;
}

export interface AuthRegenerateRecoveryCodesInput {
  readonly userId: AuthUserId;
  readonly confirm: boolean;
  readonly requestOptions?: AuthRequestOptions;
}

export interface AuthValidateRecoveryCodeInput {
  readonly userId: AuthUserId;
  readonly code: string;
  readonly requestOptions?: AuthRequestOptions;
}

export interface AuthUserMfaMethodInput {
  readonly userId: AuthUserId;
  readonly method: string;
  readonly requestOptions?: AuthRequestOptions;
}

export interface AuthValidateMfaInput extends AuthUserMfaMethodInput {
  readonly code: string;
}

export interface AuthSendPasswordResetLinkInput {
  readonly email: string;
  readonly redirectUrl: string;
  readonly userAgent?: string | null;
  readonly ipAddress?: string | null;
  readonly requestOptions?: AuthRequestOptions;
}

export interface AuthResetPasswordInput {
  readonly email: string;
  readonly token: string;
  readonly password: string;
  readonly userAgent?: string | null;
  readonly ipAddress?: string | null;
  readonly requestOptions?: AuthRequestOptions;
}

export interface AuthClient {
  issueToken(input: AuthIssueTokenInput): Promise<OAuthTokenResponse>;
  issuePasswordToken(input: AuthIssuePasswordTokenInput): Promise<OAuthTokenResponse>;
  issueRefreshToken(input: AuthIssueRefreshTokenInput): Promise<OAuthTokenResponse>;
  issueUserAccessToken(input: AuthIssueUserAccessTokenInput): Promise<OAuthTokenResponse>;
  refreshTransientTokenCookie(input?: { requestOptions?: AuthRequestOptions }): Promise<string>;
  listAuthorizedTokens(input?: { requestOptions?: AuthRequestOptions }): Promise<ReadonlyArray<unknown>>;
  revokeAuthorizedToken(input: { tokenId: AuthTokenId; requestOptions?: AuthRequestOptions }): Promise<void>;
  listUserMfaMethods(input: { userId: AuthUserId; requestOptions?: AuthRequestOptions }): Promise<AuthPaginatedResult<AuthMfaMethod>>;
  getUserMfaMethod(input: AuthUserMfaMethodInput): Promise<AuthMfaMethod>;
  enableUserMfaMethod(input: AuthUserMfaMethodInput): Promise<AuthMfaMethod>;
  disableUserMfaMethod(input: AuthUserMfaMethodInput): Promise<AuthStatusResult>;
  sendUserMfaCode(input: AuthUserMfaMethodInput): Promise<AuthStatusResult>;
  validateUserMfaCode(input: AuthValidateMfaInput): Promise<AuthStatusResult>;
  listUserRecoveryCodes(input: AuthListUserRecoveryCodesInput): Promise<AuthPaginatedResult<AuthRecoveryCode>>;
  regenerateUserRecoveryCodes(input: AuthRegenerateRecoveryCodesInput): Promise<AuthPaginatedResult<AuthRecoveryCode>>;
  validateUserRecoveryCode(input: AuthValidateRecoveryCodeInput): Promise<AuthStatusResult>;
  listUserOAuthAccounts(input: AuthListUserOAuthAccountsInput): Promise<AuthPaginatedResult<AuthOAuthAccount>>;
  listUserCustomers(input: AuthListUserCustomersInput): Promise<AuthPaginatedResult<AuthUserCustomer>>;
  sendPasswordResetLink(input: AuthSendPasswordResetLinkInput): Promise<AuthPasswordResetLinkResult>;
  resetPassword(input: AuthResetPasswordInput): Promise<AuthResetPasswordResult>;
}
