# Commerce

Cart, checkout and payment run through the commerce routes, which hold the API key; client components use
`useCart`, `useWishlist` and `useCheckout` from `@ominity/next/react`. Every value they return is the
`@ominity/api-typescript` model (`Cart`, `CartItem`, `Product`, `ShippingMethod`, `PaymentMethod`, `Order`,
`Payment`, …): the package defines no commerce models of its own and never recalculates prices, discounts, shipping
or tax. Catalog data (products, categories, offers) comes from the SDK directly.

## Setup

The commerce routes are part of `createOminityRouteHandlers` (see the
[README](../README.md#one-route-file-for-every-server-route)); `OminityProvider` supplies the cart and wishlist.

```ts
// app/api/[...ominity]/route.ts
export const { GET, POST, PATCH, PUT, DELETE } = createOminityRouteHandlers({
  ominityBaseUrl: process.env.OMINITY_API_URL,
  ominityApiKey: process.env.OMINITY_API_KEY,
  authSessionSecret: process.env.OMINITY_AUTH_SESSION_SECRET,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnv: process.env.NODE_ENV,
  commerce: {
    guestCheckout: true,
    checkoutFields: ["reference"],
    paymentMethodsLimit: 100,
    resolveCountry: (request) => request.headers.get("x-vercel-ip-country") ?? undefined,
  },
});
```

| `commerce` option | |
| --- | --- |
| `guestCheckout` | `false` requires a signed-in user to place an order. Defaults to `true` |
| `checkoutFields` | Extra order fields the browser may send with `placeOrder`, besides `notes` |
| `paymentMethodsLimit` | How many payment methods to load. Defaults to 100 |
| `resolveCountry` | Country of a new cart, e.g. from a geo header |
| `cartCookieName`, `cartCookieMaxAgeSeconds` | The cart cookie (default `ominity_cart_id`, 30 days) |

Pass `commerce: false` to switch the routes off. Outside the catch-all, `createOminityCommerceRouteHandlers` from
`@ominity/next/commerce/server` serves the same routes from one route file.

The routes below `/api/commerce`:

| Method | Path | Behavior |
| --- | --- | --- |
| `GET/PATCH/DELETE` | `cart` | Load, update or start over the cart |
| `POST` | `cart/items` | Add a product |
| `PATCH/DELETE` | `cart/items/{itemId}` | Change the quantity (0 removes) or remove an item |
| `GET` | `shipping-methods` | Shipping methods for the cart |
| `GET` | `payment-methods`, `payment-methods/{id}/issuers` | Payment methods and their issuers |
| `POST` | `checkout` | Place the order from the cart |
| `GET` | `orders/{orderId}` | Load an order |
| `GET/POST` | `orders/{orderId}/payments` | List or start payments |

## What the browser can do

- **The cart is server-side.** Its id lives in an HttpOnly cookie. The browser can only set the shopper's fields:
  `email`, `companyName`, `companyVat`, `billingAddress`, `shippingAddress`, `shippingMethodId`, `country`,
  `currency` and `promotionCodes`. Owner, customer and tax fields are set by the server.
- **Signing in attaches the cart** to the user and, after the membership is confirmed with the user's own token, to
  the active customer account.
- **Checkout builds the order from the cart** on the server. The browser sends only `notes` and the configured
  `checkoutFields`. A signed-in member needs `commerce.orders.place` on the active customer.
- **Orders are private.** An order can only be read and paid by the browser that placed it (a signed cookie) or by
  the signed-in user of its customer.
- **Mandate payments** are only accepted for a mandate of the signed-in customer that owns the order.
- Writes from another site are refused with 403 `INVALID_ORIGIN`.

With `devTool` on, the SDK calls these routes make appear in the Dev Tool request log.

## `useCart`

| Member | |
| --- | --- |
| `ready`, `pending`, `error` | Loaded once; any request in flight; the last failure |
| `cart`, `items`, `count` | SDK `Cart` (`null` until the first item), `CartItem[]` with `item.product`, total quantity |
| `promotionCodes` | Codes applied to the cart |
| `add(product, quantity?)` | A `Product` or its id |
| `setQuantity(itemId, quantity)`, `remove(itemId)`, `clear()` | |
| `update(fields)` | Shopper fields, see above |
| `setCountry(country)` | Shorthand for `update({ country })` |
| `applyPromotionCode(code)`, `removePromotionCode(code)` | |
| `refresh()` | Reload the cart |

```tsx
"use client";

import { commerceMoneyValue } from "@ominity/next/commerce";
import { useCart } from "@ominity/next/react";

export function CartLines() {
  const cart = useCart();

  return cart.items.map((item) => (
    <div key={item.id}>
      {item.product?.title} × {item.quantity} = {commerceMoneyValue(item.totalAmount)}
      <button disabled={cart.pending} onClick={() => void cart.setQuantity(item.id, item.quantity + 1)}>+</button>
      <button disabled={cart.pending} onClick={() => void cart.remove(item.id)}>Remove</button>
    </div>
  ));
}
```

Totals are the cart's own amounts: `subtotalAmount`, `discountAmount`, `shippingAmount`, `taxAmount`,
`totalAmount`. `commerceMoneyValue(amount)` and `commerceMoneyCurrency(amount)` from `@ominity/next/commerce` read
them.

### Promotion codes

Ominity silently drops a code that does not exist or does not apply, so `applyPromotionCode` checks the cart it gets
back and rejects with an `OminityActionError` whose `code` is `PROMOTION_CODE_NOT_APPLIED` (status 422).

```tsx
import { OminityActionError } from "@ominity/next/actions";

try {
  await cart.applyPromotionCode(code);
} catch (error) {
  if (error instanceof OminityActionError && error.code === "PROMOTION_CODE_NOT_APPLIED") {
    setMessage("This code is not valid for your cart.");
  }
}
```

The effect shows in `cart.discountAmount` and each item's `discountAmount`. The API exposes the applied codes and
the discount amounts only, not the promotions behind them.

## `useWishlist`

Products saved for later in this browser's `localStorage` (key `ominity:wishlist`, set with `wishlistStorageKey` on
`OminityProvider`): `items`, `has(productId)`, `add(product)`, `remove(productId)`, `toggle(product)`, `clear()`.

## `useCheckout`

Everything on `useCart`, plus:

| Member | |
| --- | --- |
| `shippingRequired` | `false` for carts with only digital items or services: skip the shipping step |
| `shippingMethods`, `paymentMethods`, `methodsLoading` | Loaded unless `useCheckout({ loadMethods: false })` |
| `selectShippingMethod(id)` | |
| `issuers(paymentMethodId)` | `PaymentMethodIssuer[]`, e.g. iDEAL banks |
| `placeOrder({ notes?, fields? })` | Places the order and starts a new cart; returns the `Order` |
| `pay(orderId, input)` | Starts a payment (`paymentmethodId`, `issuerId`, `redirectUrl`, `details`, `mandateId`, `type`) |
| `getOrder(orderId)`, `listPayments(orderId)` | For the payment and thank-you page |
| `order`, `checkoutPending`, `checkoutError` | The placed order and the state of these actions |

```tsx
"use client";

import type { Address } from "@ominity/api-typescript/models";
import { useCheckout } from "@ominity/next/react";

export function PlaceOrder({ address }: { address: Address }) {
  const checkout = useCheckout();

  async function submit() {
    await checkout.update({ email: "jane@example.com", billingAddress: address, shippingAddress: address });
    const order = await checkout.placeOrder({ notes: "Leave at the door" });
    const payment = await checkout.pay(order.id, {
      paymentmethodId: checkout.paymentMethods[0].id,
      redirectUrl: `${window.location.origin}/payment?order=${order.id}`,
    });
    if (payment.links?.checkout?.href) window.location.assign(payment.links.checkout.href);
  }

  return <button disabled={checkout.checkoutPending} onClick={() => void submit()}>Pay</button>;
}
```

Each `pay` call sends a fresh `Idempotency-Key`.

## Catalog data

Products, categories and offers come from the SDK: on the server with your API-key client, in the browser through
the [SDK gateway](sdk.md) for routes you allow.

```ts
const products = await sdk.commerce.products.list({ include: "offers", limit: 24 });
const price = resolveCommerceProductPrice({ offers: products.items[0].offers ?? [] });
```

`@ominity/next/commerce` also exports:

- `resolveCommerceProductPrice` and `resolvePriceFromPriceMap` for picking the offer price;
- `findCommerceRouteForLocale`, `commerceProductRouteSegment` and related routing helpers;
- `commerceMoneyValue` and `commerceMoneyCurrency`;
- commerce events: `addCommerceEventListener`, `emitCommerceEvent` and the `CommerceEventName` union. The hooks emit
  `cart_item_added`, `cart_item_removed`, `cart_item_quantity_updated`, `promotion_code_applied`,
  `promotion_code_removed`, `wishlist_item_added`, `wishlist_item_removed` and `checkout_completed`; pages can emit
  `product_viewed`, `cart_viewed`, `checkout_started` and the order events themselves.
