export type CommerceCookieSameSite = "lax" | "strict" | "none";

export interface CommerceCookieValue {
  readonly value: string;
}

export interface CommerceCookieReader {
  get(name: string): CommerceCookieValue | undefined;
}

export interface CommerceCookieSetOptions {
  readonly path?: string;
  readonly maxAge?: number;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: CommerceCookieSameSite;
}

export interface CommerceCookieWriter {
  set(name: string, value: string, options?: CommerceCookieSetOptions): void;
}

export interface CartCookieOptions {
  readonly name?: string;
  readonly path?: string;
  readonly maxAgeSeconds?: number;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: CommerceCookieSameSite;
}

export const DEFAULT_CART_COOKIE_NAME = "ominity_cart_id";
export const DEFAULT_CART_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function resolveCookieName(options: CartCookieOptions): string {
  if (typeof options.name === "string" && options.name.trim().length > 0) {
    return options.name.trim();
  }

  return DEFAULT_CART_COOKIE_NAME;
}

function resolveSetOptions(options: CartCookieOptions): CommerceCookieSetOptions {
  return {
    path: options.path ?? "/",
    maxAge: options.maxAgeSeconds ?? DEFAULT_CART_COOKIE_MAX_AGE_SECONDS,
    httpOnly: options.httpOnly ?? true,
    secure: options.secure ?? true,
    sameSite: options.sameSite ?? "lax",
  };
}

export function readCartIdCookie(
  store: CommerceCookieReader,
  options: CartCookieOptions = {},
): string | null {
  const rawValue = store.get(resolveCookieName(options));
  if (!rawValue || typeof rawValue.value !== "string") {
    return null;
  }

  const trimmed = rawValue.value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function writeCartIdCookie(
  store: CommerceCookieWriter,
  cartId: string,
  options: CartCookieOptions = {},
): void {
  const normalizedCartId = cartId.trim();
  if (normalizedCartId.length === 0) {
    return;
  }

  store.set(resolveCookieName(options), normalizedCartId, resolveSetOptions(options));
}

export function clearCartIdCookie(
  store: CommerceCookieWriter,
  options: CartCookieOptions = {},
): void {
  const setOptions = resolveSetOptions(options);
  store.set(resolveCookieName(options), "", {
    ...setOptions,
    maxAge: 0,
  });
}
