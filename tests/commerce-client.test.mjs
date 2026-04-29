import assert from "node:assert/strict";
import { test } from "node:test";

import { createCommerceClient } from "../dist/commerce/index.js";

test("createCommerceClient normalizes cart and cart items via adapter", async () => {
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
  assert.equal(cart.currency, "EUR");
  assert.equal(cart.totalAmount.value, 12.1);

  const items = await client.listCartItems({ cartId: "cart_1" });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "item_1");
  assert.equal(items[0].title, "Desk Lamp");
  assert.equal(items[0].unitPrice?.value, 5);
  assert.equal(items[0].totalPrice?.value, 10);
});

test("createCommerceClient normalizes shipping and payment methods", async () => {
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
