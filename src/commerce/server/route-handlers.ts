import { Ominity } from "@ominity/api-typescript";
import type { Cart, CartItem, Order } from "@ominity/api-typescript/models";

import {
  createOminityUserAccessSdk,
  readOminityAuthSession,
  type OminityAuthRouteHandlerConfig,
  type OminityAuthRouteSession,
} from "../../auth/server/route-handlers.js";
import { readActiveCustomerId } from "../../customer-accounts/server/cookies.js";
import {
  clearCartIdCookie,
  readCartIdCookie,
  writeCartIdCookie,
  type CartCookieOptions,
} from "../../next/commerce.js";
import {
  asNonEmptyString,
  asObjectRecord,
  createRequestLanguageResolver,
  jsonError,
  loadNextCookiesStore,
  type MaybePromise,
  type RouteCookieStore,
} from "../../server/route-utils.js";

const DEFAULT_OMINITY_BASE_URL = "https://demo.ominity.com/api";
const DEV_SECRET = "development-only-ominity-session-secret-change-me";
const ORDERS_COOKIE = "ominity_orders";
const ORDERS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const MAX_REMEMBERED_ORDERS = 20;
const CART_INCLUDE = "shippingMethod";
const CART_ITEMS_INCLUDE = "product";

/** Cart fields the browser may change. Owner, customer and tax fields are set by the server only. */
const CART_FIELDS = [
  "email",
  "companyName",
  "companyVat",
  "billingAddress",
  "shippingAddress",
  "shippingMethodId",
  "country",
  "currency",
  "promotionCodes",
] as const;
/** Cart fields copied onto the order at checkout. */
const ORDER_FIELDS_FROM_CART = [
  "email",
  "companyName",
  "companyVat",
  "billingAddress",
  "shippingAddress",
  "shippingMethodId",
  "promotionCodes",
] as const;
/** Payment fields the browser may send; `mandateId` is checked against the signed-in customer. */
const PAYMENT_FIELDS = ["type", "paymentmethodId", "issuerId", "redirectUrl", "details", "mandateId"] as const;

export type OminityRequestCountryResolver = (request: Request) => MaybePromise<string | undefined>;

export interface OminityCommerceRouteHandlerConfig extends OminityAuthRouteHandlerConfig {
  /** Where the routes are mounted. Defaults to `/api/commerce`. */
  readonly basePath?: string | undefined;
  readonly cartCookieName?: string | undefined;
  readonly cartCookieMaxAgeSeconds?: number | undefined;
  readonly activeCustomerCookieName?: string | undefined;
  readonly paymentMethodsLimit?: number | undefined;
  /** Country of a new cart, e.g. from a geo header. */
  readonly resolveCountry?: OminityRequestCountryResolver | undefined;
  /** When false, checkout requires a signed-in user. Defaults to true. */
  readonly guestCheckout?: boolean | undefined;
  /** Extra order fields the browser may send with `placeOrder`, besides `notes`. */
  readonly checkoutFields?: ReadonlyArray<string> | undefined;
}

export interface OminityCommerceRouteHandlers {
  readonly GET: (request: Request) => Promise<Response>;
  readonly POST: (request: Request) => Promise<Response>;
  readonly PATCH: (request: Request) => Promise<Response>;
  readonly DELETE: (request: Request) => Promise<Response>;
}

/** The cart and its items as the SDK returns them. */
export interface OminityCartSnapshot {
  readonly cart: Cart | null;
  readonly items: ReadonlyArray<CartItem>;
}

interface Shopper {
  readonly session: OminityAuthRouteSession;
  readonly userId: number;
  readonly customerId: number | null;
  readonly canPlaceOrders: boolean;
}

function pick(source: Readonly<Record<string, unknown>>, keys: ReadonlyArray<string>): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return asObjectRecord(await request.json());
  } catch {
    return null;
  }
}

/**
 * The cart, checkout and order routes of the browser hooks (`useCart`, `useCheckout`). The browser can only reach
 * the cart in its HttpOnly cookie and the orders placed in this session (or, signed in, its customer's orders), and
 * only change the fields a shopper may change. Prices, owners and taxes always come from Ominity.
 */
/** The HTTP status of an SDK error: `status` on API error bodies, `statusCode` on every SDK HTTP error. */
function errorStatus(error: unknown): number | undefined {
  const { status, statusCode } = (error ?? {}) as { readonly status?: unknown; readonly statusCode?: unknown };
  if (typeof status === "number") return status;
  return typeof statusCode === "number" ? statusCode : undefined;
}

export function createOminityCommerceRouteHandlers(config: OminityCommerceRouteHandlerConfig): OminityCommerceRouteHandlers {
  const basePath = (config.basePath ?? "/api/commerce").replace(/\/+$/, "");
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);
  const cartCookie: CartCookieOptions = {
    ...(config.cartCookieName ? { name: config.cartCookieName } : {}),
    ...(typeof config.cartCookieMaxAgeSeconds === "number" ? { maxAgeSeconds: config.cartCookieMaxAgeSeconds } : {}),
    secure: (config.nodeEnv ?? "development") === "production",
  };
  const secret = asNonEmptyString(config.authSessionSecret) ?? DEV_SECRET;
  if (secret === DEV_SECRET && (config.nodeEnv ?? "development") === "production") {
    throw new Error("OMINITY_AUTH_SESSION_SECRET must be configured in production.");
  }

  async function sdk(request: Request): Promise<Ominity> {
    const apiKey = asNonEmptyString(config.ominityApiKey);
    if (!apiKey) throw new Error("OMINITY_API_KEY is required for the commerce routes.");
    const language = await getLanguage(request);
    const channelId = asNonEmptyString(config.channelId);
    return new Ominity({
      serverURL: (config.ominityBaseUrl ?? DEFAULT_OMINITY_BASE_URL).replace(/\/+$/, ""),
      security: { apiKey },
      ...(language ? { language } : {}),
      ...(channelId ? { channelId } : {}),
      ...(config.sdkHttpClient ? { httpClient: config.sdkHttpClient } : {}),
    });
  }

  /** The signed-in user and the active customer they belong to, confirmed with their own token. */
  async function shopper(request: Request, cookies: RouteCookieStore): Promise<Shopper | null> {
    const session = await readOminityAuthSession(config, cookies);
    if (!session || typeof session.userId !== "number") return null;
    const activeId = readActiveCustomerId(cookies, {
      ...(config.activeCustomerCookieName ? { name: config.activeCustomerCookieName } : {}),
    });
    if (!activeId) return { session, userId: session.userId, customerId: null, canPlaceOrders: true };

    const language = await getLanguage(request);
    const membership = await createOminityUserAccessSdk(config, session.accessToken, language)
      .users.customers.get({ userId: session.userId, customerId: activeId })
      .catch((error: unknown) => {
        // A stale active-customer cookie (no longer a member) shops as the user alone; any other failure must not
        // silently drop the customer from the cart or order.
        const status = errorStatus(error);
        if (status === 403 || status === 404) return null;
        throw error;
      });
    if (!membership) return { session, userId: session.userId, customerId: null, canPlaceOrders: true };
    return {
      session,
      userId: session.userId,
      customerId: membership.customerId,
      canPlaceOrders: membership.isOwner || membership.permissions.includes("commerce.orders.place"),
    };
  }

  async function snapshot(client: Ominity, cartId: string): Promise<OminityCartSnapshot> {
    const [cart, items] = await Promise.all([
      client.commerce.carts.get(cartId, { include: CART_INCLUDE }),
      client.commerce.cartItems.list(cartId, { cartId, include: CART_ITEMS_INCLUDE, limit: 250 }),
    ]);
    return { cart, items: items.items };
  }

  /** The cookie's cart, attached to the signed-in user; a new one when `create` and there is none. */
  async function currentCart(
    request: Request,
    cookies: RouteCookieStore,
    client: Ominity,
    create: boolean,
  ): Promise<Cart | null> {
    const cartId = readCartIdCookie(cookies, cartCookie);
    let cart = cartId
      ? await client.commerce.carts.get(cartId, { include: CART_INCLUDE }).catch(() => null)
      : null;
    if (cart?.status === "completed") cart = null;
    const owner = await shopper(request, cookies);

    if (!cart && create) {
      const country = asNonEmptyString(await config.resolveCountry?.(request))?.toUpperCase();
      cart = await client.commerce.carts.create({
        ...(country ? { country } : {}),
        ...(owner ? { userId: owner.userId, ...(owner.customerId ? { customerId: owner.customerId } : {}) } : {}),
      });
      writeCartIdCookie(cookies, cart.id, cartCookie);
    } else if (cart && owner && (cart.userId !== owner.userId || (owner.customerId && cart.customerId !== owner.customerId))) {
      cart = await client.commerce.carts.update(cart.id, {
        userId: owner.userId,
        ...(owner.customerId ? { customerId: owner.customerId } : {}),
      });
    }
    return cart;
  }

  async function rememberedOrders(cookies: RouteCookieStore): Promise<string[]> {
    const [payload, signature] = (cookies.get(ORDERS_COOKIE)?.value ?? "").split(".");
    if (!payload || !signature || signature !== await hmac(secret, payload)) return [];
    try {
      const ids = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as unknown;
      return Array.isArray(ids) ? ids.map(String) : [];
    } catch {
      return [];
    }
  }

  async function rememberOrder(cookies: RouteCookieStore, orderId: string): Promise<void> {
    const ids = [orderId, ...(await rememberedOrders(cookies)).filter((id) => id !== orderId)].slice(0, MAX_REMEMBERED_ORDERS);
    const payload = base64url(new TextEncoder().encode(JSON.stringify(ids)));
    cookies.set(ORDERS_COOKIE, `${payload}.${await hmac(secret, payload)}`, {
      path: "/",
      maxAge: ORDERS_COOKIE_MAX_AGE,
      httpOnly: true,
      secure: (config.nodeEnv ?? "development") === "production",
      sameSite: "lax",
    });
  }

  /** An order placed in this browser, or one of the signed-in user's active customer. */
  async function accessibleOrder(request: Request, cookies: RouteCookieStore, client: Ominity, orderId: string): Promise<{ order: Order; owner: Shopper | null } | null> {
    const remembered = (await rememberedOrders(cookies)).includes(orderId);
    const owner = await shopper(request, cookies);
    if (!remembered && !owner?.customerId) return null;
    const order = await client.commerce.orders.get(orderId).catch(() => null);
    if (!order) return null;
    return remembered || (owner?.customerId && order.customerId === owner.customerId) ? { order, owner } : null;
  }

  function crossSite(request: Request): boolean {
    if (request.headers.get("sec-fetch-site") === "cross-site") return true;
    const origin = asNonEmptyString(request.headers.get("origin"));
    if (!origin) return false;
    const expected = asNonEmptyString(config.siteUrl) ? new URL(config.siteUrl as string).origin : new URL(request.url).origin;
    return origin !== expected;
  }

  function segments(request: Request): string[] | null {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    if (!pathname.startsWith(`${basePath}/`)) return null;
    return pathname.slice(basePath.length + 1).split("/").map(decodeURIComponent);
  }

  const noStore = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const notFound = () => jsonError(404, "NOT_FOUND", "Commerce route not found.");

  async function handle(method: string, request: Request): Promise<Response> {
    const path = segments(request);
    if (!path) return notFound();
    if (method !== "GET" && crossSite(request)) {
      return jsonError(403, "INVALID_ORIGIN", "This request must come from the same site.");
    }
    const [resource, id, sub] = path;
    const cookies = await loadNextCookiesStore();

    try {
      const client = await sdk(request);

      if (resource === "cart" && !id) {
        if (method === "GET") {
          const cart = await currentCart(request, cookies, client, false);
          return noStore(cart ? await snapshot(client, cart.id) : { cart: null, items: [] });
        }
        if (method === "PATCH") {
          const body = await readJson(request);
          if (!body) return jsonError(400, "INVALID_PAYLOAD", "Send the cart fields as a JSON object.");
          const cart = await currentCart(request, cookies, client, true);
          await client.commerce.carts.update((cart as Cart).id, pick(body, CART_FIELDS));
          return noStore(await snapshot(client, (cart as Cart).id));
        }
        if (method === "DELETE") {
          clearCartIdCookie(cookies, cartCookie);
          return noStore({ cart: null, items: [] });
        }
      }

      if (resource === "cart" && id === "items") {
        const body = method === "GET" || method === "DELETE" ? {} : await readJson(request);
        if (!body) return jsonError(400, "INVALID_PAYLOAD", "Send the item as a JSON object.");
        const quantity = Number(body.quantity ?? 1);
        if (method !== "DELETE" && (!Number.isFinite(quantity) || quantity < 0)) {
          return jsonError(400, "INVALID_QUANTITY", "Quantity must be zero or more.");
        }
        const cart = await currentCart(request, cookies, client, method === "POST");
        if (!cart) return jsonError(404, "CART_NOT_FOUND", "There is no cart yet.");

        if (method === "POST" && !sub) {
          const productId = asNonEmptyString(String(body.productId ?? ""));
          if (!productId) return jsonError(400, "INVALID_PRODUCT", "A productId is required.");
          await client.commerce.cartItems.create(cart.id, productId, Math.max(quantity, 1));
          return noStore(await snapshot(client, cart.id), 201);
        }
        if (sub && method === "PATCH") {
          await (quantity === 0
            ? client.commerce.cartItems.delete(cart.id, sub)
            : client.commerce.cartItems.update(cart.id, sub, { quantity }));
          return noStore(await snapshot(client, cart.id));
        }
        if (sub && method === "DELETE") {
          await client.commerce.cartItems.delete(cart.id, sub);
          return noStore(await snapshot(client, cart.id));
        }
      }

      if (resource === "shipping-methods" && method === "GET") {
        const cart = await currentCart(request, cookies, client, false);
        if (!cart) return noStore({ items: [] });
        const methods = await client.commerce.carts.listShippingMethods({ cartId: cart.id });
        return noStore({ items: methods.items });
      }

      if (resource === "payment-methods" && method === "GET") {
        if (id && sub === "issuers" && path.length === 3) {
          const issuers = await client.settings.paymentMethodIssuers.list({ methodId: Number(id), limit: 250 });
          return noStore({ items: issuers.items });
        }
        if (!id) {
          const methods = await client.settings.paymentMethods.list({ limit: config.paymentMethodsLimit ?? 100 });
          return noStore({ items: methods.items });
        }
      }

      if (resource === "checkout" && method === "POST") {
        const body = (await readJson(request)) ?? {};
        const owner = await shopper(request, cookies);
        if (!owner && config.guestCheckout === false) {
          return jsonError(401, "UNAUTHENTICATED", "Sign in to place an order.");
        }
        if (owner?.customerId && !owner.canPlaceOrders) {
          return jsonError(403, "MISSING_CUSTOMER_PERMISSION", "You may not place orders for this customer.");
        }
        const cart = await currentCart(request, cookies, client, false);
        if (!cart || cart.totalQuantity === 0) return jsonError(422, "CART_EMPTY", "The cart is empty.");

        const extra = asObjectRecord(body.fields) ?? {};
        const order = await client.commerce.orders.create({
          ...pick(cart as unknown as Record<string, unknown>, ORDER_FIELDS_FROM_CART),
          ...pick(extra, ["notes", ...(config.checkoutFields ?? [])]),
          cartId: cart.id,
          ...(owner ? { userId: owner.userId, ...(owner.customerId ? { customerId: owner.customerId } : {}) } : {}),
        });
        await rememberOrder(cookies, String(order.id));
        clearCartIdCookie(cookies, cartCookie);
        return noStore({ order }, 201);
      }

      if (resource === "orders" && id) {
        const access = await accessibleOrder(request, cookies, client, id);
        if (!access) return jsonError(404, "ORDER_NOT_FOUND", "Order was not found.");

        if (!sub && method === "GET") return noStore({ order: access.order });
        if (sub === "payments" && method === "GET") {
          const payments = await client.commerce.orders.listPayments(id);
          return noStore({ items: payments.items });
        }
        if (sub === "payments" && method === "POST") {
          const data = pick((await readJson(request)) ?? {}, PAYMENT_FIELDS);
          if (data.mandateId !== undefined) {
            const customerId = access.owner?.customerId;
            const mandate = customerId && access.owner
              ? await createOminityUserAccessSdk(config, access.owner.session.accessToken, await getLanguage(request))
                .commerce.customerMandates.get({ customerId, id: Number(data.mandateId) })
                .catch(() => null)
              : null;
            if (!mandate || access.order.customerId !== customerId) {
              return jsonError(403, "MANDATE_NOT_ALLOWED", "This mandate cannot pay this order.");
            }
          }
          const idempotencyKey = asNonEmptyString(request.headers.get("idempotency-key"));
          const payment = await client.commerce.orders.createPayment(
            { orderId: id, data: data as Parameters<Ominity["commerce"]["orders"]["createPayment"]>[0]["data"] },
            idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined,
          );
          return noStore({ payment }, 201);
        }
      }

      return notFound();
    } catch (error) {
      const status = errorStatus(error) ?? 500;
      if (status >= 500) console.error("[ominity] commerce route failed", error);
      return jsonError(status >= 400 && status < 500 ? status : 502, "COMMERCE_REQUEST_FAILED", "The request could not be completed.", {
        ...(typeof (error as { code?: unknown })?.code === "string" ? { reason: (error as { code: string }).code } : {}),
        ...(typeof (error as { fields?: unknown })?.fields === "object" ? { fields: (error as { fields: unknown }).fields } : {}),
      });
    }
  }

  return {
    GET: (request) => handle("GET", request),
    POST: (request) => handle("POST", request),
    PATCH: (request) => handle("PATCH", request),
    DELETE: (request) => handle("DELETE", request),
  };
}
