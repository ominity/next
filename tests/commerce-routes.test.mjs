import assert from "node:assert/strict";
import { test } from "node:test";

import { HTTPClient } from "@ominity/api-typescript";

import { writeAuthSessionCookie } from "../dist/next/auth.js";
import { createOminityCommerceRouteHandlers } from "../dist/commerce/server/index.js";

const SITE = "https://store.example.com";
const API = "https://tenant.ominity.test/api";
const SECRET = "s".repeat(40);
const amount = (value) => ({ value, currency: "EUR" });
const address = (city) => ({
  firstName: "Jamie", lastName: "Doe", street: "Main", number: "1", additional: "", postalCode: "1000", city, region: "", country: "BE",
});

function cookieJar() {
  const values = new Map();
  return {
    values,
    get: (name) => (values.has(name) ? { value: values.get(name) } : undefined),
    set: (name, value, options = {}) => (options.maxAge === 0 ? values.delete(name) : values.set(name, value)),
  };
}

/** A small in-memory Ominity API: carts, items, orders and memberships. */
function fakeApi() {
  const carts = new Map();
  const items = new Map();
  const orders = new Map();
  const calls = [];
  const cart = (id, data = {}) => ({
    resource: "cart", id, status: "pending", type: "default", channelId: 1, customerId: null, userId: null,
    email: "", companyName: "", companyVat: "", billingAddress: address(""), shippingAddress: address(""),
    subtotalAmount: amount("20.00"), shippingAmount: amount("0.00"), discountAmount: amount("0.00"), taxAmount: amount("3.47"),
    totalAmount: amount("20.00"), country: "BE", currency: "EUR", isShippingRequired: true, shippingMethodId: null, isTaxExempt: false,
    totalQuantity: 0, promotionCodes: [], updatedAt: "2026-10-29T00:00:00Z", createdAt: "2026-10-29T00:00:00Z",
    _links: { self: { href: `${API}/v1/commerce/carts/${id}`, type: "application/hal+json" } }, ...data,
  });
  const order = (id, data) => ({
    resource: "order", id, customerId: null, cartId: null, channelId: 1, languageId: null, number: `ORD-${id}`, invoiceId: null,
    status: "pending", companyName: null, companyVat: null, billingAddress: address("Brussels"), shippingAddress: address("Brussels"),
    subtotalAmount: amount("20.00"), shipping: { shippingAmount: amount("0.00"), discountAmount: amount("0.00"), vatAmount: amount("0.00"), totalAmount: amount("0.00") },
    discountAmount: amount("0.00"), vatAmount: amount("3.47"), totalAmount: amount("20.00"), promotionCodes: [], shippingMethodId: null,
    isTaxExempt: false, notes: "", updatedAt: "2026-10-29T00:00:00Z", createdAt: "2026-10-29T00:00:00Z", ...data,
  });
  orders.set(900, order(900, { customerId: 42 }));
  orders.set(901, order(901, { customerId: 77 }));
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/hal+json" } });

  const fetcher = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname.replace("/api/v1", "");
    const body = ["POST", "PATCH"].includes(request.method) ? JSON.parse(await request.clone().text() || "{}") : null;
    calls.push({ method: request.method, path, body, authorization: request.headers.get("authorization") });

    let match;
    if (request.method === "POST" && path === "/commerce/carts") {
      const id = `cart-${carts.size + 1}`;
      carts.set(id, cart(id, body));
      items.set(id, []);
      return json(carts.get(id), 201);
    }
    if ((match = path.match(/^\/commerce\/carts\/([^/]+)$/))) {
      if (!carts.has(match[1])) return json({ status: 404, title: "Not Found", detail: "x", _links: { documentation: { href: "x", type: "text/html" } } }, 404);
      if (request.method === "PATCH") carts.set(match[1], { ...carts.get(match[1]), ...body });
      return json(carts.get(match[1]));
    }
    if ((match = path.match(/^\/commerce\/carts\/([^/]+)\/items$/))) {
      if (request.method === "POST") {
        const item = {
          resource: "cartitem", id: `item-${items.get(match[1]).length + 1}`, cartId: match[1], productId: Number(body.productId),
          productOfferId: 1, quantity: body.quantity, unitAmount: amount("10.00"), discountAmount: amount("0.00"), taxAmount: amount("1.74"),
          totalAmount: amount("20.00"), isShippingRequired: true, updatedAt: "2026-10-29T00:00:00Z", createdAt: "2026-10-29T00:00:00Z",
        };
        items.get(match[1]).push(item);
        carts.set(match[1], { ...carts.get(match[1]), totalQuantity: carts.get(match[1]).totalQuantity + body.quantity });
        return json(item, 201);
      }
      return json({ _embedded: { cart_items: items.get(match[1]) }, count: items.get(match[1]).length });
    }
    if ((match = path.match(/^\/commerce\/carts\/([^/]+)\/items\/([^/]+)$/)) && request.method === "DELETE") {
      const kept = items.get(match[1]).filter((item) => item.id !== match[2]);
      if (kept.length === items.get(match[1]).length) return json({ status: 500, title: "Internal Server Error", detail: "Remove cart item failed." }, 500);
      items.set(match[1], kept);
      carts.set(match[1], { ...carts.get(match[1]), totalQuantity: kept.reduce((sum, item) => sum + item.quantity, 0) });
      return new Response(null, { status: 204 });
    }
    if (request.method === "POST" && path === "/commerce/orders") {
      const created = order(500 + orders.size, { customerId: body.customerId ?? null, cartId: body.cartId, notes: body.notes ?? "" });
      orders.set(created.id, created);
      return json(created, 201);
    }
    if ((match = path.match(/^\/commerce\/orders\/(\d+)$/))) {
      return orders.has(Number(match[1])) ? json(orders.get(Number(match[1]))) : json({}, 404);
    }
    if (path === "/users/7/customers/42") {
      return json({
        resource: "customer_user", userId: 7, customerId: 42, roleId: 1, isOwner: false, permissions: ["commerce.orders.view"],
        firstName: "Jamie", lastName: "Doe", email: "jamie@example.com", updatedAt: "2026-10-29T00:00:00Z", createdAt: "2026-10-29T00:00:00Z",
      });
    }
    return json({}, 404);
  };

  return { carts, orders, calls, httpClient: new HTTPClient({ fetcher }) };
}

function setup(config = {}) {
  const api = fakeApi();
  const jar = cookieJar();
  globalThis.__ominityTestCookies = jar;
  const routes = createOminityCommerceRouteHandlers({
    ominityBaseUrl: API,
    ominityApiKey: "server-api-key",
    authSessionSecret: SECRET,
    siteUrl: SITE,
    sdkHttpClient: api.httpClient,
    ...config,
  });
  const call = (method, path, body) => routes[method](new Request(`${SITE}/api/commerce${path}`, {
    method,
    headers: { Origin: SITE, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  return { api, jar, call };
}

async function signIn(jar, extra = {}) {
  await writeAuthSessionCookie(jar, {
    accessToken: "user-token", tokenType: "Bearer", expiresAt: new Date(Date.now() + 60_000).toISOString(), userId: 7, ...extra,
  }, { sessionSecret: SECRET, secure: false });
}

test("the browser can only change shopper fields of its own cart", async () => {
  const { api, jar, call } = setup();

  const empty = await call("GET", "/cart");
  assert.deepEqual(await empty.json(), { cart: null, items: [] });
  assert.equal(api.carts.size, 0, "looking at the cart does not create one");

  await call("PATCH", "/cart", {
    email: "jamie@example.com",
    country: "NL",
    promotionCodes: ["WELCOME"],
    taxExempt: true,
    isTaxExempt: true,
    customerId: 77,
    userId: 1,
    status: "completed",
  });
  const patch = api.calls.find((entry) => entry.method === "PATCH");
  assert.deepEqual(patch.body, { email: "jamie@example.com", country: "NL", promotionCodes: ["WELCOME"] });
  assert.equal(jar.values.get("ominity_cart_id"), "cart-1");
});

test("removing an item returns the updated cart, also when the quantity goes to zero", async () => {
  const { call } = setup();
  await call("POST", "/cart/items", { productId: 6, quantity: 1 });
  const { items } = await (await call("POST", "/cart/items", { productId: 7, quantity: 1 })).json();
  assert.equal(items.length, 2);

  const removed = await call("DELETE", `/cart/items/${items[0].id}`);
  assert.equal(removed.status, 200);
  const afterRemove = await removed.json();
  assert.deepEqual(afterRemove.items.map((item) => item.productId), [7]);
  assert.equal(afterRemove.cart.totalQuantity, 1);

  const zero = await call("PATCH", `/cart/items/${items[1].id}`, { quantity: 0 });
  assert.equal(zero.status, 200);
  assert.deepEqual((await zero.json()).items, []);
});

test("checkout builds the order from the cart and ignores owner, price and status fields from the browser", async () => {
  const { api, jar, call } = setup({ checkoutFields: ["reference"] });
  await call("PATCH", "/cart", { email: "jamie@example.com", billingAddress: address("Ghent") });
  await call("POST", "/cart/items", { productId: 6, quantity: 2 });

  const response = await call("POST", "/checkout", {
    fields: { notes: "Leave at the door", reference: "PO-1", customerId: 77, status: "paid", lines: [{ type: "product", unitAmount: 0 }] },
    cartId: "someone-elses-cart",
    customerId: 77,
  });
  assert.equal(response.status, 201);
  const { order } = await response.json();

  const create = api.calls.find((entry) => entry.method === "POST" && entry.path === "/commerce/orders");
  assert.equal(create.body.cartId, "cart-1");
  assert.equal(create.body.email, "jamie@example.com");
  assert.equal(create.body.billingAddress.city, "Ghent");
  assert.equal(create.body.notes, "Leave at the door");
  assert.equal(create.body.reference, "PO-1");
  for (const key of ["customerId", "userId", "status", "lines"]) assert.equal(key in create.body, false, key);
  assert.equal(create.authorization, "Bearer server-api-key");

  assert.equal(jar.values.has("ominity_cart_id"), false, "a new cart starts after checkout");
  assert.equal((await call("GET", `/orders/${order.id}`)).status, 200, "the browser that placed the order can read it");
});

test("orders are only readable by the browser that placed them or their own customer", async () => {
  const { jar, call } = setup();

  assert.equal((await call("GET", "/orders/900")).status, 404, "guests cannot read orders by id");
  assert.equal((await call("GET", "/orders/900/payments")).status, 404);

  jar.set("ominity_orders", "W10.forged");
  assert.equal((await call("GET", "/orders/900")).status, 404, "a forged order list is ignored");

  await signIn(jar);
  jar.set("ominity_active_customer", "42");
  assert.equal((await call("GET", "/orders/900")).status, 200, "the signed-in user's customer can read its order");
  assert.equal((await call("GET", "/orders/901")).status, 404, "but not another customer's order");
});

test("signed-in carts and orders belong to the user and the active customer they are a member of", async () => {
  const { api, jar, call } = setup();
  await signIn(jar);
  jar.set("ominity_active_customer", "42");

  await call("POST", "/cart/items", { productId: 6, quantity: 1 });
  assert.equal(api.carts.get("cart-1").userId, 7);
  assert.equal(api.carts.get("cart-1").customerId, 42);

  const checkout = await call("POST", "/checkout", {});
  assert.equal(checkout.status, 403, "the membership has no commerce.orders.place permission");
  assert.equal((await checkout.json()).code, "MISSING_CUSTOMER_PERMISSION");
});

test("guest checkout can be switched off and a pending MFA session does not count as signed in", async () => {
  const { jar, call } = setup({ guestCheckout: false });
  await call("POST", "/cart/items", { productId: 6, quantity: 1 });

  assert.equal((await call("POST", "/checkout", {})).status, 401);
  await signIn(jar, { mfaPending: true });
  assert.equal((await call("POST", "/checkout", {})).status, 401, "the second factor is still missing");
});

test("payments with a saved mandate need the signed-in customer, and cross-site writes are refused", async () => {
  const { jar, call } = setup();
  await call("PATCH", "/cart", { email: "jamie@example.com" });
  await call("POST", "/cart/items", { productId: 6, quantity: 1 });
  const { order } = await (await call("POST", "/checkout", {})).json();

  const mandate = await call("POST", `/orders/${order.id}/payments`, { paymentmethodId: 1, mandateId: 5, redirectUrl: `${SITE}/done` });
  assert.equal(mandate.status, 403);
  assert.equal((await mandate.json()).code, "MANDATE_NOT_ALLOWED");

  const routes = createOminityCommerceRouteHandlers({ ominityApiKey: "k", siteUrl: SITE, authSessionSecret: SECRET });
  globalThis.__ominityTestCookies = jar;
  const crossSite = await routes.PATCH(new Request(`${SITE}/api/commerce/cart`, {
    method: "PATCH",
    headers: { Origin: "https://attacker.example" },
    body: "{}",
  }));
  assert.equal(crossSite.status, 403);
});
