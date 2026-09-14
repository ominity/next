import { Ominity } from "@ominity/api-typescript";
import type { Paginated } from "@ominity/api-typescript/models";

import { CommerceClientError } from "../cms/errors.js";
import { createCommerceDebugLogger } from "./debug.js";
import type {
  CommerceClient,
  CommerceClientOptions,
  CommerceCreateCartInput,
  CommerceCreateCartItemInput,
  CommerceCreateOrderInput,
  CommerceCreateOrderPaymentInput,
  CommerceCreatePaymentInput,
  CommerceDeleteCartItemInput,
  CommerceEnsureCartInput,
  CommerceGetCartInput,
  CommerceGetOrderInput,
  CommerceGetOrderPaymentInput,
  CommerceGetPaymentInput,
  CommerceGetPaymentMethodInput,
  CommerceGetPaymentMethodIssuerInput,
  CommerceGetProductInput,
  CommerceGetProductOfferInput,
  CommerceGetShippingClassInput,
  CommerceGetShippingMethodInput,
  CommerceListCartItemsInput,
  CommerceListCartShippingMethodsInput,
  CommerceListCartsInput,
  CommerceListOrderPaymentsInput,
  CommerceListPaymentMethodIssuersInput,
  CommerceListPaymentMethodsInput,
  CommerceListProductOffersInput,
  CommerceListProductsInput,
  CommerceListShippingClassesInput,
  CommerceListShippingMethodsInput,
  CommerceUpdateCartInput,
  CommerceUpdateCartItemInput,
  CommerceVisitorIdResolver,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

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

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CommerceClientError(`${name} must be a positive integer.`, {
      details: { [name]: value },
    });
  }
  return value;
}

export function createCommerceClient(options: CommerceClientOptions): CommerceClient {
  const sdk = new Ominity(options.sdk);
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

    async listCartShippingMethods(input: CommerceListCartShippingMethodsInput) {
      debug.emit("debug", "Listing cart shipping methods", input);
      try {
        const payload = options.adapter?.listCartShippingMethods
          ? await options.adapter.listCartShippingMethods(input.cartId)
          : await sdk.commerce.carts.listShippingMethods({ cartId: input.cartId });
        return payload;
      } catch (error) {
        throw new CommerceClientError("Failed to list cart shipping methods.", {
          cause: error,
          details: { cartId: input.cartId },
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
          })
          : await sdk.commerce.cartItems.create(input.cartId, input.productId, quantity);

        return payload;
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

        return payload;
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

    async listProducts(input: CommerceListProductsInput = {}) {
      debug.emit("debug", "Listing products", input);
      try {
        const payload = options.adapter?.listProducts
          ? await options.adapter.listProducts(input)
          : await sdk.commerce.products.list({
            ...input,
            ...(input.filter ? { filter: input.filter as Record<string, any> } : {}),
          });
        return asListFromPayload(payload);
      } catch (error) {
        throw new CommerceClientError("Failed to list products.", { cause: error });
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

    async listProductOffers(input: CommerceListProductOffersInput) {
      debug.emit("debug", "Listing product offers", input);
      const { productId, ...list } = input;
      try {
        const payload = options.adapter?.listProductOffers
          ? await options.adapter.listProductOffers(input)
          : await sdk.commerce.products.listOffers({
            id: requirePositiveInteger(productId, "productId"),
            ...list,
            ...(list.filter ? { filter: list.filter as Record<string, any> } : {}),
          });
        return asListFromPayload(payload);
      } catch (error) {
        throw new CommerceClientError("Failed to list product offers.", {
          cause: error,
          details: { productId },
        });
      }
    },

    async getProductOffer(input: CommerceGetProductOfferInput) {
      debug.emit("debug", "Getting product offer", input);
      try {
        return options.adapter?.getProductOffer
          ? await options.adapter.getProductOffer(input)
          : await sdk.commerce.products.getOffer({
            productId: requirePositiveInteger(input.productId, "productId"),
            id: requirePositiveInteger(input.offerId, "offerId"),
          });
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw new CommerceClientError("Failed to get product offer.", {
          cause: error,
          details: { ...input },
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

    async getShippingMethod(input: CommerceGetShippingMethodInput) {
      debug.emit("debug", "Getting shipping method", input);
      try {
        return options.adapter?.getShippingMethod
          ? await options.adapter.getShippingMethod(input.id, {
            ...(input.include ? { include: input.include } : {}),
          })
          : await sdk.commerce.shippingMethods.get(input.id, {
            ...(input.include ? { include: input.include } : {}),
          });
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw new CommerceClientError("Failed to get shipping method.", {
          cause: error,
          details: { id: input.id },
        });
      }
    },

    async listShippingClasses(input: CommerceListShippingClassesInput = {}) {
      debug.emit("debug", "Listing shipping classes", input);
      try {
        const payload = options.adapter?.listShippingClasses
          ? await options.adapter.listShippingClasses(input)
          : await sdk.commerce.shippingClasses.list({
            ...input,
            ...(input.filter ? { filter: input.filter as Record<string, unknown> } : {}),
          });
        return asListFromPayload(payload);
      } catch (error) {
        throw new CommerceClientError("Failed to list shipping classes.", { cause: error });
      }
    },

    async getShippingClass(input: CommerceGetShippingClassInput) {
      debug.emit("debug", "Getting shipping class", input);
      try {
        return options.adapter?.getShippingClass
          ? await options.adapter.getShippingClass(input.id)
          : await sdk.commerce.shippingClasses.get({
            id: requirePositiveInteger(input.id, "shippingClassId"),
          });
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw new CommerceClientError("Failed to get shipping class.", {
          cause: error,
          details: { id: input.id },
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

    async getPaymentMethod(input: CommerceGetPaymentMethodInput) {
      debug.emit("debug", "Getting payment method", input);
      try {
        return options.adapter?.getPaymentMethod
          ? await options.adapter.getPaymentMethod(input.id)
          : await sdk.settings.paymentMethods.get({
            id: requirePositiveInteger(input.id, "paymentMethodId"),
          });
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw new CommerceClientError("Failed to get payment method.", {
          cause: error,
          details: { id: input.id },
        });
      }
    },

    async listPaymentMethodIssuers(input: CommerceListPaymentMethodIssuersInput) {
      debug.emit("debug", "Listing payment method issuers", input);
      try {
        const payload = options.adapter?.listPaymentMethodIssuers
          ? await options.adapter.listPaymentMethodIssuers(input)
          : await sdk.settings.paymentMethodIssuers.list({
            ...input,
            methodId: requirePositiveInteger(input.methodId, "methodId"),
            ...(input.filter ? { filter: input.filter as Record<string, unknown> } : {}),
          });
        return asListFromPayload(payload);
      } catch (error) {
        throw new CommerceClientError("Failed to list payment method issuers.", {
          cause: error,
          details: { methodId: input.methodId },
        });
      }
    },

    async getPaymentMethodIssuer(input: CommerceGetPaymentMethodIssuerInput) {
      debug.emit("debug", "Getting payment method issuer", input);
      try {
        return options.adapter?.getPaymentMethodIssuer
          ? await options.adapter.getPaymentMethodIssuer(input)
          : await sdk.settings.paymentMethodIssuers.get({
            methodId: requirePositiveInteger(input.methodId, "methodId"),
            id: requirePositiveInteger(input.id, "issuerId"),
          });
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw new CommerceClientError("Failed to get payment method issuer.", {
          cause: error,
          details: { ...input },
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

    async createOrderPayment(input: CommerceCreateOrderPaymentInput) {
      debug.emit("debug", "Creating order payment", input);
      try {
        return options.adapter?.createOrderPayment
          ? await options.adapter.createOrderPayment(input)
          : await sdk.commerce.orders.createPayment({
            orderId: input.orderId,
            data: input.data,
          }, input.requestOptions);
      } catch (error) {
        throw new CommerceClientError("Failed to create order payment.", {
          cause: error,
          details: { orderId: input.orderId },
        });
      }
    },

    async getOrderPayment(input: CommerceGetOrderPaymentInput) {
      debug.emit("debug", "Getting order payment", input);
      try {
        return options.adapter?.getOrderPayment
          ? await options.adapter.getOrderPayment(input)
          : await sdk.commerce.orders.getPayment({
            orderId: input.orderId,
            id: requirePositiveInteger(input.id, "paymentId"),
          });
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw new CommerceClientError("Failed to get order payment.", {
          cause: error,
          details: { ...input },
        });
      }
    },

    async createPayment(input: CommerceCreatePaymentInput) {
      debug.emit("debug", "Creating payment", input);
      try {
        return options.adapter?.createPayment
          ? await options.adapter.createPayment(input)
          : await sdk.commerce.payments.create({
            ...(input.include ? { include: input.include } : {}),
            data: input.data,
          }, input.requestOptions);
      } catch (error) {
        throw new CommerceClientError("Failed to create payment.", { cause: error });
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
