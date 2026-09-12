import type { RouteCookieStore } from "../../server/route-utils.js";

export const DEFAULT_ACTIVE_CUSTOMER_COOKIE_NAME = "ominity_active_customer";
export const DEFAULT_ACTIVE_CUSTOMER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface ActiveCustomerCookieOptions {
  readonly name?: string;
  readonly maxAgeSeconds?: number;
  readonly secure?: boolean;
}

function cookieName(options: ActiveCustomerCookieOptions): string {
  const value = options.name?.trim();
  return value || DEFAULT_ACTIVE_CUSTOMER_COOKIE_NAME;
}

function parseCustomerId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function readActiveCustomerId(
  store: Pick<RouteCookieStore, "get">,
  options: ActiveCustomerCookieOptions = {},
): number | null {
  return parseCustomerId(store.get(cookieName(options))?.value);
}

export function writeActiveCustomerId(
  store: Pick<RouteCookieStore, "set">,
  customerId: number,
  options: ActiveCustomerCookieOptions = {},
): void {
  if (!Number.isSafeInteger(customerId) || customerId <= 0) {
    throw new TypeError("customerId must be a positive integer.");
  }

  store.set(cookieName(options), String(customerId), {
    path: "/",
    maxAge: options.maxAgeSeconds ?? DEFAULT_ACTIVE_CUSTOMER_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    secure: options.secure ?? true,
    sameSite: "lax",
  });
}

export function clearActiveCustomerId(
  store: Pick<RouteCookieStore, "set">,
  options: ActiveCustomerCookieOptions = {},
): void {
  store.set(cookieName(options), "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: options.secure ?? true,
    sameSite: "lax",
  });
}
