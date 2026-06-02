import type {
  CommerceCookieReader,
  CommerceCookieSameSite,
  CommerceCookieSetOptions,
  CommerceCookieWriter,
} from "./commerce.js";

export type {
  TrackEventRequest,
  TrackingEventMetadata,
  TrackingEventName,
  TrackingEventUtm,
} from "./tracking-types.js";

export interface VisitorIdCookieOptions {
  readonly name?: string;
  readonly path?: string;
  readonly maxAgeSeconds?: number;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: CommerceCookieSameSite;
}

export const DEFAULT_VISITOR_ID_COOKIE_NAME = "_omtvid";
export const DEFAULT_VISITOR_ID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveCookieName(options: VisitorIdCookieOptions): string {
  if (typeof options.name === "string" && options.name.trim().length > 0) {
    return options.name.trim();
  }

  return DEFAULT_VISITOR_ID_COOKIE_NAME;
}

function resolveSetOptions(options: VisitorIdCookieOptions): CommerceCookieSetOptions {
  return {
    path: options.path ?? "/",
    maxAge: options.maxAgeSeconds ?? DEFAULT_VISITOR_ID_COOKIE_MAX_AGE_SECONDS,
    httpOnly: options.httpOnly ?? false,
    secure: options.secure ?? true,
    sameSite: options.sameSite ?? "lax",
  };
}

function fillRandomBytes(bytes: Uint8Array): void {
  const randomValues = globalThis.crypto?.getRandomValues;
  if (typeof randomValues === "function") {
    randomValues.call(globalThis.crypto, bytes);
    return;
  }

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
}

export function isVisitorId(value: string | null | undefined): value is string {
  if (typeof value !== "string") {
    return false;
  }

  return UUID_PATTERN.test(value.trim());
}

export function generateVisitorId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === "function") {
    const candidate = randomUUID.call(globalThis.crypto);
    if (isVisitorId(candidate)) {
      return candidate;
    }
  }

  const bytes = new Uint8Array(16);
  fillRandomBytes(bytes);

  const versionByte = bytes[6];
  if (typeof versionByte === "number") {
    bytes[6] = (versionByte & 0x0f) | 0x40;
  }

  const variantByte = bytes[8];
  if (typeof variantByte === "number") {
    bytes[8] = (variantByte & 0x3f) | 0x80;
  }

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function readVisitorIdCookie(
  store: CommerceCookieReader,
  options: VisitorIdCookieOptions = {},
): string | null {
  const rawValue = store.get(resolveCookieName(options));
  if (!rawValue || typeof rawValue.value !== "string") {
    return null;
  }

  const value = rawValue.value.trim();
  return isVisitorId(value) ? value : null;
}

export function writeVisitorIdCookie(
  store: CommerceCookieWriter,
  visitorId: string,
  options: VisitorIdCookieOptions = {},
): void {
  const normalizedVisitorId = visitorId.trim();
  if (!isVisitorId(normalizedVisitorId)) {
    return;
  }

  store.set(resolveCookieName(options), normalizedVisitorId, resolveSetOptions(options));
}

export function ensureVisitorIdCookie(
  store: CommerceCookieReader & CommerceCookieWriter,
  options: VisitorIdCookieOptions = {},
): string {
  const existing = readVisitorIdCookie(store, options);
  if (existing) {
    return existing;
  }

  const visitorId = generateVisitorId();
  writeVisitorIdCookie(store, visitorId, options);
  return visitorId;
}

export function clearVisitorIdCookie(
  store: CommerceCookieWriter,
  options: VisitorIdCookieOptions = {},
): void {
  const setOptions = resolveSetOptions(options);
  store.set(resolveCookieName(options), "", {
    ...setOptions,
    maxAge: 0,
  });
}
