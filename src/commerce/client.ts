import { Ominity } from "@ominity/api-typescript";

import { CommerceClientError } from "../cms/errors.js";
import { createCommerceDebugLogger } from "./debug.js";
import {
  normalizeCommerceCart,
  normalizeCommerceCartItem,
  normalizeCommerceCartItemList,
  normalizeCommerceCartList,
  normalizeCommerceOrder,
  normalizeCommercePayment,
  normalizeCommercePaymentList,
  normalizeCommercePaymentMethodList,
  normalizeCommerceProduct,
  normalizeCommerceShippingMethodList,
} from "./normalize.js";
import type {
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
  CommerceListShippingMethodsInput,
  CommerceUpdateCartInput,
  CommerceUpdateCartItemInput,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? value as UnknownRecord : {};
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

export function createCommerceClient(options: CommerceClientOptions): CommerceClient {
  const sdk = new Ominity(options.sdk);
  const debug = createCommerceDebugLogger(options.debug, "commerce-client");

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

      return normalizeCommerceCartList(payload);
    },

    async createCart(input: CommerceCreateCartInput = {}) {
      debug.emit("debug", "Creating cart", input);

      const payload = options.adapter?.createCart
        ? await options.adapter.createCart(input.data ?? {})
        : await sdk.commerce.carts.create(input.data ?? {});

      return normalizeCommerceCart(payload);
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

        return normalizeCommerceCart(payload);
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
        const payload = options.adapter?.updateCart
          ? await options.adapter.updateCart(input.cartId, input.data)
          : await sdk.commerce.carts.update(input.cartId, input.data as Record<string, any>);

        return normalizeCommerceCart(payload);
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

        return normalizeCommerceCartItemList(payload);
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
          : await sdk.commerce.cartItems.create(input.cartId, input.productId, quantity);

        return normalizeCommerceCartItem(payload);
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
          : await sdk.commerce.cartItems.update(
            input.cartId,
            input.itemId,
            input.data as Record<string, any>,
          );

        return normalizeCommerceCartItem(payload);
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

        return normalizeCommerceProduct(payload);
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

        return normalizeCommerceShippingMethodList(payload);
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

        return normalizeCommercePaymentMethodList(payload);
      } catch (error) {
        throw new CommerceClientError("Failed to list payment methods.", {
          cause: error,
        });
      }
    },

    async createOrder(input: CommerceCreateOrderInput) {
      debug.emit("debug", "Creating order", input);

      try {
        const payload = options.adapter?.createOrder
          ? await options.adapter.createOrder(input.data)
          : await sdk.commerce.orders.create(input.data as Record<string, any>);

        return normalizeCommerceOrder(payload);
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

        return normalizeCommerceOrder(payload);
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

        return normalizeCommercePaymentList(payload);
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

        return normalizeCommercePayment(payload);
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
