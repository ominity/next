import assert from "node:assert/strict";
import { test } from "node:test";

import { Window } from "happy-dom";

const window = new Window({ url: "https://store.example.com/" });
globalThis.window = window;
globalThis.document = window.document;
globalThis.CustomEvent = window.CustomEvent;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { OminityProvider, useAuth, useCart, useCheckout, useWishlist } = await import("../dist/react/index.js");
const { addCommerceEventListener } = await import("../dist/commerce/index.js");

const amount = (value) => ({ value, currency: "EUR" });
const user = { resource: "user", id: 7, firstName: "Jamie", email: "jamie@example.com" };
const cart = (quantity, codes = []) => ({
  resource: "cart", id: "cart-1", status: "pending", totalQuantity: quantity, promotionCodes: codes, isShippingRequired: true,
  subtotalAmount: amount("20.00"), discountAmount: amount(codes.length ? "2.00" : "0.00"), totalAmount: amount("18.00"),
  currency: "EUR", country: "BE",
});
const item = { resource: "cartitem", id: "item-1", productId: 6, quantity: 2, totalAmount: amount("20.00") };
const product = { resource: "product", id: 6, sku: "PRO", title: "Pro", offers: [] };

function routes() {
  const calls = [];
  const state = { quantity: 0, codes: [] };
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method ?? "GET", url, body });
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    const snapshot = () => (state.quantity ? { cart: cart(state.quantity, state.codes), items: [item] } : { cart: null, items: [] });

    if (url === "/api/auth/me") return json({ status: "anonymous" });
    if (url === "/api/auth/login") return json({ status: "mfa_required", methods: [{ resource: "user_mfa_method", userId: 7, method: "totp", isEnabled: true }] });
    if (url === "/api/auth/mfa/validate") return json({ status: "authenticated", user, expiresAt: "2030-01-01T00:00:00Z" });
    if (url.startsWith("/api/customer-accounts")) return json({ memberships: [], activeCustomerId: null, activeMembership: null });
    if (url === "/api/commerce/cart" && init.method === "PATCH") {
      // Like Ominity, unknown codes are dropped rather than refused.
      state.codes = (body.promotionCodes ?? state.codes).filter((code) => code === "WELCOME");
      return json(snapshot());
    }
    if (url === "/api/commerce/cart") return json(snapshot());
    if (url === "/api/commerce/cart/items") {
      state.quantity += body.quantity;
      return json(snapshot(), 201);
    }
    if (url === "/api/commerce/cart/items/item-1" && init.method === "DELETE") {
      // The change reached Ominity, but the response failed.
      state.quantity = 0;
      return json({ error: "The request could not be completed.", code: "COMMERCE_REQUEST_FAILED" }, 502);
    }
    if (url === "/api/commerce/shipping-methods" || url === "/api/commerce/payment-methods") return json({ items: [] });
    if (url === "/api/commerce/checkout") {
      state.quantity = 0;
      return json({ order: { resource: "order", id: 501, number: "ORD-501", totalAmount: amount("18.00") } }, 201);
    }
    return json({ error: "Not found", code: "NOT_FOUND" }, 404);
  };
  return calls;
}

async function render({ strict = false } = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const result = { current: undefined };
  function Probe() {
    result.current = { auth: useAuth(), cart: useCart(), checkout: useCheckout(), wishlist: useWishlist() };
    return null;
  }
  await act(async () => {
    const tree = React.createElement(OminityProvider, null, React.createElement(Probe));
    root.render(strict ? React.createElement(React.StrictMode, null, tree) : tree);
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  return { result, unmount: () => act(async () => root.unmount()) };
}

test("useAuth signs in through the MFA challenge and exposes the SDK user", async () => {
  routes();
  const { result, unmount } = await render();
  assert.equal(result.current.auth.status, "anonymous");

  let state;
  await act(async () => {
    state = await result.current.auth.signIn({ email: "jamie@example.com", password: "pw" });
  });
  assert.equal(state.status, "mfa_required");
  assert.equal(result.current.auth.status, "mfa_required");
  assert.equal(result.current.auth.user, null, "nobody is signed in until the second factor");
  assert.deepEqual(result.current.auth.mfaMethods.map((method) => method.method), ["totp"]);

  await act(async () => {
    await result.current.auth.verifyMfa("totp", "123456");
  });
  assert.equal(result.current.auth.status, "authenticated");
  assert.deepEqual(result.current.auth.user, user);
  await unmount();
});

test("useCart and useCheckout keep one cart, apply promotion codes and place the order", async () => {
  const calls = routes();
  const events = [];
  const stop = addCommerceEventListener((event) => events.push(event.name));
  const { result, unmount } = await render();
  assert.equal(result.current.cart.cart, null);

  await act(async () => {
    await result.current.cart.add(product, 2);
  });
  assert.equal(result.current.cart.count, 2);
  assert.equal(result.current.checkout.count, 2, "useCheckout sees the same cart");
  assert.deepEqual(calls.find((call) => call.url === "/api/commerce/cart/items").body, { productId: 6, quantity: 2 });

  await act(async () => {
    await result.current.cart.applyPromotionCode(" WELCOME ");
  });
  assert.deepEqual(result.current.cart.promotionCodes, ["WELCOME"]);

  await act(async () => {
    await assert.rejects(result.current.cart.applyPromotionCode("NOPE"), { code: "PROMOTION_CODE_NOT_APPLIED", status: 422 });
  });
  assert.deepEqual(result.current.cart.promotionCodes, ["WELCOME"], "a refused code leaves the applied ones in place");
  assert.equal(result.current.cart.error.code, "PROMOTION_CODE_NOT_APPLIED");
  assert.equal(result.current.cart.cart.discountAmount.value, "2.00");

  let order;
  await act(async () => {
    order = await result.current.checkout.placeOrder({ notes: "Ring twice" });
  });
  assert.equal(order.id, 501);
  assert.deepEqual(calls.find((call) => call.url === "/api/commerce/checkout").body, { fields: { notes: "Ring twice" } });
  assert.equal(result.current.cart.cart, null, "a new cart starts after the order");
  assert.equal(result.current.checkout.order.number, "ORD-501");
  assert.deepEqual(events, ["cart_item_added", "promotion_code_applied", "checkout_completed"]);

  await act(async () => result.current.wishlist.toggle(product));
  assert.equal(result.current.wishlist.has(6), true);
  assert.equal(JSON.parse(window.localStorage.getItem("ominity:wishlist"))[0].id, 6);
  stop();
  await unmount();
});

test("the provider settles under StrictMode, which remounts effects in development", async () => {
  const calls = routes();
  window.localStorage.setItem("ominity:wishlist", JSON.stringify([product]));
  const { result, unmount } = await render({ strict: true });
  assert.equal(result.current.auth.ready, true);
  assert.equal(result.current.cart.ready, true);
  assert.ok(calls.some((call) => call.url === "/api/commerce/cart"), "the cart loads once auth is known");
  assert.equal(result.current.wishlist.has(6), true, "the stored wishlist survives the remount");
  assert.equal(JSON.parse(window.localStorage.getItem("ominity:wishlist")).length, 1);
  await unmount();
});

test("a failed cart change rejects, keeps the error and reloads the cart", async () => {
  routes();
  const { result, unmount } = await render();
  await act(async () => {
    await result.current.cart.add(product, 2);
  });
  assert.equal(result.current.cart.items.length, 1);

  await act(async () => {
    await assert.rejects(result.current.cart.remove("item-1"), { code: "COMMERCE_REQUEST_FAILED" });
  });
  assert.equal(result.current.cart.error.code, "COMMERCE_REQUEST_FAILED");
  assert.deepEqual(result.current.cart.items, [], "the item is not left on screen to be removed a second time");
  await unmount();
});
