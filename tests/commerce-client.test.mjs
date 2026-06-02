import assert from "node:assert/strict";
import { test } from "node:test";

import { createCommerceClient } from "../dist/commerce/index.js";

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
