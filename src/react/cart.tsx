"use client";

import type { Cart, CartItem, Product } from "@ominity/api-typescript/models";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { OminityActionError } from "../actions/client.js";
import { emitCommerceEvent } from "../commerce/events.js";
import { commerceMoneyCurrency, commerceMoneyValue } from "../commerce/model-helpers.js";
import { resolveCommerceProductPrice } from "../commerce/pricing.js";
import { toOminitySdkError } from "../sdk/errors.js";
import { useAuth } from "./auth.js";
import { requestRoute } from "./http.js";

/** Cart fields a shopper may set; owner, customer and tax fields are set by the server. */
export type OminityCartFields = Partial<Pick<
  Cart,
  "email" | "companyName" | "companyVat" | "billingAddress" | "shippingAddress" | "shippingMethodId" | "country" | "currency"
>>;

interface CartSnapshot {
  readonly cart: Cart | null;
  readonly items: ReadonlyArray<CartItem>;
}

export interface OminityCartContextValue {
  readonly ready: boolean;
  /** Null until the first item is added. */
  readonly cart: Cart | null;
  readonly items: ReadonlyArray<CartItem>;
  readonly count: number;
  /** Applied promotion codes; their effect is in `cart.discountAmount` and each item's `discountAmount`. */
  readonly promotionCodes: ReadonlyArray<string>;
  readonly pending: boolean;
  readonly error: OminityActionError | null;
  add(product: Product | number | string, quantity?: number): Promise<void>;
  setQuantity(itemId: string, quantity: number): Promise<void>;
  remove(itemId: string): Promise<void>;
  /** Starts a new, empty cart. */
  clear(): Promise<void>;
  update(fields: OminityCartFields): Promise<void>;
  setCountry(country: string): Promise<void>;
  /** Rejects with code `PROMOTION_CODE_NOT_APPLIED` when Ominity does not keep the code on the cart. */
  applyPromotionCode(code: string): Promise<void>;
  removePromotionCode(code: string): Promise<void>;
  refresh(): Promise<void>;
  /** @internal Used by `useCheckout` after an order is placed. */
  replace(snapshot: CartSnapshot): void;
}

export interface OminityWishlistContextValue {
  readonly items: ReadonlyArray<Product>;
  has(productId: number): boolean;
  add(product: Product): void;
  remove(productId: number): void;
  toggle(product: Product): void;
  clear(): void;
}

const CartContext = createContext<OminityCartContextValue | null>(null);
const WishlistContext = createContext<OminityWishlistContextValue | null>(null);
export const CommerceBasePathContext = createContext("/api/commerce");

function totals(snapshot: CartSnapshot) {
  return {
    cartCount: snapshot.cart?.totalQuantity ?? 0,
    cartSubtotal: commerceMoneyValue(snapshot.cart?.subtotalAmount),
    ...(snapshot.cart ? { currency: commerceMoneyCurrency(snapshot.cart.totalAmount) ?? snapshot.cart.currency.toUpperCase() } : {}),
  };
}

export function OminityCartProvider({ children, basePath = "/api/commerce" }: { readonly children: ReactNode; readonly basePath?: string | undefined }) {
  const base = basePath.replace(/\/+$/, "");
  const auth = useAuth();
  const [snapshot, setSnapshot] = useState<CartSnapshot>({ cart: null, items: [] });
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<OminityActionError | null>(null);
  const latest = useRef(snapshot);
  latest.current = snapshot;

  const call = useCallback(async (path: string, init?: RequestInit): Promise<CartSnapshot> => {
    setPending((count) => count + 1);
    setError(null);
    try {
      const next = await requestRoute<CartSnapshot>(`${base}${path}`, init);
      setSnapshot(next);
      return next;
    } catch (caught) {
      const failure = toOminitySdkError(caught);
      setError(failure);
      throw failure;
    } finally {
      setPending((count) => count - 1);
    }
  }, [base]);

  const refresh = useCallback(async () => {
    await call("/cart").catch(() => undefined);
    setReady(true);
  }, [call]);

  // The server attaches the cart to whoever is signed in, so reload it when that changes.
  useEffect(() => {
    if (auth.ready) void refresh();
  }, [auth.ready, auth.user?.id, refresh]);

  const update = useCallback(async (fields: OminityCartFields | { readonly promotionCodes: ReadonlyArray<string> }) => {
    await call("/cart", { method: "PATCH", body: JSON.stringify(fields) });
  }, [call]);

  const value = useMemo<OminityCartContextValue>(() => {
    const promotionCodes = snapshot.cart?.promotionCodes ?? [];
    return {
      ready,
      cart: snapshot.cart,
      items: snapshot.items,
      count: snapshot.cart?.totalQuantity ?? 0,
      promotionCodes,
      pending: pending > 0,
      error,
      async add(product, quantity = 1) {
        const productId = typeof product === "object" ? product.id : product;
        const next = await call("/cart/items", { method: "POST", body: JSON.stringify({ productId, quantity }) });
        const price = typeof product === "object" ? resolveCommerceProductPrice({ offers: product.offers ?? [] }) : null;
        emitCommerceEvent("cart_item_added", {
          productId: String(productId),
          quantity,
          ...(typeof product === "object" ? { sku: product.sku, title: product.title } : {}),
          ...(price ? { unitPrice: commerceMoneyValue(price) } : {}),
          ...totals(next),
        });
      },
      async setQuantity(itemId, quantity) {
        const previous = latest.current.items.find((item) => item.id === itemId);
        const next = await call(`/cart/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: JSON.stringify({ quantity }) });
        emitCommerceEvent(quantity === 0 ? "cart_item_removed" : "cart_item_quantity_updated", {
          itemId,
          ...(previous ? { productId: String(previous.productId), quantity, previousQuantity: previous.quantity } : { quantity }),
          ...totals(next),
        });
      },
      async remove(itemId) {
        const previous = latest.current.items.find((item) => item.id === itemId);
        const next = await call(`/cart/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
        emitCommerceEvent("cart_item_removed", {
          itemId,
          ...(previous ? { productId: String(previous.productId), quantity: previous.quantity } : {}),
          ...totals(next),
        });
      },
      async clear() {
        await call("/cart", { method: "DELETE" });
      },
      update,
      setCountry: (country) => update({ country: country.toUpperCase() }),
      async applyPromotionCode(code) {
        const normalized = code.trim();
        if (!normalized || promotionCodes.includes(normalized)) return;
        const codes = [...promotionCodes, normalized];
        const next = await call("/cart", { method: "PATCH", body: JSON.stringify({ promotionCodes: codes }) });
        // Ominity drops codes that do not exist or do not apply instead of refusing the update.
        const kept = next.cart?.promotionCodes ?? [];
        if (!kept.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) {
          const failure = new OminityActionError("This promotion code is not valid for your cart.", 422, "PROMOTION_CODE_NOT_APPLIED", {
            fields: { promotionCodes: ["This promotion code is not valid for your cart."] },
          });
          setError(failure);
          throw failure;
        }
        emitCommerceEvent("promotion_code_applied", { code: normalized, promotionCodes: kept });
      },
      async removePromotionCode(code) {
        const codes = promotionCodes.filter((entry) => entry !== code);
        await update({ promotionCodes: codes });
        emitCommerceEvent("promotion_code_removed", { code, promotionCodes: codes });
      },
      refresh,
      replace: setSnapshot,
    };
  }, [call, error, pending, ready, refresh, snapshot, update]);

  return (
    <CommerceBasePathContext.Provider value={base}>
      <CartContext.Provider value={value}>{children}</CartContext.Provider>
    </CommerceBasePathContext.Provider>
  );
}

export function OminityWishlistProvider({ children, storageKey = "ominity:wishlist" }: { readonly children: ReactNode; readonly storageKey?: string | undefined }) {
  const [items, setItems] = useState<ReadonlyArray<Product>>([]);

  // Read after mount (the server render has no storage); write only when the shopper changes the list, so a remount
  // never saves the empty initial list over the stored one.
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as unknown;
      if (Array.isArray(stored)) setItems(stored as Product[]);
    } catch {
      // Unreadable storage starts an empty wishlist.
    }
  }, [storageKey]);

  const change = useCallback((next: (current: ReadonlyArray<Product>) => ReadonlyArray<Product>) => {
    setItems((current) => {
      const updated = next(current);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // Storage may be unavailable; the wishlist still works for this visit.
      }
      return updated;
    });
  }, [storageKey]);

  const value = useMemo<OminityWishlistContextValue>(() => {
    const has = (productId: number) => items.some((item) => item.id === productId);
    const add = (product: Product) => {
      if (has(product.id)) return;
      change((current) => [...current, product]);
      emitCommerceEvent("wishlist_item_added", { productId: String(product.id), sku: product.sku, title: product.title });
    };
    const remove = (productId: number) => {
      change((current) => current.filter((item) => item.id !== productId));
      emitCommerceEvent("wishlist_item_removed", { productId: String(productId) });
    };
    return {
      items,
      has,
      add,
      remove,
      toggle: (product) => (has(product.id) ? remove(product.id) : add(product)),
      clear: () => change(() => []),
    };
  }, [change, items]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

/**
 * The shopping cart in the HttpOnly cart cookie: items, quantities, country, promotion codes and totals, as SDK
 * `Cart` and `CartItem` (with `item.product`). Signing in attaches it to the user and active customer.
 */
export function useCart(): OminityCartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside OminityProvider.");
  return value;
}

/** Products saved for later, kept in this browser's storage. */
export function useWishlist(): OminityWishlistContextValue {
  const value = useContext(WishlistContext);
  if (!value) throw new Error("useWishlist must be used inside OminityProvider.");
  return value;
}
