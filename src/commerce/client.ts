import { Ominity } from "@ominity/api-typescript";
import type { Paginated } from "@ominity/api-typescript/models";

import { CommerceClientError } from "../cms/errors.js";
import { createCommerceDebugLogger } from "./debug.js";
import type {
  CommerceCart,
  CommerceCartItem,
  CommerceClient,
  CommerceClientOptions,
  CommerceCreateCartInput,
  CommerceCreateCartItemInput,
  CommerceCreateOrderInput,
  CommerceDeleteCartItemInput,
  CommerceEnsureCartInput,
  CommerceGetCartInput,
  CommerceGetOrderInput,
  CommerceGetPaymentInput,
  CommerceGetProductInput,
  CommerceListCartItemsInput,
  CommerceListCartsInput,
  CommerceListOrderPaymentsInput,
  CommerceListPaymentMethodsInput,
  CommercePayment,
  CommercePaymentMethod,
  CommerceProduct,
  CommerceShippingMethod,
  CommerceListShippingMethodsInput,
  CommerceUpdateCartInput,
  CommerceUpdateCartItemInput,
  CommerceVisitorIdResolver,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;
type HookContextLike = {
  options?: Record<string, unknown>;
};
type BeforeCreateRequestLike = (
  context: HookContextLike,
  input: unknown,
) => unknown;
type HooksLike = {
  beforeCreateRequest?: BeforeCreateRequestLike;
  __ominityContextOptionsPatched?: boolean;
};
type OminityWithInternals = Ominity & {
  _options?: Record<string, unknown> & {
    hooks?: HooksLike;
  };
};

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? value as UnknownRecord : {};
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveVisitorIdFieldName(fieldName: string | undefined): string {
  return asNonEmptyString(fieldName) ?? "visitorId";
}

function payloadHasVisitorId(payload: UnknownRecord, fieldName: string): boolean {
  return typeof asNonEmptyString(payload[fieldName]) === "string";
}

async function resolveVisitorId(
  resolver: CommerceVisitorIdResolver | undefined,
): Promise<string | undefined> {
  if (!resolver) {
    return;
  }

  return asNonEmptyString(await resolver());
}

async function withResolvedVisitorId(
  payload: Readonly<Record<string, unknown>> | undefined,
  fieldName: string,
  resolver: CommerceVisitorIdResolver | undefined,
): Promise<Readonly<Record<string, unknown>>> {
  const normalizedPayload: UnknownRecord = {
    ...asRecord(payload),
  };

  if (payloadHasVisitorId(normalizedPayload, fieldName)) {
    return normalizedPayload;
  }

  const visitorId = await resolveVisitorId(resolver);
  if (!visitorId) {
    return normalizedPayload;
  }

  normalizedPayload[fieldName] = visitorId;
  return normalizedPayload;
}

function patchHookContextOptions(sdk: Ominity): Ominity {
  const sdkWithInternals = sdk as OminityWithInternals;
  const hooks = sdkWithInternals._options?.hooks;
  if (!hooks || typeof hooks.beforeCreateRequest !== "function") {
    return sdk;
  }

  if (hooks.__ominityContextOptionsPatched === true) {
    return sdk;
  }

  const original = hooks.beforeCreateRequest.bind(hooks) as (
    context: HookContextLike,
    input: unknown,
  ) => unknown;
  (hooks as unknown as { beforeCreateRequest: BeforeCreateRequestLike }).beforeCreateRequest = ((
    context: HookContextLike,
    input: unknown,
  ) => {
    const contextOptions = typeof context?.options === "object" && context.options !== null
      ? context.options
      : {};

    const mergedContext: HookContextLike = {
      ...(context ?? {}),
      options: {
        ...(sdkWithInternals._options ?? {}),
        ...contextOptions,
      },
    };

    return original(mergedContext, input);
  }) as BeforeCreateRequestLike;

  hooks.__ominityContextOptionsPatched = true;
  return sdk;
}

function asListFromPayload<T>(
  payload: Paginated<T> | ReadonlyArray<T>,
): ReadonlyArray<T> {
  if (Array.isArray(payload)) {
    return payload;
  }

  const paginated = payload as Paginated<T>;
  if (Array.isArray(paginated.items)) {
    return paginated.items;
  }

  return [];
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as Record<string, unknown>;
  const status = candidate.statusCode ?? candidate.status ?? candidate.code;
  return status === 404 || status === "404";
}

function asPositiveQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) {
    return 1;
  }

  const normalized = Math.floor(quantity);
  return normalized > 0 ? normalized : 1;
}

function normalizeProductIdValue(productId: string): string | number {
  const trimmed = productId.trim();
  const numericId = Number.parseInt(trimmed, 10);
  if (Number.isFinite(numericId) && `${numericId}` === trimmed) {
    return numericId;
  }

  return trimmed;
}

function normalizeCreateCartItemPayload(
  productId: string,
  quantity: number,
  data: unknown,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...asRecord(data),
  };
  payload.productId = normalizeProductIdValue(productId);
  payload.quantity = quantity;

  delete payload.product_id;
  delete payload.cartId;
  delete payload.data;

  return payload;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return true;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("json")) {
    return response.json();
  }

  return response.text();
}

function asTypedRecord<T>(value: unknown): T {
  return value as T;
}

export function createCommerceClient(options: CommerceClientOptions): CommerceClient {
  const sdk = patchHookContextOptions(new Ominity(options.sdk));
  const debug = createCommerceDebugLogger(options.debug, "commerce-client");
  const visitorIdResolver = options.visitorIdResolver;
  const visitorIdFieldName = resolveVisitorIdFieldName(options.visitorIdFieldName);

  return {
    async listCarts(input: CommerceListCartsInput = {}) {
      debug.emit("debug", "Listing carts", input);

      const payload = options.adapter?.listCarts
        ? await options.adapter.listCarts({
          ...(typeof input.include === "string" ? { include: input.include } : {}),
          ...(typeof input.filter === "object" && input.filter !== null ? { filter: input.filter } : {}),
        })
        : await sdk.commerce.carts.list({
          ...(typeof input.include === "string" ? { include: input.include } : {}),
          ...(typeof input.filter === "object" && input.filter !== null ? { filter: input.filter } : {}),
        });

      return asListFromPayload(payload);
    },

    async createCart(input: CommerceCreateCartInput = {}) {
      debug.emit("debug", "Creating cart", input);
      const cartData = await withResolvedVisitorId(
        input.data,
        visitorIdFieldName,
        visitorIdResolver,
      );

      const payload = options.adapter?.createCart
        ? await options.adapter.createCart(cartData)
        : await sdk.commerce.carts.create(cartData);

      return payload;
    },

    async getCart(input: CommerceGetCartInput) {
      debug.emit("debug", "Getting cart", input);

      try {
        const payload = options.adapter?.getCart
          ? await options.adapter.getCart(input.cartId, {
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          })
          : await sdk.commerce.carts.get(input.cartId, {
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          });

        return payload;
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw new CommerceClientError("Failed to fetch cart.", {
          cause: error,
          details: {
            cartId: input.cartId,
          },
        });
      }
    },

    async updateCart(input: CommerceUpdateCartInput) {
      debug.emit("debug", "Updating cart", input);

      try {
        const updateData = await withResolvedVisitorId(
          input.data,
          visitorIdFieldName,
          visitorIdResolver,
        );
        const payload = options.adapter?.updateCart
          ? await options.adapter.updateCart(input.cartId, updateData)
          : await sdk.commerce.carts.update(input.cartId, updateData as Record<string, any>);

        return payload;
      } catch (error) {
        throw new CommerceClientError("Failed to update cart.", {
          cause: error,
          details: {
            cartId: input.cartId,
          },
        });
      }
    },

    async ensureCart(input: CommerceEnsureCartInput = {}) {
      if (typeof input.cartId === "string" && input.cartId.length > 0) {
        const existing = await this.getCart({
          cartId: input.cartId,
          ...(typeof input.include === "string" ? { include: input.include } : {}),
        });

        if (existing) {
          return existing;
        }
      }

      return this.createCart({
        ...(typeof input.createData === "object" && input.createData !== null
          ? { data: input.createData }
          : {}),
      });
    },

    async listCartItems(input: CommerceListCartItemsInput) {
      debug.emit("debug", "Listing cart items", input);

      try {
        const payload = options.adapter?.listCartItems
          ? await options.adapter.listCartItems(input.cartId, {
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          })
          : await sdk.commerce.cartItems.list(input.cartId, {
            cartId: input.cartId,
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          });

        return asListFromPayload(payload);
      } catch (error) {
        throw new CommerceClientError("Failed to list cart items.", {
          cause: error,
          details: {
            cartId: input.cartId,
          },
        });
      }
    },

    async createCartItem(input: CommerceCreateCartItemInput) {
      debug.emit("debug", "Creating cart item", input);

      const quantity = asPositiveQuantity(input.quantity);
      try {
        const payload = options.adapter?.createCartItem
          ? await options.adapter.createCartItem(input.cartId, {
            productId: input.productId,
            quantity,
            ...(typeof input.data === "object" && input.data !== null ? input.data : {}),
          })
          : await (async () => {
            const response = await sdk.http.post(
              `/commerce/carts/${encodeURIComponent(input.cartId)}/items`,
              {
                json: normalizeCreateCartItemPayload(input.productId, quantity, input.data),
              },
            );
            return parseResponseBody(response);
          })();

        return asTypedRecord<CommerceCartItem>(payload);
      } catch (error) {
        throw new CommerceClientError("Failed to create cart item.", {
          cause: error,
          details: {
            cartId: input.cartId,
            productId: input.productId,
            quantity,
          },
        });
      }
    },

    async updateCartItem(input: CommerceUpdateCartItemInput) {
      debug.emit("debug", "Updating cart item", input);

      try {
        const payload = options.adapter?.updateCartItem
          ? await options.adapter.updateCartItem(input.cartId, input.itemId, input.data)
          : await (async () => {
            const response = await sdk.http.patch(
              `/commerce/carts/${encodeURIComponent(input.cartId)}/items/${encodeURIComponent(input.itemId)}`,
              {
                json: input.data as Record<string, unknown>,
              },
            );
            return parseResponseBody(response);
          })();

        return asTypedRecord<CommerceCartItem>(payload);
      } catch (error) {
        throw new CommerceClientError("Failed to update cart item.", {
          cause: error,
          details: {
            cartId: input.cartId,
            itemId: input.itemId,
          },
        });
      }
    },

    async deleteCartItem(input: CommerceDeleteCartItemInput) {
      debug.emit("debug", "Deleting cart item", input);

      try {
        const payload = options.adapter?.deleteCartItem
          ? await options.adapter.deleteCartItem(input.cartId, input.itemId)
          : await sdk.commerce.cartItems.delete(input.cartId, input.itemId);

        return payload === true;
      } catch (error) {
        throw new CommerceClientError("Failed to delete cart item.", {
          cause: error,
          details: {
            cartId: input.cartId,
            itemId: input.itemId,
          },
        });
      }
    },

    async getProduct(input: CommerceGetProductInput) {
      debug.emit("debug", "Getting product", input);

      const numericId = Number.parseInt(input.id, 10);
      if (!Number.isFinite(numericId) || numericId <= 0) {
        throw new CommerceClientError("Product id must be a positive numeric string.", {
          details: {
            id: input.id,
          },
        });
      }

      try {
        const payload = options.adapter?.getProduct
          ? await options.adapter.getProduct(input.id, {
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          })
          : await sdk.commerce.products.get({
            id: numericId,
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          });

        return payload;
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw new CommerceClientError("Failed to get product.", {
          cause: error,
          details: {
            productId: input.id,
          },
        });
      }
    },

    async listShippingMethods(input: CommerceListShippingMethodsInput = {}) {
      debug.emit("debug", "Listing shipping methods", input);

      try {
        const payload = options.adapter?.listShippingMethods
          ? await options.adapter.listShippingMethods({
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          })
          : await sdk.commerce.shippingMethods.list({
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          });

        return asListFromPayload(payload);
      } catch (error) {
        throw new CommerceClientError("Failed to list shipping methods.", {
          cause: error,
        });
      }
    },

    async listPaymentMethods(input: CommerceListPaymentMethodsInput = {}) {
      debug.emit("debug", "Listing payment methods", input);

      try {
        const payload = options.adapter?.listPaymentMethods
          ? await options.adapter.listPaymentMethods({
            ...(typeof input.page === "number" ? { page: input.page } : {}),
            ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
          })
          : await sdk.settings.paymentMethods.list({
            ...(typeof input.page === "number" ? { page: input.page } : {}),
            ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
          });

        return asListFromPayload(payload);
      } catch (error) {
        throw new CommerceClientError("Failed to list payment methods.", {
          cause: error,
        });
      }
    },

    async createOrder(input: CommerceCreateOrderInput) {
      debug.emit("debug", "Creating order", input);

      try {
        const orderData = await withResolvedVisitorId(
          input.data,
          visitorIdFieldName,
          visitorIdResolver,
        );
        const payload = options.adapter?.createOrder
          ? await options.adapter.createOrder(orderData)
          : await sdk.commerce.orders.create(orderData as Record<string, any>);

        return payload;
      } catch (error) {
        throw new CommerceClientError("Failed to create order.", {
          cause: error,
          details: {
            data: input.data,
          },
        });
      }
    },

    async getOrder(input: CommerceGetOrderInput) {
      debug.emit("debug", "Getting order", input);

      try {
        const payload = options.adapter?.getOrder
          ? await options.adapter.getOrder(input.id, {
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          })
          : await sdk.commerce.orders.get(input.id, {
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          });

        return payload;
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw new CommerceClientError("Failed to get order.", {
          cause: error,
          details: {
            id: input.id,
          },
        });
      }
    },

    async listOrderPayments(input: CommerceListOrderPaymentsInput) {
      debug.emit("debug", "Listing order payments", input);

      try {
        const payload = options.adapter?.listOrderPayments
          ? await options.adapter.listOrderPayments(input.orderId)
          : await sdk.commerce.orders.listPayments(input.orderId);

        return asListFromPayload(payload);
      } catch (error) {
        throw new CommerceClientError("Failed to list order payments.", {
          cause: error,
          details: {
            orderId: input.orderId,
          },
        });
      }
    },

    async getPayment(input: CommerceGetPaymentInput) {
      debug.emit("debug", "Getting payment", input);

      try {
        const payload = options.adapter?.getPayment
          ? await options.adapter.getPayment(input.id, {
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          })
          : await sdk.commerce.payments.get(input.id, {
            ...(typeof input.include === "string" ? { include: input.include } : {}),
          });

        return payload;
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw new CommerceClientError("Failed to get payment.", {
          cause: error,
          details: {
            id: input.id,
          },
        });
      }
    },
  };
}

export function cartIdFromCommerceCart(raw: unknown): string | undefined {
  const record = asRecord(raw);
  if (typeof record.id === "string" && record.id.length > 0) {
    return record.id;
  }

  if (typeof record.id === "number" && Number.isFinite(record.id)) {
    return `${record.id}`;
  }

  return undefined;
}
