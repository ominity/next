"use client";

import type { Cart } from "@ominity/api-typescript/models/commerce/cart";
import type { CartItem } from "@ominity/api-typescript/models/commerce/cart-item";
import type { Order } from "@ominity/api-typescript/models/commerce/order";
import type { Payment } from "@ominity/api-typescript/models/commerce/payment";
import type { Product } from "@ominity/api-typescript/models/commerce/product";
import type { ProductOffer } from "@ominity/api-typescript/models/commerce/product-offer";
import type { CreateOrderPaymentRequest } from "@ominity/api-typescript/models/operations";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useOminityDebugCapability } from "../debug/context.js";
import type { OminityDebugCommerceInfo } from "../debug/types.js";
import { emitCommerceEvent } from "./events.js";
import {
  commerceCartCount,
  commerceCartCurrency,
  commerceCartDiscount,
  commerceCartItemId,
  commerceCartItemProductId,
  commerceCartItemQuantity,
  commerceCartItemSku,
  commerceCartItemTitle,
  commerceCartShipping,
  commerceCartSubtotal,
  commerceCartTax,
  commerceCartTotal,
  commerceMoneyValue,
  commerceOrderCurrency,
  commerceOrderId,
  commerceOrderTotal,
} from "./model-helpers.js";
import { resolveCommerceProductPrice } from "./pricing.js";

export interface CommerceProductSelection {
  readonly product: Product;
  readonly offers: ReadonlyArray<ProductOffer>;
  readonly canonicalPath?: string;
  readonly preferredCurrency?: string;
}

export type CommerceWishlistItem = CommerceProductSelection;

export type CommerceCreateOrderInput = Partial<Pick<
  Cart,
  | "email"
  | "companyName"
  | "companyVat"
  | "shippingMethodId"
  | "shippingAddress"
  | "billingAddress"
>> & {
  readonly notes?: string;
  readonly orderData?: Readonly<Record<string, unknown>>;
};

export interface CommerceReactEndpoints {
  readonly cart: string;
  readonly cartItems: string;
  readonly checkout: string;
  order(orderId: string): string;
  orderPayments(orderId: string): string;
}

export interface CommerceProviderProps {
  readonly children: ReactNode;
  readonly endpoints?: Partial<CommerceReactEndpoints>;
  readonly wishlistStorageKey?: string;
}

export interface CommerceContextValue {
  readonly ready: boolean;
  readonly cartResource: Cart | null;
  readonly cart: ReadonlyArray<CartItem>;
  readonly cartCountry: string | undefined;
  readonly cartCurrency: string | undefined;
  readonly promotionCodes: ReadonlyArray<string>;
  readonly wishlist: ReadonlyArray<CommerceWishlistItem>;
  readonly cartCount: number;
  readonly cartSubtotal: number;
  readonly cartShipping: number;
  readonly cartDiscount: number;
  readonly cartTax: number;
  readonly cartTotal: number;
  refreshCart(): Promise<void>;
  setCartCountry(country: string): Promise<void>;
  applyPromotionCode(code: string): Promise<void>;
  removePromotionCode(code: string): Promise<void>;
  addToCart(selection: CommerceProductSelection, quantity?: number): Promise<void>;
  removeFromCart(itemId: string): Promise<void>;
  setCartQuantity(itemId: string, quantity: number): Promise<void>;
  clearCart(): Promise<void>;
  toggleWishlist(selection: CommerceProductSelection): void;
  removeFromWishlist(productId: string): void;
  isWishlisted(productId: string): boolean;
  createOrder(input?: CommerceCreateOrderInput): Promise<Order | null>;
  getOrderById(orderId: string): Promise<Order | null>;
  listOrderPayments(orderId: string): Promise<ReadonlyArray<Payment>>;
  createOrderPayment(
    orderId: string,
    data: CreateOrderPaymentRequest["data"],
    options?: { readonly idempotencyKey?: string },
  ): Promise<Payment | null>;
}

interface CartSnapshotResponse {
  readonly cart?: Cart;
  readonly items?: ReadonlyArray<CartItem>;
}

const DEFAULT_ENDPOINTS: CommerceReactEndpoints = {
  cart: "/api/commerce/cart",
  cartItems: "/api/commerce/cart/items",
  checkout: "/api/commerce/checkout",
  order: (orderId) => `/api/commerce/orders/${encodeURIComponent(orderId)}`,
  orderPayments: (orderId) => `/api/commerce/orders/${encodeURIComponent(orderId)}/payments`,
};

const CommerceContext = createContext<CommerceContextValue | null>(null);

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // The status-based error remains useful when a response has no JSON body.
  }

  if (!response.ok) {
    const message = typeof payload === "object"
      && payload !== null
      && typeof (payload as { error?: unknown }).error === "string"
      ? (payload as { error: string }).error
      : `Request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload as T;
}

function readWishlist(key: string): ReadonlyArray<CommerceWishlistItem> {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as ReadonlyArray<CommerceWishlistItem> : [];
  } catch {
    return [];
  }
}

function productId(selection: CommerceProductSelection): string {
  return String(selection.product.id);
}

function productEventFields(selection: CommerceProductSelection) {
  const price = resolveCommerceProductPrice({
    offers: selection.offers,
    ...(selection.preferredCurrency ? { preferredCurrency: selection.preferredCurrency } : {}),
  });
  const unitPrice = commerceMoneyValue(price);

  return {
    productId: productId(selection),
    sku: selection.product.sku,
    title: selection.product.title,
    ...(typeof unitPrice === "number" ? { unitPrice } : {}),
    ...(price ? { currency: price.currency } : {}),
    ...(selection.canonicalPath ? { canonicalPath: selection.canonicalPath } : {}),
  };
}

function positiveQuantity(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 1;
}

export function OminityCommerceProvider(props: CommerceProviderProps) {
  const endpoints = useMemo<CommerceReactEndpoints>(() => ({
    ...DEFAULT_ENDPOINTS,
    ...props.endpoints,
  }), [props.endpoints]);
  const storageKey = props.wishlistStorageKey ?? "ominity:commerce:wishlist";
  const [ready, setReady] = useState(false);
  const [cartResource, setCartResource] = useState<Cart | null>(null);
  const [items, setItems] = useState<ReadonlyArray<CartItem>>([]);
  const [wishlist, setWishlist] = useState<ReadonlyArray<CommerceWishlistItem>>([]);

  const syncSnapshot = useCallback((snapshot: CartSnapshotResponse) => {
    setCartResource(snapshot.cart ?? null);
    setItems(snapshot.items ?? []);
  }, []);

  const refreshCart = useCallback(async () => {
    syncSnapshot(await requestJson<CartSnapshotResponse>(endpoints.cart));
  }, [endpoints.cart, syncSnapshot]);

  useEffect(() => {
    setWishlist(readWishlist(storageKey));
    void refreshCart()
      .catch(() => syncSnapshot({}))
      .finally(() => setReady(true));
  }, [refreshCart, storageKey, syncSnapshot]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(wishlist));
    } catch {
      // Storage can be disabled; the in-memory wishlist remains usable.
    }
  }, [ready, storageKey, wishlist]);

  const patchCart = useCallback(async (data: Readonly<Record<string, unknown>>) => {
    const snapshot = await requestJson<CartSnapshotResponse>(endpoints.cart, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    syncSnapshot(snapshot);
    return snapshot;
  }, [endpoints.cart, syncSnapshot]);

  const setCartCountry = useCallback(async (country: string) => {
    const normalized = country.trim().toUpperCase();
    if (normalized.length === 2) {
      await patchCart({ country: normalized });
    }
  }, [patchCart]);

  const applyPromotionCode = useCallback(async (code: string) => {
    const normalized = code.trim();
    if (!normalized) {
      return;
    }

    const promotionCodes = Array.from(new Set([...(cartResource?.promotionCodes ?? []), normalized]));
    const snapshot = await patchCart({ promotionCodes });
    emitCommerceEvent("promotion_code_applied", {
      code: normalized,
      promotionCodes: snapshot.cart?.promotionCodes ?? [],
    });
  }, [cartResource?.promotionCodes, patchCart]);

  const removePromotionCode = useCallback(async (code: string) => {
    const normalized = code.trim();
    const snapshot = await patchCart({
      promotionCodes: (cartResource?.promotionCodes ?? []).filter((entry) => entry !== normalized),
    });
    emitCommerceEvent("promotion_code_removed", {
      code: normalized,
      promotionCodes: snapshot.cart?.promotionCodes ?? [],
    });
  }, [cartResource?.promotionCodes, patchCart]);

  const addToCart = useCallback(async (selection: CommerceProductSelection, quantity?: number) => {
    const normalizedQuantity = positiveQuantity(quantity);
    const snapshot = await requestJson<CartSnapshotResponse>(endpoints.cartItems, {
      method: "POST",
      body: JSON.stringify({ productId: productId(selection), quantity: normalizedQuantity }),
    });
    syncSnapshot(snapshot);
    emitCommerceEvent("cart_item_added", {
      ...productEventFields(selection),
      quantity: normalizedQuantity,
      ...(snapshot.cart ? {
        cartCount: commerceCartCount(snapshot.cart),
        cartSubtotal: commerceCartSubtotal(snapshot.cart),
        currency: commerceCartCurrency(snapshot.cart),
      } : {}),
    });
  }, [endpoints.cartItems, syncSnapshot]);

  const removeFromCart = useCallback(async (itemId: string) => {
    const previous = items.find((item) => commerceCartItemId(item) === itemId);
    const previousProductId = previous ? commerceCartItemProductId(previous) : undefined;
    const previousSku = previous ? commerceCartItemSku(previous) : undefined;
    const snapshot = await requestJson<CartSnapshotResponse>(`${endpoints.cartItems}/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
    syncSnapshot(snapshot);
    emitCommerceEvent("cart_item_removed", {
      itemId,
      ...(previous ? {
        ...(previousProductId ? { productId: previousProductId } : {}),
        ...(previousSku ? { sku: previousSku } : {}),
        title: commerceCartItemTitle(previous),
        quantity: commerceCartItemQuantity(previous),
      } : {}),
      ...(snapshot.cart ? {
        cartCount: commerceCartCount(snapshot.cart),
        cartSubtotal: commerceCartSubtotal(snapshot.cart),
        currency: commerceCartCurrency(snapshot.cart),
      } : {}),
    });
  }, [endpoints.cartItems, items, syncSnapshot]);

  const setCartQuantity = useCallback(async (itemId: string, quantity: number) => {
    const previous = items.find((item) => commerceCartItemId(item) === itemId);
    const previousProductId = previous ? commerceCartItemProductId(previous) : undefined;
    const snapshot = await requestJson<CartSnapshotResponse>(`${endpoints.cartItems}/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    });
    syncSnapshot(snapshot);
    emitCommerceEvent("cart_item_quantity_updated", {
      itemId,
      quantity,
      ...(previous ? {
        ...(previousProductId ? { productId: previousProductId } : {}),
        previousQuantity: commerceCartItemQuantity(previous),
      } : {}),
      ...(snapshot.cart ? {
        cartCount: commerceCartCount(snapshot.cart),
        cartSubtotal: commerceCartSubtotal(snapshot.cart),
        currency: commerceCartCurrency(snapshot.cart),
      } : {}),
    });
  }, [endpoints.cartItems, items, syncSnapshot]);

  const clearCart = useCallback(async () => {
    let snapshot: CartSnapshotResponse | null = null;
    for (const item of items) {
      const itemId = commerceCartItemId(item);
      if (itemId) {
        snapshot = await requestJson<CartSnapshotResponse>(`${endpoints.cartItems}/${encodeURIComponent(itemId)}`, {
          method: "DELETE",
        });
      }
    }
    syncSnapshot(snapshot ?? {
      ...(cartResource ? { cart: cartResource } : {}),
      items: [],
    });
  }, [cartResource, endpoints.cartItems, items, syncSnapshot]);

  const toggleWishlist = useCallback((selection: CommerceProductSelection) => {
    const id = productId(selection);
    if (wishlist.some((entry) => productId(entry) === id)) {
      setWishlist((current) => current.filter((entry) => productId(entry) !== id));
      emitCommerceEvent("wishlist_item_removed", { productId: id });
      return;
    }

    setWishlist((current) => [...current, selection]);
    emitCommerceEvent("wishlist_item_added", productEventFields(selection));
  }, [wishlist]);

  const removeFromWishlist = useCallback((id: string) => {
    setWishlist((current) => current.filter((entry) => productId(entry) !== id));
    emitCommerceEvent("wishlist_item_removed", { productId: id });
  }, []);

  const isWishlisted = useCallback((id: string) => {
    return wishlist.some((entry) => productId(entry) === id);
  }, [wishlist]);

  const createOrder = useCallback(async (input: CommerceCreateOrderInput = {}) => {
    const response = await requestJson<{ order?: Order }>(endpoints.checkout, {
      method: "POST",
      body: JSON.stringify(input),
    });
    const order = response.order ?? null;
    if (order) {
      emitCommerceEvent("checkout_completed", {
        orderId: commerceOrderId(order),
        orderNumber: order.number,
        total: commerceOrderTotal(order),
        currency: commerceOrderCurrency(order),
      });
    }
    await refreshCart();
    return order;
  }, [endpoints.checkout, refreshCart]);

  const getOrderById = useCallback(async (orderId: string) => {
    const response = await requestJson<{ order?: Order }>(endpoints.order(orderId));
    const order = response.order ?? null;
    if (order) {
      emitCommerceEvent("order_viewed", {
        orderId: commerceOrderId(order),
        status: order.status,
        total: commerceOrderTotal(order),
        currency: commerceOrderCurrency(order),
      });
    }
    return order;
  }, [endpoints]);

  const listOrderPayments = useCallback(async (orderId: string) => {
    const response = await requestJson<{ items?: ReadonlyArray<Payment> }>(endpoints.orderPayments(orderId));
    const payments = response.items ?? [];
    emitCommerceEvent("order_payments_viewed", { orderId, paymentsCount: payments.length });
    return payments;
  }, [endpoints]);

  const createOrderPayment = useCallback(async (
    orderId: string,
    data: CreateOrderPaymentRequest["data"],
    options: { readonly idempotencyKey?: string } = {},
  ) => {
    const response = await requestJson<{ readonly payment?: Payment }>(
      endpoints.orderPayments(orderId),
      {
        method: "POST",
        headers: options.idempotencyKey?.trim()
          ? { "Idempotency-Key": options.idempotencyKey.trim() }
          : {},
        body: JSON.stringify(data),
      },
    );
    return response.payment ?? null;
  }, [endpoints]);

  const value = useMemo<CommerceContextValue>(() => ({
    ready,
    cartResource,
    cart: items,
    cartCountry: cartResource?.country,
    cartCurrency: cartResource ? commerceCartCurrency(cartResource) : undefined,
    promotionCodes: cartResource?.promotionCodes ?? [],
    wishlist,
    cartCount: cartResource ? commerceCartCount(cartResource) : 0,
    cartSubtotal: cartResource ? commerceCartSubtotal(cartResource) : 0,
    cartShipping: cartResource ? commerceCartShipping(cartResource) : 0,
    cartDiscount: cartResource ? commerceCartDiscount(cartResource) : 0,
    cartTax: cartResource ? commerceCartTax(cartResource) : 0,
    cartTotal: cartResource ? commerceCartTotal(cartResource) : 0,
    refreshCart,
    setCartCountry,
    applyPromotionCode,
    removePromotionCode,
    addToCart,
    removeFromCart,
    setCartQuantity,
    clearCart,
    toggleWishlist,
    removeFromWishlist,
    isWishlisted,
    createOrder,
    getOrderById,
    listOrderPayments,
    createOrderPayment,
  }), [
    addToCart, applyPromotionCode, cartResource, clearCart, createOrder, createOrderPayment, getOrderById,
    isWishlisted, items, listOrderPayments, ready, refreshCart, removeFromCart,
    removeFromWishlist, removePromotionCode, setCartCountry, setCartQuantity,
    toggleWishlist, wishlist,
  ]);

  const debugCommerce = useMemo<OminityDebugCommerceInfo>(() => ({
    enabled: true,
    ...(cartResource ? {
      cartId: cartResource.id,
      country: cartResource.country,
      currency: commerceCartCurrency(cartResource),
      cartItemCount: commerceCartCount(cartResource),
      subtotal: commerceCartSubtotal(cartResource),
      shipping: commerceCartShipping(cartResource),
      discount: commerceCartDiscount(cartResource),
      tax: commerceCartTax(cartResource),
      total: commerceCartTotal(cartResource),
    } : {}),
    promotionCodes: cartResource?.promotionCodes ?? [],
    products: items.map((item) => {
      const id = commerceCartItemProductId(item);
      const sku = commerceCartItemSku(item);
      const name = commerceCartItemTitle(item);

      return {
        ...(id ? { id } : {}),
        ...(sku ? { sku } : {}),
        ...(name ? { name } : {}),
      };
    }),
    details: {
      ready,
      endpoints,
      wishlistCount: wishlist.length,
      cartStatus: cartResource?.status,
      cartType: cartResource?.type,
      shippingMethodId: cartResource?.shippingMethodId,
      isShippingRequired: cartResource?.isShippingRequired,
      isTaxExempt: cartResource?.isTaxExempt,
    },
  }), [cartResource, endpoints, items, ready, wishlist.length]);
  useOminityDebugCapability("commerce", debugCommerce);

  return <CommerceContext.Provider value={value}>{props.children}</CommerceContext.Provider>;
}

export function useOminityCommerce(): CommerceContextValue {
  const value = useContext(CommerceContext);
  if (!value) {
    throw new Error("useOminityCommerce must be used inside OminityCommerceProvider.");
  }

  return value;
}
