import { AuthClientError } from "../cms/errors.js";
import type { AuthSession } from "../auth/types.js";
import {
  decodeAuthSession,
  encodeAuthSession,
  sealAuthSession,
  unsealAuthSession,
} from "../auth/session.js";

export type AuthCookieSameSite = "lax" | "strict" | "none";

export interface AuthCookieValue {
  readonly value: string;
}

export interface AuthCookieReader {
  get(name: string): AuthCookieValue | undefined;
}

export interface AuthCookieSetOptions {
  readonly path?: string;
  readonly maxAge?: number;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: AuthCookieSameSite;
}

export interface AuthCookieWriter {
  set(name: string, value: string, options?: AuthCookieSetOptions): void;
}

export interface AuthSessionCookieOptions {
  readonly name?: string;
  readonly path?: string;
  readonly maxAgeSeconds?: number;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: AuthCookieSameSite;
  readonly sessionSecret?: string;
  readonly allowUnsigned?: boolean;
  readonly tokenVersion?: string;
  readonly minSecretLength?: number;
  readonly expectedTokenVersion?: string;
}

export const DEFAULT_AUTH_SESSION_COOKIE_NAME = "ominity_auth_session";
export const DEFAULT_AUTH_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function resolveCookieName(options: AuthSessionCookieOptions): string {
  if (typeof options.name === "string" && options.name.trim().length > 0) {
    return options.name.trim();
  }

  return DEFAULT_AUTH_SESSION_COOKIE_NAME;
}

function resolveSetOptions(options: AuthSessionCookieOptions): AuthCookieSetOptions {
  return {
    path: options.path ?? "/",
    maxAge: options.maxAgeSeconds ?? DEFAULT_AUTH_SESSION_COOKIE_MAX_AGE_SECONDS,
    httpOnly: options.httpOnly ?? true,
    secure: options.secure ?? true,
    sameSite: options.sameSite ?? "lax",
  };
}

export async function readAuthSessionCookie(
  store: AuthCookieReader,
  options: AuthSessionCookieOptions = {},
): Promise<AuthSession | null> {
  const rawValue = store.get(resolveCookieName(options));
  if (!rawValue || typeof rawValue.value !== "string" || rawValue.value.length === 0) {
    return null;
  }

  try {
    if (typeof options.sessionSecret === "string" && options.sessionSecret.trim().length > 0) {
      return await unsealAuthSession(rawValue.value, {
        secret: options.sessionSecret,
        ...(typeof options.tokenVersion === "string" ? { version: options.tokenVersion } : {}),
        ...(typeof options.expectedTokenVersion === "string"
          ? { expectedVersion: options.expectedTokenVersion }
          : {}),
        ...(typeof options.minSecretLength === "number"
          ? { minSecretLength: options.minSecretLength }
          : {}),
      });
    }

    if (options.allowUnsigned !== true) {
      return null;
    }

    return decodeAuthSession(rawValue.value);
  } catch {
    return null;
  }
}

export async function writeAuthSessionCookie(
  store: AuthCookieWriter,
  session: AuthSession,
  options: AuthSessionCookieOptions = {},
): Promise<void> {
  let value: string;
  if (typeof options.sessionSecret === "string" && options.sessionSecret.trim().length > 0) {
    value = await sealAuthSession(session, {
      secret: options.sessionSecret,
      ...(typeof options.tokenVersion === "string" ? { version: options.tokenVersion } : {}),
      ...(typeof options.minSecretLength === "number"
        ? { minSecretLength: options.minSecretLength }
        : {}),
    });
  } else if (options.allowUnsigned === true) {
    value = encodeAuthSession(session);
  } else {
    throw new AuthClientError("Missing sessionSecret for auth session cookie signing.", {
      details: {
        cookieName: resolveCookieName(options),
      },
    });
  }

  store.set(
    resolveCookieName(options),
    value,
    resolveSetOptions(options),
  );
}

export function clearAuthSessionCookie(
  store: AuthCookieWriter,
  options: AuthSessionCookieOptions = {},
): void {
  const setOptions = resolveSetOptions(options);
  store.set(resolveCookieName(options), "", {
    ...setOptions,
    maxAge: 0,
  });
}
