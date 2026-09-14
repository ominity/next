# Commerce

The commerce package keeps API access, cart state, checkout, payment creation,
and SDK response handling out of storefront components. Projects own the markup
and styling and consume the original models from `@ominity/api-typescript`.

## Add one App Router endpoint

The optional catch-all handler exposes the complete browser-facing commerce
surface through one route file:

```ts
// app/api/commerce/[[...path]]/route.ts
import { createOminityCommerceRouteHandlers } from "@ominity/next/commerce/server";

export const { GET, POST, PATCH, DELETE } = createOminityCommerceRouteHandlers({
  ominityBaseUrl: process.env.OMINITY_API_URL,
  ominityApiKey: process.env.OMINITY_API_KEY,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnv: process.env.NODE_ENV,
  resolveLanguage: (request) => request.headers.get("x-locale") ?? "en",
  resolveCountry: (request) => request.headers.get("x-country"),
});
```

`basePath` defaults to `/api/commerce`. Mutation routes reject cross-site
requests before reading the cart cookie or creating an SDK client. The API key
and payment credentials remain on the server.

The route surface is:

| Method | Path | Behavior |
| --- | --- | --- |
| `GET/PATCH` | `/api/commerce/cart` | Load or update the current cart |
| `POST` | `/api/commerce/cart/items` | Add a product to the current cart |
| `PATCH/DELETE` | `/api/commerce/cart/items/{itemId}` | Update or remove a cart item |
| `GET` | `/api/commerce/shipping-methods` | Load methods and zone for the current cart |
| `GET` | `/api/commerce/payment-methods` | Load available payment methods |
| `GET` | `/api/commerce/payment-methods/{methodId}/issuers[/{issuerId}]` | List or load payment issuers |
| `POST` | `/api/commerce/checkout` | Create an order from the current cart |
| `GET` | `/api/commerce/orders/{orderId}` | Load an order |
| `GET/POST` | `/api/commerce/orders/{orderId}/payments` | List or create order payments |
| `GET` | `/api/commerce/payments/{paymentId}` | Load a payment |

The individual route factories remain available for projects that want
separate route files or a smaller public surface.

## Add the headless React state

```tsx
"use client";

import {
  OminityCommerceProvider,
  useOminityCommerce,
} from "@ominity/next/commerce/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <OminityCommerceProvider>{children}</OminityCommerceProvider>;
}

export function CartCount() {
  const commerce = useOminityCommerce();
  return <span>{commerce.cartCount}</span>;
}
```

The provider supplies cart refresh, country and promotion-code updates, cart
item mutations, wishlist persistence, checkout, order loading, and order
payment creation. It discards superseded responses and reads totals directly
from the backend `Cart`; frontend code does not recalculate prices, discounts,
shipping, or tax.

Creating a payment accepts the SDK request body and an optional idempotency key:

```ts
const payment = await commerce.createOrderPayment(
  String(order.id),
  {
    paymentmethodId: selectedMethod.id,
    redirectUrl: `${window.location.origin}/checkout/return`,
  },
  { idempotencyKey: crypto.randomUUID() },
);
```

## Use the server commerce client

`createCommerceClient` wraps SDK 1.4.5 operations for carts, products, offers,
cart-scoped shipping methods, shipping classes, payment methods and issuers,
orders, order payments, and payments. It accepts an adapter for testing or a
custom transport and forwards SDK `RequestOptions` for idempotency and request
control.

```ts
import { createCommerceClient } from "@ominity/next/commerce";

const commerce = createCommerceClient({
  sdk: {
    serverURL: process.env.OMINITY_API_URL ?? "",
    security: { apiKey: process.env.OMINITY_API_KEY ?? "" },
  },
});

const products = await commerce.listProducts({
  page: 1,
  limit: 24,
  filter: { published: true },
});
const offers = await commerce.listProductOffers({ productId: products[0].id });
```

The package exports `Cart`, `CartItem`, `Product`, `ProductOffer`, `Order`,
`Payment`, `ShippingMethod`, `ShippingClass`, `PaymentMethod`,
`PaymentMethodIssuer`, `CurrencyAmount`, and operation request types under their
SDK names. Package-specific names are reserved for behavior and view state,
such as `CommerceProductSelection` and `CommerceCartSnapshot`.

Debug logging recursively redacts authorization headers, cookies, passwords,
secrets, access and refresh tokens, API keys, and payment card tokens before an
event reaches a configured logger.
