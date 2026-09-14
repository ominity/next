import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createOminityCommerceCartRouteHandlers,
  createOminityCommerceOrderPaymentsRouteHandlers,
  createOminityCommercePaymentMethodIssuersRouteHandlers,
  createOminityCommerceRouteHandlers,
} from "../dist/commerce/server/index.js";
import { mockCreateOrder } from "../dist/commerce/server/mock.js";

test("commerce mutation handlers reject cross-site requests before reading cart state", async () => {
  const handlers = createOminityCommerceCartRouteHandlers({
    useMockData: true,
    siteUrl: "https://store.example.com",
  });
  const response = await handlers.PATCH(new Request(
    "https://store.example.com/api/commerce/cart",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: JSON.stringify({ country: "BE" }),
    },
  ));

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).code, "INVALID_ORIGIN");
});

test("payment method issuer handlers support list and detail routes", async () => {
  const { GET } = createOminityCommercePaymentMethodIssuersRouteHandlers({
    useMockData: true,
  });
  const request = new Request("https://store.example.com/api/commerce/payment-methods/4/issuers");
  const list = await GET(request, {
    params: Promise.resolve({ paymentMethodId: "4" }),
  });
  const detail = await GET(request, {
    params: Promise.resolve({ paymentMethodId: "4", issuerId: "9" }),
  });

  assert.equal(list.status, 200);
  assert.equal((await list.json()).items[0].paymentmethodId, 4);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).issuer.id, 9);
});

test("the commerce catch-all handler dispatches optional issuer detail routes", async () => {
  const { GET, POST } = createOminityCommerceRouteHandlers({
    useMockData: true,
    siteUrl: "https://store.example.com",
  });
  const detail = await GET(new Request(
    "https://store.example.com/api/commerce/payment-methods/4/issuers/9",
  ));
  const blocked = await POST(new Request(
    "https://store.example.com/api/commerce/cart/items",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: JSON.stringify({ productId: 4, quantity: 1 }),
    },
  ));

  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).issuer.id, 9);
  assert.equal(blocked.status, 403);
});

test("order payment handlers create and then list a mock payment", async () => {
  const order = mockCreateOrder({ cartId: "route-payment-cart" });
  const handlers = createOminityCommerceOrderPaymentsRouteHandlers({
    useMockData: true,
    siteUrl: "https://store.example.com",
  });
  const requestUrl = `https://store.example.com/api/commerce/orders/${order.id}/payments`;
  const created = await handlers.POST(new Request(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://store.example.com",
    },
    body: JSON.stringify({
      paymentmethodId: 4,
      redirectUrl: "https://store.example.com/payment/return",
    }),
  }), {
    params: Promise.resolve({ orderId: String(order.id) }),
  });
  const payment = (await created.json()).payment;
  const listed = await handlers.GET(new Request(requestUrl), {
    params: Promise.resolve({ orderId: String(order.id) }),
  });

  assert.equal(created.status, 201);
  assert.equal(payment.paymentmethodId, 4);
  assert.equal(payment.amount.value, order.totalAmount.value);
  assert.equal((await listed.json()).items[0].id, payment.id);
});
