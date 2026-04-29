import { AuthClientError } from "../cms/errors.js";
import type {
  AuthMfaMethod,
  AuthOAuthAccount,
  AuthPaginatedResult,
  AuthPasswordResetLinkResult,
  AuthRecoveryCode,
  AuthResetPasswordResult,
  AuthStatusResult,
  AuthTokenId,
  AuthUserCustomer,
  AuthUserId,
  OAuthTokenResponse,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

interface RawPaginated<TItem> {
  readonly items: ReadonlyArray<TItem>;
  readonly count: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asOptionalNullableString(value: unknown): string | null | undefined {
  if (typeof value === "string") {
    return value;
  }

  return value === null ? null : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function normalizePositiveNumberString(value: string, field: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AuthClientError(`${field} must be a positive numeric value.`, {
      details: {
        field,
        value,
      },
    });
  }

  return parsed;
}

export function normalizeAuthUserId(value: AuthUserId, field: string = "userId"): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      throw new AuthClientError(`${field} must be a positive integer.`, {
        details: {
          field,
          value,
        },
      });
    }

    return value;
  }

  return normalizePositiveNumberString(value, field);
}

export function normalizeAuthTokenId(value: AuthTokenId): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      throw new AuthClientError("tokenId must be a positive integer or a non-empty string.", {
        details: { tokenId: value },
      });
    }

    return String(value);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new AuthClientError("tokenId must be a non-empty string.", {
      details: { tokenId: value },
    });
  }

  return normalized;
}

export function normalizeOAuthTokenResponse(
  payload: unknown,
  now: Date = new Date(),
): OAuthTokenResponse {
  if (!isRecord(payload)) {
    throw new AuthClientError("OAuth token response is not an object.", {
      details: { payload },
    });
  }

  const accessToken = asOptionalString(payload.access_token);
  if (!accessToken) {
    throw new AuthClientError("OAuth token response missing access_token.", {
      details: { payload },
    });
  }

  const tokenType = asOptionalString(payload.token_type) ?? "Bearer";
  const expiresIn = asPositiveNumber(payload.expires_in, 3600);
  const expiresAt = new Date(now.getTime() + expiresIn * 1000).toISOString();

  return {
    accessToken,
    tokenType,
    expiresIn,
    expiresAt,
    ...(typeof payload.refresh_token === "string" ? { refreshToken: payload.refresh_token } : {}),
    raw: payload,
  };
}

function normalizePaginatedShape<TInput, TOutput>(
  payload: unknown,
  mapper: (item: TInput) => TOutput,
  collectionKeys: ReadonlyArray<string>,
): AuthPaginatedResult<TOutput> {
  let typed: RawPaginated<TInput>;
  if (isRecord(payload) && Array.isArray(payload.items)) {
    typed = payload as unknown as RawPaginated<TInput>;
  } else if (isRecord(payload) && isRecord(payload._embedded)) {
    let items: ReadonlyArray<TInput> = [];

    for (const key of collectionKeys) {
      const candidate = payload._embedded[key];
      if (Array.isArray(candidate)) {
        items = candidate as ReadonlyArray<TInput>;
        break;
      }
    }

    const count = asPositiveNumber(payload.count, items.length);
    const page = 1;
    const limit = Math.max(items.length, 1);
    const totalPages = Math.ceil(count / Math.max(limit, 1));
    typed = {
      items,
      count,
      page,
      limit,
      totalPages: totalPages > 0 ? totalPages : 1,
      hasNext: false,
      hasPrevious: false,
    };
  } else {
    throw new AuthClientError("Paginated response payload is invalid.", {
      details: {
        payload,
      },
    });
  }

  return {
    items: typed.items.map((item) => mapper(item)),
    count: asPositiveNumber(typed.count, typed.items.length),
    page: asPositiveNumber(typed.page, 1),
    limit: asPositiveNumber(typed.limit, Math.max(typed.items.length, 1)),
    totalPages: asPositiveNumber(typed.totalPages, 1),
    hasNext: typed.hasNext === true,
    hasPrevious: typed.hasPrevious === true,
    raw: payload,
  };
}

export function normalizeMfaMethod(payload: unknown): AuthMfaMethod {
  if (!isRecord(payload)) {
    throw new AuthClientError("User MFA method response payload is invalid.", {
      details: { payload },
    });
  }

  const userId = asOptionalNumber(payload.userId);
  const method = asOptionalString(payload.method);
  const isEnabled = asOptionalBoolean(payload.isEnabled);
  if (typeof userId !== "number" || typeof method !== "string" || typeof isEnabled !== "boolean") {
    throw new AuthClientError("User MFA method response missing required fields.", {
      details: {
        payload,
      },
    });
  }

  const details = isRecord(payload.details)
    ? {
      ...(typeof payload.details.qrCode === "string" ? { qrCode: payload.details.qrCode } : {}),
      ...(typeof payload.details.secret === "string" ? { secret: payload.details.secret } : {}),
    }
    : null;

  return {
    userId,
    method,
    isEnabled,
    ...(typeof payload.verifiedAt === "string" || payload.verifiedAt === null
      ? { verifiedAt: payload.verifiedAt }
      : {}),
    ...(typeof payload.lastUsedAt === "string" || payload.lastUsedAt === null
      ? { lastUsedAt: payload.lastUsedAt }
      : {}),
    ...(typeof payload.lastSentAt === "string" || payload.lastSentAt === null
      ? { lastSentAt: payload.lastSentAt }
      : {}),
    ...(details ? { details } : {}),
    raw: payload,
  };
}

export function normalizeMfaMethodList(payload: unknown): AuthPaginatedResult<AuthMfaMethod> {
  return normalizePaginatedShape(payload, normalizeMfaMethod, ["user_mfa_methods"]);
}

export function normalizeStatusResult(payload: unknown): AuthStatusResult {
  if (!isRecord(payload)) {
    throw new AuthClientError("Status response payload is invalid.", {
      details: { payload },
    });
  }

  const success = asOptionalBoolean(payload.success);
  if (typeof success !== "boolean") {
    throw new AuthClientError("Status response payload missing success flag.", {
      details: { payload },
    });
  }

  return {
    success,
    ...(typeof payload.message === "string" ? { message: payload.message } : {}),
    raw: payload,
  };
}

export function normalizeRecoveryCode(payload: unknown): AuthRecoveryCode {
  if (!isRecord(payload)) {
    throw new AuthClientError("User recovery code payload is invalid.", {
      details: { payload },
    });
  }

  const id = asOptionalNumber(payload.id);
  const code = asOptionalString(payload.code);
  if (typeof id !== "number" || typeof code !== "string") {
    throw new AuthClientError("User recovery code payload missing required fields.", {
      details: { payload },
    });
  }

  return {
    id,
    code,
    ...(typeof payload.usedAt === "string" || payload.usedAt === null ? { usedAt: payload.usedAt } : {}),
    ...(typeof payload.createdAt === "string" || payload.createdAt === null ? { createdAt: payload.createdAt } : {}),
    ...(typeof payload.updatedAt === "string" || payload.updatedAt === null ? { updatedAt: payload.updatedAt } : {}),
    raw: payload,
  };
}

export function normalizeRecoveryCodeList(payload: unknown): AuthPaginatedResult<AuthRecoveryCode> {
  return normalizePaginatedShape(payload, normalizeRecoveryCode, ["user_recovery_codes"]);
}

export function normalizeOAuthAccount(payload: unknown): AuthOAuthAccount {
  if (!isRecord(payload)) {
    throw new AuthClientError("User OAuth account payload is invalid.", {
      details: { payload },
    });
  }

  const id = asOptionalNumber(payload.id);
  const providerId = asOptionalNumber(payload.providerId);
  const createdAt = asOptionalString(payload.createdAt);
  const updatedAt = asOptionalString(payload.updatedAt);
  if (typeof id !== "number" || typeof providerId !== "number" || !createdAt || !updatedAt) {
    throw new AuthClientError("User OAuth account payload missing required fields.", {
      details: { payload },
    });
  }

  return {
    id,
    providerId,
    ...(typeof payload.userId === "number" || payload.userId === null ? { userId: payload.userId } : {}),
    ...(typeof payload.identifier === "string" ? { identifier: payload.identifier } : {}),
    ...(typeof payload.name === "string" ? { name: payload.name } : {}),
    ...(typeof payload.email === "string" || payload.email === null ? { email: payload.email } : {}),
    ...(typeof payload.avatar === "string" || payload.avatar === null ? { avatar: payload.avatar } : {}),
    createdAt,
    updatedAt,
    raw: payload,
  };
}

export function normalizeOAuthAccountList(payload: unknown): AuthPaginatedResult<AuthOAuthAccount> {
  return normalizePaginatedShape(payload, normalizeOAuthAccount, ["socialprovider_users"]);
}

export function normalizeUserCustomer(payload: unknown): AuthUserCustomer {
  if (!isRecord(payload)) {
    throw new AuthClientError("User customer payload is invalid.", {
      details: { payload },
    });
  }

  const userId = asOptionalNumber(payload.userId);
  const customerId = asOptionalNumber(payload.customerId);
  const roleId = asOptionalNumber(payload.roleId);
  const firstName = asOptionalString(payload.firstName);
  const lastName = asOptionalString(payload.lastName);
  const email = asOptionalString(payload.email);
  const createdAt = asOptionalString(payload.createdAt);
  const updatedAt = asOptionalString(payload.updatedAt);

  if (
    typeof userId !== "number"
    || typeof customerId !== "number"
    || typeof roleId !== "number"
    || !firstName
    || !lastName
    || !email
    || !createdAt
    || !updatedAt
  ) {
    throw new AuthClientError("User customer payload missing required fields.", {
      details: { payload },
    });
  }

  return {
    userId,
    customerId,
    roleId,
    firstName,
    lastName,
    email,
    ...(typeof payload.avatar === "string" || payload.avatar === null ? { avatar: payload.avatar } : {}),
    createdAt,
    updatedAt,
    raw: payload,
  };
}

export function normalizeUserCustomerList(payload: unknown): AuthPaginatedResult<AuthUserCustomer> {
  return normalizePaginatedShape(payload, normalizeUserCustomer, ["customer_users"]);
}

export function normalizePasswordResetLinkResult(payload: unknown): AuthPasswordResetLinkResult {
  if (!isRecord(payload)) {
    throw new AuthClientError("Password reset link response payload is invalid.", {
      details: { payload },
    });
  }

  const success = asOptionalBoolean(payload.success);
  const message = asOptionalString(payload.message);
  if (typeof success !== "boolean" || typeof message !== "string") {
    throw new AuthClientError("Password reset link response missing required fields.", {
      details: { payload },
    });
  }

  return {
    success,
    message,
    ...(typeof payload.expiresAt === "string" ? { expiresAt: payload.expiresAt } : {}),
    ...(typeof payload.createdAt === "string" ? { createdAt: payload.createdAt } : {}),
    raw: payload,
  };
}

export function normalizeResetPasswordResult(payload: unknown): AuthResetPasswordResult {
  if (!isRecord(payload)) {
    throw new AuthClientError("Reset password response payload is invalid.", {
      details: { payload },
    });
  }

  const success = asOptionalBoolean(payload.success);
  const message = asOptionalString(payload.message);
  if (typeof success !== "boolean" || typeof message !== "string") {
    throw new AuthClientError("Reset password response missing required fields.", {
      details: { payload },
    });
  }

  return {
    success,
    message,
    ...(typeof payload.updatedAt === "string" ? { updatedAt: payload.updatedAt } : {}),
    raw: payload,
  };
}

export function normalizeAuthorizedTokenList(payload: unknown): ReadonlyArray<unknown> {
  if (!Array.isArray(payload)) {
    throw new AuthClientError("Authorized token list payload is invalid.", {
      details: { payload },
    });
  }

  return payload;
}

export function normalizeOptionalString(value: string | null | undefined): string | undefined {
  return asOptionalString(value ?? undefined);
}

export function normalizeOptionalNullableText(value: string | null | undefined): string | null | undefined {
  return asOptionalNullableString(value);
}

export function ensureNonEmptyString(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new AuthClientError(`${field} must be a non-empty string.`, {
      details: {
        field,
        value,
      },
    });
  }

  return normalized;
}
