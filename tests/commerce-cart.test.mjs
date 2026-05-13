import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCommerceCartItemAndRefresh,
  deleteCommerceCartItemAndRefresh,
  setCommerceCartItemQuantityAndRefresh,
  setCommercePromotionCodesAndRefresh,
} from "../dist/next/index.js";

function createCookieStore(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));

  return {
    get(name) {
      const value = values.get(name);
      if (typeof value !== "string") {
        return undefined;
      }

      return { value };
    },
    set(name, value) {
      values.set(name, value);
    },
    read(name) {
      return values.get(name);
    },
  };
}

function createClientFixture() {
  const state = {
    cart: null,
    items: [],
    promotionCodes: [],
    nextItemId: 1,
  };

  return {
    state,
    client: {
      async createCart() {
        const cart = {
          id: "cart_1",
          promotionCodes: [...state.promotionCodes],
          totalQuantity: state.items.reduce((sum, item) => sum + item.quantity, 0),
        };
        state.cart = cart;
        return cart;
      },
      async getCart({ cartId }) {
        if (!state.cart || state.cart.id !== cartId) {
          return null;
        }

        return {
          ...state.cart,
          promotionCodes: [...state.promotionCodes],
          totalQuantity: state.items.reduce((sum, item) => sum + item.quantity, 0),
        };
      },
      async listCartItems() {
        return state.items.map((entry) => ({ ...entry }));
      },
      async createCartItem({ productId, quantity }) {
        const item = {
          id: `item_${state.nextItemId++}`,
          productId,
          quantity,
        };
        state.items.push(item);
        return { ...item };
      },
      async updateCartItem({ itemId, data }) {
        const index = state.items.findIndex((entry) => entry.id === itemId);
        if (index < 0) {
          throw new Error("Item not found.");
        }

        const nextQuantity = Number(data.quantity);
        state.items[index] = {
          ...state.items[index],
          ...(Number.isFinite(nextQuantity) ? { quantity: nextQuantity } : {}),
        };

        return { ...state.items[index] };
      },
      async deleteCartItem({ itemId }) {
        const startCount = state.items.length;
        state.items = state.items.filter((entry) => entry.id !== itemId);
        return state.items.length < startCount;
      },
      async updateCart({ data }) {
        if (Array.isArray(data.promotionCodes)) {
          state.promotionCodes = data.promotionCodes.map((entry) => String(entry));
        }

        const cart = state.cart ?? {
          id: "cart_1",
          totalQuantity: 0,
          promotionCodes: [],
        };
        state.cart = {
          ...cart,
          promotionCodes: [...state.promotionCodes],
        };

        return { ...state.cart };
      },
    },
  };
}

test("createCommerceCartItemAndRefresh creates cart item and returns refreshed snapshot", async () => {
  const cookieStore = createCookieStore();
  const fixture = createClientFixture();

  const snapshot = await createCommerceCartItemAndRefresh({
    client: fixture.client,
    cookies: cookieStore,
    productId: "29",
    quantity: 2,
  });

  assert.equal(snapshot.created, false);
  assert.equal(snapshot.cart.id, "cart_1");
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].productId, "29");
  assert.equal(snapshot.items[0].quantity, 2);
  assert.equal(cookieStore.read("ominity_cart_id"), "cart_1");
});

test("setCommerceCartItemQuantityAndRefresh deletes item when quantity is zero", async () => {
  const cookieStore = createCookieStore();
  const fixture = createClientFixture();

  const seeded = await createCommerceCartItemAndRefresh({
    client: fixture.client,
    cookies: cookieStore,
    productId: "29",
    quantity: 3,
  });
  const itemId = seeded.items[0].id;

  const snapshot = await setCommerceCartItemQuantityAndRefresh({
    client: fixture.client,
    cookies: cookieStore,
    itemId,
    quantity: 0,
  });

  assert.equal(snapshot.items.length, 0);
});

test("setCommercePromotionCodesAndRefresh updates promotionCodes and trims duplicates", async () => {
  const cookieStore = createCookieStore();
  const fixture = createClientFixture();

  const snapshot = await setCommercePromotionCodesAndRefresh({
    client: fixture.client,
    cookies: cookieStore,
    promotionCodes: [" WELCOME ", "WELCOME", "SPRING"],
  });

  assert.deepEqual(snapshot.cart.promotionCodes, ["WELCOME", "SPRING"]);
});

test("deleteCommerceCartItemAndRefresh removes the requested item", async () => {
  const cookieStore = createCookieStore();
  const fixture = createClientFixture();

  const seeded = await createCommerceCartItemAndRefresh({
    client: fixture.client,
    cookies: cookieStore,
    productId: "29",
    quantity: 1,
  });
  const itemId = seeded.items[0].id;

  const snapshot = await deleteCommerceCartItemAndRefresh({
    client: fixture.client,
    cookies: cookieStore,
    itemId,
  });

  assert.equal(snapshot.items.length, 0);
});
