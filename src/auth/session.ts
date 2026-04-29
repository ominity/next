import { AuthClientError } from "../cms/errors.js";
import type { AuthSession, OAuthTokenResponse } from "./types.js";
import { expiresAtFromTokenResponse } from "./password-grant.js";

function toBase64Url(input: string): string {
  if (typeof btoa !== "function") {
    throw new AuthClientError("Global btoa is not available in this runtime.");
  }

  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function toBase64UrlFromBytes(bytes: Uint8Array): string {
  if (typeof btoa !== "function") {
    throw new AuthClientError("Global btoa is not available in this runtime.");
  }

  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): string {
  if (typeof atob !== "function") {
    throw new AuthClientError("Global atob is not available in this runtime.");
  }

  const normalized = input
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

export function createAuthSession(
  token: OAuthTokenResponse,
  options: {
    now?: Date;
    userId?: number;
    email?: string;
  } = {},
): AuthSession {
  const expiresAt = Date.parse(token.expiresAt);

  return {
    accessToken: token.accessToken,
    ...(typeof token.refreshToken === "string" ? { refreshToken: token.refreshToken } : {}),
    tokenType: token.tokenType,
    expiresAt: Number.isFinite(expiresAt) ? token.expiresAt : expiresAtFromTokenResponse(token),
    ...(typeof options.userId === "number" ? { userId: options.userId } : {}),
    ...(typeof options.email === "string" ? { email: options.email } : {}),
  };
}

export function encodeAuthSession(session: AuthSession): string {
  return toBase64Url(JSON.stringify(session));
}

export function decodeAuthSession(input: string): AuthSession {
  let payload: unknown;
  try {
    payload = JSON.parse(fromBase64Url(input));
  } catch (error) {
    throw new AuthClientError("Failed to decode auth session.", {
      cause: error,
    });
  }

  if (typeof payload !== "object" || payload === null) {
    throw new AuthClientError("Decoded auth session has invalid shape.");
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.accessToken !== "string") {
    throw new AuthClientError("Decoded auth session missing accessToken.");
  }

  if (typeof record.tokenType !== "string") {
    throw new AuthClientError("Decoded auth session missing tokenType.");
  }

  if (typeof record.expiresAt !== "string") {
    throw new AuthClientError("Decoded auth session missing expiresAt.");
  }

  return {
    accessToken: record.accessToken,
    tokenType: record.tokenType,
    expiresAt: record.expiresAt,
    ...(typeof record.refreshToken === "string" ? { refreshToken: record.refreshToken } : {}),
    ...(typeof record.userId === "number" ? { userId: record.userId } : {}),
    ...(typeof record.email === "string" ? { email: record.email } : {}),
  };
}

export interface AuthSessionSealOptions {
  readonly secret: string;
  readonly version?: string;
  readonly minSecretLength?: number;
}

export interface AuthSessionUnsealOptions extends AuthSessionSealOptions {
  readonly expectedVersion?: string;
}

export const DEFAULT_AUTH_SESSION_TOKEN_VERSION = "v1";
export const DEFAULT_AUTH_SESSION_MIN_SECRET_LENGTH = 32;

function ensureNonEmptyString(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new AuthClientError(`${field} must be a non-empty string.`, {
      details: {
        field,
      },
    });
  }

  return normalized;
}

function resolveSigningSecret(options: AuthSessionSealOptions): string {
  const secret = ensureNonEmptyString(options.secret, "secret");
  const minSecretLength = options.minSecretLength ?? DEFAULT_AUTH_SESSION_MIN_SECRET_LENGTH;

  if (secret.length < minSecretLength) {
    throw new AuthClientError("secret does not meet minimum length requirements.", {
      details: {
        minSecretLength,
      },
    });
  }

  return secret;
}

function resolveWebCrypto(): Crypto {
  if (typeof globalThis.crypto === "object" && globalThis.crypto !== null) {
    return globalThis.crypto;
  }

  throw new AuthClientError("Web Crypto API is not available in this runtime.");
}

function toUint8(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = bytes;
  if (buffer instanceof ArrayBuffer) {
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }

  const copy = new ArrayBuffer(byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function signSessionPayload(
  input: string,
  options: AuthSessionSealOptions,
): Promise<string> {
  const secret = resolveSigningSecret(options);
  const webCrypto = resolveWebCrypto();
  const key = await webCrypto.subtle.importKey(
    "raw",
    toArrayBuffer(toUint8(secret)),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await webCrypto.subtle.sign("HMAC", key, toArrayBuffer(toUint8(input)));
  return toBase64UrlFromBytes(new Uint8Array(signature));
}

function timingSafeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    const leftCode = index < left.length ? left.charCodeAt(index) : 0;
    const rightCode = index < right.length ? right.charCodeAt(index) : 0;
    diff |= leftCode ^ rightCode;
  }

  return diff === 0;
}

export async function sealAuthSession(
  session: AuthSession,
  options: AuthSessionSealOptions,
): Promise<string> {
  const version = options.version ?? DEFAULT_AUTH_SESSION_TOKEN_VERSION;
  const encodedPayload = encodeAuthSession(session);
  const signingInput = `${version}.${encodedPayload}`;
  const signature = await signSessionPayload(signingInput, options);

  return `${signingInput}.${signature}`;
}

export async function verifyAuthSessionSignature(
  input: string,
  options: AuthSessionSealOptions,
): Promise<boolean> {
  const [version, payload, signature, extra] = input.split(".");
  if (!version || !payload || !signature || extra) {
    return false;
  }

  const expectedSignature = await signSessionPayload(`${version}.${payload}`, options);
  return timingSafeEqual(signature, expectedSignature);
}

export async function unsealAuthSession(
  input: string,
  options: AuthSessionUnsealOptions,
): Promise<AuthSession> {
  const [version, payload, signature, extra] = input.split(".");
  if (!version || !payload || !signature || extra) {
    throw new AuthClientError("Signed auth session has invalid format.");
  }

  const expectedVersion = options.expectedVersion ?? options.version ?? DEFAULT_AUTH_SESSION_TOKEN_VERSION;
  if (version !== expectedVersion) {
    throw new AuthClientError("Signed auth session has unsupported token version.", {
      details: {
        version,
        expectedVersion,
      },
    });
  }

  const expectedSignature = await signSessionPayload(`${version}.${payload}`, options);
  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new AuthClientError("Signed auth session signature is invalid.");
  }

  return decodeAuthSession(payload);
}

export function isAuthSessionExpired(session: AuthSession, now: Date = new Date()): boolean {
  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return true;
  }

  return now.getTime() >= expiresAt;
}
