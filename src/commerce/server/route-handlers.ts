import type { OminityOptions } from "@ominity/api-typescript";

import { createCommerceClient } from "../client.js";
import {
  createCommerceCartItemAndRefresh,
  deleteCommerceCartItemAndRefresh,
  getOrCreateCommerceCartSnapshot,
  setCommerceCartItemQuantityAndRefresh,
  updateCommerceCartAndRefresh,
  updateCommerceCartItemAndRefresh,
} from "../../next/commerce-cart.js";
import {
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
  type OminityRequestLanguageResolver,
  parseJsonBody,
} from "../../server/route-utils.js";
import {
  mockAddCartItem,
  mockCreateOrder,
  mockDeleteCartItem,
  mockGetOrder,
  mockGetOrCreateCart,
  mockGetPayment,
  mockListOrderPayments,
  mockUpdateCart,
  mockUpdateCartItem,
} from "./mock.js";

const DEFAULT_OMINITY_BASE_URL = "https://demo.ominity.com/api";
const CART_INCLUDE = "shippingMethod";
const CART_ITEMS_INCLUDE = "product,offer";

export type OminityRequestCountryResolver = (
  request: Request,
) => MaybePromise<string | undefined | null>;

export interface OminityCommerceRouteHandlerConfig {
  readonly ominityBaseUrl?: string | undefined;
  readonly ominityApiKey?: string | undefined;
  readonly channelId?: string | undefined;
  readonly cartCookieName?: string | undefined;
  readonly cartCookieMaxAgeSeconds?: number | undefined;
  readonly nodeEnv?: string | undefined;
  readonly useMockData?: boolean | undefined;
  readonly debugEnabled?: boolean | undefined;
  readonly sdkHttpClient?: OminityOptions["httpClient"] | undefined;
  readonly paymentMethodsLimit?: number | undefined;
  readonly resolveLanguage?: OminityRequestLanguageResolver | undefined;
  readonly resolveCountry?: OminityRequestCountryResolver | undefined;
}

type CookieStore = Awaited<ReturnType<typeof loadNextCookiesStore>>;
type ItemRouteContext = { params: Promise<{ itemId: string }> };
type OrderRouteContext = { params: Promise<{ orderId: string }> };
type PaymentRouteContext = { params: Promise<{ paymentId: string }> };

function resolveBaseUrl(value: string | undefined): string {
  return (value ?? DEFAULT_OMINITY_BASE_URL).replace(/\/$/, "");
}

function resolveCartCookieOptions(
  config: OminityCommerceRouteHandlerConfig,
): CartCookieOptions {
  const cookieName = asNonEmptyString(config.cartCookieName);

  return {
    ...(cookieName ? { name: cookieName } : {}),
    ...(typeof config.cartCookieMaxAgeSeconds === "number"
      ? { maxAgeSeconds: config.cartCookieMaxAgeSeconds }
      : {}),
    path: "/",
    httpOnly: true,
    secure: (config.nodeEnv ?? "development") === "production",
    sameSite: "lax",
  };
}

function resolveSdkOptions(
  config: OminityCommerceRouteHandlerConfig,
  language?: string,
): OminityOptions {
  const apiKey = asNonEmptyString(config.ominityApiKey);
  if (!apiKey) {
    throw new Error("OMINITY_API_KEY is required.");
  }

  return {
    serverURL: resolveBaseUrl(config.ominityBaseUrl),
    security: {
      apiKey,
    },
    ...(language ? { language } : {}),
    ...(asNonEmptyString(config.channelId) ? { channelId: asNonEmptyString(config.channelId) } : {}),
    ...(config.sdkHttpClient ? { httpClient: config.sdkHttpClient } : {}),
  };
}

function createRouteCommerceClient(
  config: OminityCommerceRouteHandlerConfig,
  language?: string,
) {
  return createCommerceClient({
    sdk: resolveSdkOptions(config, language),
    ...(typeof config.debugEnabled === "boolean"
      ? {
        debug: {
          enabled: config.debugEnabled,
        },
      }
      : {}),
  });
}

async function resolveCreateCartData(
  config: OminityCommerceRouteHandlerConfig,
  request: Request,
): Promise<Readonly<Record<string, unknown>>> {
  const country = asNonEmptyString(await config.resolveCountry?.(request));
  if (!country) {
    return {};
  }

  return {
    country: country.toUpperCase(),
  };
}

function writeMockCartCookie(
  config: OminityCommerceRouteHandlerConfig,
  cookieStore: CookieStore,
  cartId: string,
): void {
  writeCartIdCookie(cookieStore, cartId, resolveCartCookieOptions(config));
}

function asString(value: unknown): string | undefined {
  return asNonEmptyString(value);
}

function normalizeStringList(value: unknown): ReadonlyArray<string> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value.flatMap((entry) => {
    const normalized = asNonEmptyString(entry);
    return normalized ? [normalized] : [];
  });

  return entries.length > 0 ? entries : undefined;
}

function normalizeQuantity(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? Math.floor(value) : 1;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 1;
}

function parseQuantity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeProductId(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isFinite(parsed) && `${parsed}` === trimmed) {
    return parsed;
  }

  return trimmed;
}

function parseCartUpdatePayload(payload: unknown): {
  readonly data?: Readonly<Record<string, unknown>>;
  readonly error?: string;
} {
  const record = asObjectRecord(payload);
  if (!record) {
    return {
      error: "Request body must be an object.",
    };
  }

  const rawData = asObjectRecord(record.data) ?? record;
  const data: Record<string, unknown> = { ...rawData };

  if ("country" in rawData) {
    const country = asString(rawData.country);
    if (!country || country.length !== 2) {
      return {
        error: "`country` must be a valid 2-letter code.",
      };
    }

    data.country = country.toUpperCase();
  }

  if ("promotionCodes" in rawData) {
    if (!Array.isArray(rawData.promotionCodes)) {
      return {
        error: "`promotionCodes` must be an array.",
      };
    }

    data.promotionCodes = Array.from(new Set(
      rawData.promotionCodes.flatMap((entry) => {
        const normalized = asNonEmptyString(entry);
        return normalized ? [normalized] : [];
      }),
    ));
  }

  if (Object.keys(data).length === 0) {
    return {
      error: "Request body must contain cart update fields.",
    };
  }

  return { data };
}

export function createOminityCommerceCartRouteHandlers(
  config: OminityCommerceRouteHandlerConfig,
): {
  readonly GET: (request: Request) => Promise<Response>;
  readonly PATCH: (request: Request) => Promise<Response>;
} {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return {
    async GET(request: Request): Promise<Response> {
      const cookieStore = await loadNextCookiesStore();

      if (config.useMockData) {
        const snapshot = mockGetOrCreateCart(
          cookieStore.get(resolveCartCookieOptions(config).name ?? "ominity_cart_id")?.value,
        );
        writeMockCartCookie(config, cookieStore, snapshot.cart.id);

        return Response.json({
          ...snapshot,
          mode: "mock",
        });
      }

      try {
        const language = await getLanguage(request);
        const snapshot = await getOrCreateCommerceCartSnapshot({
          client: createRouteCommerceClient(config, language),
          cookies: cookieStore,
          cookieOptions: resolveCartCookieOptions(config),
          createCartData: await resolveCreateCartData(config, request),
          cartInclude: CART_INCLUDE,
          itemsInclude: CART_ITEMS_INCLUDE,
        });

        return Response.json(snapshot);
      } catch (error) {
        return jsonError(500, "CART_LOAD_FAILED", "Failed to load cart.", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },

    async PATCH(request: Request): Promise<Response> {
      const cookieStore = await loadNextCookiesStore();

      let payload: unknown;
      try {
        payload = await parseJsonBody(request);
      } catch {
        return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
      }

      const parsedUpdate = parseCartUpdatePayload(payload);
      if (parsedUpdate.error || !parsedUpdate.data) {
        return jsonError(
          400,
          "INVALID_CART_UPDATE",
          parsedUpdate.error ?? "Invalid cart update payload.",
        );
      }

      if (config.useMockData) {
        const current = mockGetOrCreateCart(
          cookieStore.get(resolveCartCookieOptions(config).name ?? "ominity_cart_id")?.value,
        );
        const snapshot = mockUpdateCart({
          cartId: current.cart.id,
          ...(typeof parsedUpdate.data.country === "string"
            ? { country: parsedUpdate.data.country }
            : {}),
          ...(Array.isArray(parsedUpdate.data.promotionCodes)
            ? { promotionCodes: parsedUpdate.data.promotionCodes as ReadonlyArray<string> }
            : {}),
        });
        writeMockCartCookie(config, cookieStore, snapshot.cart.id);

        return Response.json({
          ...snapshot,
          mode: "mock",
        });
      }

      try {
        const language = await getLanguage(request);
        const refreshed = await updateCommerceCartAndRefresh({
          client: createRouteCommerceClient(config, language),
          cookies: cookieStore,
          cookieOptions: resolveCartCookieOptions(config),
          createCartData: await resolveCreateCartData(config, request),
          cartInclude: CART_INCLUDE,
          itemsInclude: CART_ITEMS_INCLUDE,
          data: parsedUpdate.data,
        });

        return Response.json(refreshed);
      } catch (error) {
        return jsonError(500, "CART_UPDATE_FAILED", "Failed to update cart.", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  };
}

export function createOminityCommerceCartItemsRouteHandlers(
  config: OminityCommerceRouteHandlerConfig,
): {
  readonly POST: (request: Request) => Promise<Response>;
} {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return {
    async POST(request: Request): Promise<Response> {
      let payload: unknown;
      try {
        payload = await parseJsonBody(request);
      } catch {
        return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
      }

      const record = asObjectRecord(payload);
      if (!record) {
        return jsonError(400, "INVALID_PAYLOAD", "Request body must be an object.");
      }

      const productId = normalizeProductId(record.productId);
      const quantity = normalizeQuantity(record.quantity);
      if (productId === null) {
        return jsonError(400, "INVALID_PRODUCT_ID", "A non-empty productId is required.");
      }

      const cookieStore = await loadNextCookiesStore();

      if (config.useMockData) {
        const current = mockGetOrCreateCart(
          cookieStore.get(resolveCartCookieOptions(config).name ?? "ominity_cart_id")?.value,
        );
        const snapshot = mockAddCartItem({
          cartId: current.cart.id,
          productId: String(productId),
          quantity,
          ...(typeof record.sku === "string" ? { sku: record.sku } : {}),
          ...(typeof record.title === "string" ? { title: record.title } : {}),
          ...(typeof record.unitPrice === "number" ? { unitPrice: record.unitPrice } : {}),
          ...(typeof record.currency === "string" ? { currency: record.currency } : {}),
          ...(typeof record.imageUrl === "string" ? { imageUrl: record.imageUrl } : {}),
        });
        writeMockCartCookie(config, cookieStore, snapshot.cart.id);

        return Response.json({
          ...snapshot,
          mode: "mock",
        });
      }

      try {
        const language = await getLanguage(request);
        const refreshed = await createCommerceCartItemAndRefresh({
          client: createRouteCommerceClient(config, language),
          cookies: cookieStore,
          cookieOptions: resolveCartCookieOptions(config),
          createCartData: await resolveCreateCartData(config, request),
          cartInclude: CART_INCLUDE,
          itemsInclude: CART_ITEMS_INCLUDE,
          productId: String(productId),
          quantity,
        });

        return Response.json(refreshed);
      } catch (error) {
        return jsonError(500, "CART_ITEM_CREATE_FAILED", "Failed to add item to cart.", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  };
}

export function createOminityCommerceCartItemRouteHandlers(
  config: OminityCommerceRouteHandlerConfig,
): {
  readonly PATCH: (request: Request, context: ItemRouteContext) => Promise<Response>;
  readonly DELETE: (request: Request, context: ItemRouteContext) => Promise<Response>;
} {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return {
    async PATCH(request: Request, context: ItemRouteContext): Promise<Response> {
      const { itemId } = await context.params;
      if (!itemId || itemId.trim().length === 0) {
        return jsonError(400, "INVALID_ITEM_ID", "A valid cart item id is required.");
      }

      let payload: unknown;
      try {
        payload = await parseJsonBody(request);
      } catch {
        return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
      }

      const record = asObjectRecord(payload);
      if (!record) {
        return jsonError(400, "INVALID_PAYLOAD", "Request body must be an object.");
      }

      const quantity = parseQuantity(record.quantity);
      const hasData = asObjectRecord(record.data) !== null;
      if (quantity === null && !hasData) {
        return jsonError(400, "INVALID_UPDATE", "Provide `quantity` or a `data` object.");
      }

      const cookieStore = await loadNextCookiesStore();

      if (config.useMockData) {
        const current = mockGetOrCreateCart(
          cookieStore.get(resolveCartCookieOptions(config).name ?? "ominity_cart_id")?.value,
        );
        const snapshot = quantity === null
          ? current
          : mockUpdateCartItem({
            cartId: current.cart.id,
            itemId,
            quantity,
          });
        writeMockCartCookie(config, cookieStore, snapshot.cart.id);

        return Response.json({
          ...snapshot,
          mode: "mock",
        });
      }

      try {
        const language = await getLanguage(request);
        const refreshed = quantity !== null
          ? await setCommerceCartItemQuantityAndRefresh({
            client: createRouteCommerceClient(config, language),
            cookies: cookieStore,
            cookieOptions: resolveCartCookieOptions(config),
            createCartData: await resolveCreateCartData(config, request),
            cartInclude: CART_INCLUDE,
            itemsInclude: CART_ITEMS_INCLUDE,
            itemId,
            quantity,
          })
          : await updateCommerceCartItemAndRefresh({
            client: createRouteCommerceClient(config, language),
            cookies: cookieStore,
            cookieOptions: resolveCartCookieOptions(config),
            createCartData: await resolveCreateCartData(config, request),
            cartInclude: CART_INCLUDE,
            itemsInclude: CART_ITEMS_INCLUDE,
            itemId,
            data: record.data as Record<string, unknown>,
          });

        return Response.json(refreshed);
      } catch (error) {
        return jsonError(500, "CART_ITEM_UPDATE_FAILED", "Failed to update cart item.", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },

    async DELETE(request: Request, context: ItemRouteContext): Promise<Response> {
      const { itemId } = await context.params;
      if (!itemId || itemId.trim().length === 0) {
        return jsonError(400, "INVALID_ITEM_ID", "A valid cart item id is required.");
      }

      const cookieStore = await loadNextCookiesStore();

      if (config.useMockData) {
        const current = mockGetOrCreateCart(
          cookieStore.get(resolveCartCookieOptions(config).name ?? "ominity_cart_id")?.value,
        );
        const snapshot = mockDeleteCartItem({
          cartId: current.cart.id,
          itemId,
        });
        writeMockCartCookie(config, cookieStore, snapshot.cart.id);

        return Response.json({
          ...snapshot,
          mode: "mock",
        });
      }

      try {
        const language = await getLanguage(request);
        const refreshed = await deleteCommerceCartItemAndRefresh({
          client: createRouteCommerceClient(config, language),
          cookies: cookieStore,
          cookieOptions: resolveCartCookieOptions(config),
          createCartData: await resolveCreateCartData(config, request),
          cartInclude: CART_INCLUDE,
          itemsInclude: CART_ITEMS_INCLUDE,
          itemId,
        });

        return Response.json(refreshed);
      } catch (error) {
        return jsonError(500, "CART_ITEM_DELETE_FAILED", "Failed to delete cart item.", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  };
}

export function createOminityCommerceCheckoutRouteHandlers(
  config: OminityCommerceRouteHandlerConfig,
): {
  readonly POST: (request: Request) => Promise<Response>;
} {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return {
    async POST(request: Request): Promise<Response> {
      let payload: unknown;
      try {
        payload = await parseJsonBody(request);
      } catch {
        return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
      }

      const record = asObjectRecord(payload);
      if (!record) {
        return jsonError(400, "INVALID_PAYLOAD", "Request body must be an object.");
      }

      const cookieStore = await loadNextCookiesStore();

      if (config.useMockData) {
        const snapshot = mockGetOrCreateCart(
          cookieStore.get(resolveCartCookieOptions(config).name ?? "ominity_cart_id")?.value,
        );
        const order = mockCreateOrder({
          cartId: snapshot.cart.id,
        });
        writeMockCartCookie(config, cookieStore, snapshot.cart.id);

        return Response.json({
          order,
          mode: "mock",
        });
      }

      try {
        const language = await getLanguage(request);
        const client = createRouteCommerceClient(config, language);
        const snapshot = await getOrCreateCommerceCartSnapshot({
          client,
          cookies: cookieStore,
          cookieOptions: resolveCartCookieOptions(config),
          createCartData: await resolveCreateCartData(config, request),
          cartInclude: CART_INCLUDE,
          itemsInclude: CART_ITEMS_INCLUDE,
        });

        const orderData: Record<string, unknown> = asObjectRecord(record.orderData)
          ? { ...(record.orderData as Record<string, unknown>) }
          : {};

        orderData.cartId = asString(record.cartId) ?? snapshot.cart.id;

        const email = asString(record.email);
        if (email) {
          orderData.email = email;
        }

        const notes = asString(record.notes);
        if (notes) {
          orderData.notes = notes;
        }

        const companyName = asString(record.companyName);
        if (companyName) {
          orderData.companyName = companyName;
        }

        const companyVat = asString(record.companyVat);
        if (companyVat) {
          orderData.companyVat = companyVat;
        }

        const shippingMethodId = asString(record.shippingMethodId);
        if (shippingMethodId) {
          orderData.shippingMethodId = shippingMethodId;
        }

        if (asObjectRecord(record.billingAddress)) {
          orderData.billingAddress = record.billingAddress;
        }

        if (asObjectRecord(record.shippingAddress)) {
          orderData.shippingAddress = record.shippingAddress;
        }

        const promotionCodes = normalizeStringList(record.promotionCodes);
        if (promotionCodes) {
          orderData.promotionCodes = promotionCodes;
        }

        const order = await client.createOrder({
          data: orderData,
        });
        if (!order.id) {
          return jsonError(
            500,
            "ORDER_CREATE_FAILED",
            "Order created but response did not include an id.",
          );
        }

        return Response.json({
          order,
        });
      } catch (error) {
        return jsonError(500, "CHECKOUT_FAILED", "Failed to create order.", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  };
}

export function createOminityCommerceShippingMethodsRouteHandlers(
  config: OminityCommerceRouteHandlerConfig,
): {
  readonly GET: (request: Request) => Promise<Response>;
} {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return {
    async GET(request: Request): Promise<Response> {
      if (config.useMockData) {
        return Response.json({
          items: [{
            id: "standard",
            name: "Standard Shipping",
          }, {
            id: "express",
            name: "Express Shipping",
          }],
          mode: "mock",
        });
      }

      try {
        const language = await getLanguage(request);
        const methods = await createRouteCommerceClient(config, language).listShippingMethods();

        return Response.json({
          items: methods,
        });
      } catch (error) {
        return jsonError(500, "SHIPPING_METHODS_FAILED", "Failed to load shipping methods.", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  };
}

export function createOminityCommercePaymentMethodsRouteHandlers(
  config: OminityCommerceRouteHandlerConfig,
): {
  readonly GET: (request: Request) => Promise<Response>;
} {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return {
    async GET(request: Request): Promise<Response> {
      if (config.useMockData) {
        return Response.json({
          items: [{
            resource: "paymentmethod",
            id: 1,
            label: "Card",
            gateway: "mock",
            method: "card",
            icon: "",
            isEnabled: true,
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            links: {
              self: {
                href: "https://mock.ominity.local/payment-methods/1",
                type: "application/hal+json",
              },
            },
          }],
          mode: "mock",
        });
      }

      try {
        const language = await getLanguage(request);
        const methods = await createRouteCommerceClient(config, language).listPaymentMethods({
          page: 1,
          limit: config.paymentMethodsLimit ?? 100,
        });

        return Response.json({
          items: methods,
        });
      } catch (error) {
        return jsonError(500, "PAYMENT_METHODS_FAILED", "Failed to load payment methods.", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  };
}

export function createOminityCommerceOrderRouteHandlers(
  config: OminityCommerceRouteHandlerConfig,
): {
  readonly GET: (request: Request, context: OrderRouteContext) => Promise<Response>;
} {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return {
    async GET(request: Request, context: OrderRouteContext): Promise<Response> {
      const { orderId } = await context.params;
      if (!orderId || orderId.trim().length === 0) {
        return jsonError(400, "INVALID_ORDER_ID", "A valid order id is required.");
      }

      if (config.useMockData) {
        const order = mockGetOrder(orderId);
        if (!order) {
          return jsonError(404, "ORDER_NOT_FOUND", "Order was not found.");
        }

        return Response.json({
          order,
          mode: "mock",
        });
      }

      try {
        const language = await getLanguage(request);
        const order = await createRouteCommerceClient(config, language).getOrder({
          id: orderId,
        });
        if (!order) {
          return jsonError(404, "ORDER_NOT_FOUND", "Order was not found.");
        }

        return Response.json({
          order,
        });
      } catch {
        return jsonError(404, "ORDER_NOT_FOUND", "Order was not found.");
      }
    },
  };
}

export function createOminityCommerceOrderPaymentsRouteHandlers(
  config: OminityCommerceRouteHandlerConfig,
): {
  readonly GET: (request: Request, context: OrderRouteContext) => Promise<Response>;
} {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return {
    async GET(request: Request, context: OrderRouteContext): Promise<Response> {
      const { orderId } = await context.params;
      if (!orderId || orderId.trim().length === 0) {
        return jsonError(400, "INVALID_ORDER_ID", "A valid order id is required.");
      }

      if (config.useMockData) {
        return Response.json({
          items: mockListOrderPayments(orderId),
          mode: "mock",
        });
      }

      try {
        const language = await getLanguage(request);
        const payments = await createRouteCommerceClient(config, language).listOrderPayments({
          orderId,
        });

        return Response.json({
          items: payments,
        });
      } catch (error) {
        return jsonError(500, "ORDER_PAYMENTS_FAILED", "Failed to load order payments.", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  };
}

export function createOminityCommercePaymentRouteHandlers(
  config: OminityCommerceRouteHandlerConfig,
): {
  readonly GET: (request: Request, context: PaymentRouteContext) => Promise<Response>;
} {
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  return {
    async GET(request: Request, context: PaymentRouteContext): Promise<Response> {
      const { paymentId } = await context.params;
      if (!paymentId || paymentId.trim().length === 0) {
        return jsonError(400, "INVALID_PAYMENT_ID", "A valid payment id is required.");
      }

      if (config.useMockData) {
        const payment = mockGetPayment(paymentId);
        if (!payment) {
          return jsonError(404, "PAYMENT_NOT_FOUND", "Payment was not found.");
        }

        return Response.json({
          payment,
          mode: "mock",
        });
      }

      try {
        const language = await getLanguage(request);
        const payment = await createRouteCommerceClient(config, language).getPayment({
          id: paymentId,
        });
        if (!payment) {
          return jsonError(404, "PAYMENT_NOT_FOUND", "Payment was not found.");
        }

        return Response.json({
          payment,
        });
      } catch {
        return jsonError(404, "PAYMENT_NOT_FOUND", "Payment was not found.");
      }
    },
  };
}
