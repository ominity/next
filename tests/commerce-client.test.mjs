import assert from "node:assert/strict";
import { test } from "node:test";
import { HTTPClient } from "@ominity/api-typescript";

import { createCommerceClient } from "../dist/commerce/index.js";

test("createCommerceClient forwards a flat camelCase cart item body through the SDK", async () => {
  let forwardedRequest;
  const client = createCommerceClient({
    sdk: {
      serverURL: "https://example.ominity.test/api",
      httpClient: new HTTPClient({
        fetcher: async (request) => {
          forwardedRequest = request.clone();
          return new Response(JSON.stringify({ id: "item-1" }), {
            status: 201,
            headers: { "content-type": "application/hal+json" },
          });
        },
      }),
    },
  });

  await client.createCartItem({ cartId: "cart-1", productId: "6", quantity: 1 });

  assert.ok(forwardedRequest instanceof Request);
  assert.equal(
    new URL(forwardedRequest.url).pathname,
    "/api/v1/commerce/carts/cart-1/items",
  );
  assert.deepEqual(JSON.parse(await forwardedRequest.text()), {
    productId: "6",
    quantity: 1,
  });
});

test("createCommerceClient returns SDK-shaped cart and cart item payloads via adapter", async () => {
  const client = createCommerceClient({
    sdk: {
      serverURL: "https://example.ominity.test/api",
    },
    adapter: {
      async getCart() {
        return {
          id: "cart_1",
          status: "open",
          type: "default",
          currency: "eur",
          totalQuantity: 2,
          subtotalAmount: {
            currency: "EUR",
            amount: "10.00",
          },
          shippingAmount: {
            currency: "EUR",
            amount: "0.00",
          },
          discountAmount: {
            currency: "EUR",
            amount: "0.00",
          },
          taxAmount: {
            currency: "EUR",
            amount: "2.10",
          },
          totalAmount: {
            currency: "EUR",
            amount: "12.10",
          },
        };
      },
      async listCartItems() {
        return {
          items: [
            {
              id: "item_1",
              quantity: 2,
              productId: "42",
              title: "Desk Lamp",
              price: {
                currency: "EUR",
                amount: "5.00",
              },
              totalPrice: {
                currency: "EUR",
                amount: "10.00",
              },
            },
          ],
        };
      },
    },
  });

  const cart = await client.getCart({ cartId: "cart_1" });
  assert.ok(cart);
  assert.equal(cart.id, "cart_1");
  assert.equal(cart.currency, "eur");
  assert.equal(cart.totalAmount.amount, "12.10");

  const items = await client.listCartItems({ cartId: "cart_1" });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "item_1");
  assert.equal(items[0].title, "Desk Lamp");
  assert.equal(items[0].price.amount, "5.00");
  assert.equal(items[0].totalPrice.amount, "10.00");
});

test("createCommerceClient returns SDK-shaped shipping and payment methods", async () => {
  const client = createCommerceClient({
    sdk: {
      serverURL: "https://example.ominity.test/api",
    },
    adapter: {
      async listShippingMethods() {
        return {
          items: [
            { id: "std", name: "Standard Shipping" },
          ],
        };
      },
      async listPaymentMethods() {
        return {
          items: [
            {
              id: 9,
              gateway: "mollie",
              method: "ideal",
              label: "iDEAL",
              isEnabled: true,
            },
          ],
        };
      },
    },
  });

  const shippingMethods = await client.listShippingMethods();
  assert.equal(shippingMethods.length, 1);
  assert.equal(shippingMethods[0].id, "std");
  assert.equal(shippingMethods[0].name, "Standard Shipping");

  const paymentMethods = await client.listPaymentMethods();
  assert.equal(paymentMethods.length, 1);
  assert.equal(paymentMethods[0].id, 9);
  assert.equal(paymentMethods[0].label, "iDEAL");
});

test("createCommerceClient injects visitorId in cart and order payloads", async () => {
  const captured = {
    createCart: null,
    updateCart: null,
    createOrder: null,
  };

  const client = createCommerceClient({
    sdk: {
      serverURL: "https://example.ominity.test/api",
    },
    visitorIdResolver: async () => "648cd59e-8f79-40a7-a4de-1fb65b42c00c",
    adapter: {
      async createCart(data) {
        captured.createCart = data;
        return { id: "cart_1" };
      },
      async updateCart(_cartId, data) {
        captured.updateCart = data;
        return { id: "cart_1" };
      },
      async createOrder(data) {
        captured.createOrder = data;
        return { id: "order_1" };
      },
    },
  });

  await client.createCart({
    data: { type: "default" },
  });
  await client.updateCart({
    cartId: "cart_1",
    data: {
      visitorId: "already-set",
      note: "keep current visitor",
    },
  });
  await client.createOrder({
    data: { cartId: "cart_1" },
  });

  assert.equal(captured.createCart.visitorId, "648cd59e-8f79-40a7-a4de-1fb65b42c00c");
  assert.equal(captured.createCart.type, "default");
  assert.equal(captured.updateCart.visitorId, "already-set");
  assert.equal(captured.createOrder.visitorId, "648cd59e-8f79-40a7-a4de-1fb65b42c00c");
});

test("createCommerceClient exposes SDK 1.4.5 storefront resources without renamed models", async () => {
  const calls = [];
  const client = createCommerceClient({
    sdk: { serverURL: "https://example.ominity.test/api" },
    adapter: {
      async listProducts(input) {
        calls.push(["products", input]);
        return { items: [{ id: 4, title: "Desk Lamp" }] };
      },
      async listProductOffers(input) {
        calls.push(["offers", input]);
        return { items: [{ id: 7, productId: 4 }] };
      },
      async getProductOffer(input) {
        calls.push(["offer", input]);
        return { id: input.offerId, productId: input.productId };
      },
      async listCartShippingMethods(cartId) {
        calls.push(["cart-shipping", cartId]);
        return {
          items: [{ id: 2, name: "Express" }],
          count: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
          shippingZone: { id: 3, name: "Belgium" },
        };
      },
      async listPaymentMethodIssuers(input) {
        calls.push(["issuers", input]);
        return { items: [{ id: 9, paymentmethodId: input.methodId, name: "Bank" }] };
      },
      async createOrderPayment(input) {
        calls.push(["order-payment", input]);
        return { id: 31, status: "open" };
      },
      async createPayment(input) {
        calls.push(["payment", input]);
        return { id: 32, status: "open" };
      },
    },
  });

  const products = await client.listProducts({ page: 2, filter: { published: true } });
  const offers = await client.listProductOffers({ productId: 4, page: 1 });
  const offer = await client.getProductOffer({ productId: 4, offerId: 7 });
  const shipping = await client.listCartShippingMethods({ cartId: "cart-1" });
  const issuers = await client.listPaymentMethodIssuers({ methodId: 5 });
  const orderPayment = await client.createOrderPayment({
    orderId: "order-1",
    data: { paymentmethodId: 5, redirectUrl: "https://store.example.com/return" },
  });
  const payment = await client.createPayment({
    data: { paymentmethodId: 5, redirectUrl: "https://store.example.com/return" },
  });

  assert.equal(products[0].title, "Desk Lamp");
  assert.equal(offers[0].productId, 4);
  assert.equal(offer.id, 7);
  assert.equal(shipping.shippingZone.name, "Belgium");
  assert.equal(issuers[0].paymentmethodId, 5);
  assert.equal(orderPayment.id, 31);
  assert.equal(payment.id, 32);
  assert.deepEqual(calls.map(([operation]) => operation), [
    "products",
    "offers",
    "offer",
    "cart-shipping",
    "issuers",
    "order-payment",
    "payment",
  ]);
});

test("commerce debug logging redacts nested payment credentials", async () => {
  const events = [];
  const client = createCommerceClient({
    sdk: { serverURL: "https://example.ominity.test/api" },
    debug: {
      enabled: true,
      logger: { log: (event) => events.push(event) },
    },
    adapter: {
      async createPayment() {
        return { id: 44, status: "open" };
      },
    },
  });

  await client.createPayment({
    data: {
      paymentmethodId: 4,
      redirectUrl: "https://store.example.com/payment/return",
      details: { cardToken: "sensitive-card-token" },
    },
    requestOptions: {
      headers: { Authorization: "Bearer sensitive-access-token" },
    },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].payload.data.details.cardToken, "[redacted]");
  assert.equal(events[0].payload.requestOptions.headers.Authorization, "[redacted]");
  assert.equal(JSON.stringify(events[0]).includes("sensitive"), false);
});
