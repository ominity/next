# Migrating from 1.x

2.0 replaces the per-feature browser providers, the commerce client and the separate route files with one provider,
one set of hooks and one route file. Every hook returns `@ominity/api-typescript` models as they are; the package's
own commerce and session models are gone. API keys still never reach the browser.

## 1. Update the dependencies

```bash
pnpm add @ominity/next@^2.0.0 @ominity/api-typescript@^1.6.0
```

## 2. One route file

Replace the separate route files (`app/api/auth/*`, `app/api/commerce/[[...path]]`,
`app/api/customer-accounts/[[...path]]`, `app/api/events`, `app/api/forms/submit`, `app/api/draft`,
`app/api/dev-tool/requests`, …) with:

```ts
// app/api/[...ominity]/route.ts
import { createOminityRouteHandlers } from "@ominity/next/routes";

export const { GET, POST, PATCH, PUT, DELETE } = createOminityRouteHandlers({
  ominityBaseUrl: process.env.OMINITY_API_URL,
  ominityApiKey: process.env.OMINITY_API_KEY,
  authClientId: process.env.OMINITY_AUTH_CLIENT_ID,
  authClientSecret: process.env.OMINITY_AUTH_CLIENT_SECRET,
  authSessionSecret: process.env.OMINITY_AUTH_SESSION_SECRET,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnv: process.env.NODE_ENV,
  auth: { socialLoginSuccessPath: "/account", socialLoginFailurePath: "/login", socialLoginMfaPath: "/mfa" },
  commerce: { guestCheckout: true },
});
```

The paths stay the same (`/api/auth/*`, `/api/commerce/*`, `/api/customer-accounts/*`, …) and `/api/ominity/*` (the
SDK gateway) is new. The individual commerce route factories (`createOminityCommerceCartRouteHandlers`,
`…CheckoutRouteHandlers`, `…OrderPaymentsRouteHandlers`, …) are replaced by one `createOminityCommerceRouteHandlers`,
normally used through `createOminityRouteHandlers`. `/api/commerce/payments/{id}` and the single-issuer route are gone.

## 3. One provider

```tsx
// Before
<OminityAuthProvider>
  <OminityCustomerAccountsProvider>
    <OminityCommerceProvider>
      <TrackingProvider>{children}</TrackingProvider>
    </OminityCommerceProvider>
  </OminityCustomerAccountsProvider>
</OminityAuthProvider>

// After
import { OminityProvider } from "@ominity/next/react";

<OminityProvider tracking={{ enabled: true }} customerAccounts={{ teamPageSize: 100 }} devTool={{ enabled: dev }}>
  {children}
</OminityProvider>
```

`OminityProvider` composes the SDK, auth, customer accounts, cart, wishlist and, when enabled, tracking (to
`/api/events`, with the signed-in user added) and the Dev Tool provider. Render `<OminityDevTool />` yourself.

## 4. Auth: `useOminityAuth` → `useAuth` and `useUser`

| 1.x (`@ominity/next/auth/react`) | 2.0 (`@ominity/next/react`) |
| --- | --- |
| `session` | `status`, `user` (SDK `User`), `expiresAt` |
| `signIn` → `{ session, requiresMfa, methods }` | `signIn` → `OminityAuthState`; check `status === "mfa_required"` |
| `validateMfaCode`, `validateRecoveryCode` (boolean) | `verifyMfa(method, code)`, `verifyRecoveryCode(code)` → `OminityAuthState` |
| `listMfaMethods`, `mfaMethods`, `mfaVerified` | `mfaMethods` of the pending sign-in; the user's own methods on `useUser` |
| `refreshAuth` | `refresh` |
| `loginActivity`, `listLoginActivity`, `getLoginActivity`, `useOminityLoginActivity` | `useLoginActivity()` (SDK `UserLogin`) |
| `savedAddresses`, `saveAddress`, `deleteSavedAddress` | Removed; use the customer address book, `useAddresses()` |
| — | `requestPasswordReset`, `resetPassword`, `listSocialProviders`, `socialSignInUrl` |
| — | `useUser()`: profile, MFA enable/confirm/disable, recovery codes |

The auth routes (`login`, `register`, `me`, `refresh`, `mfa/validate`, …) now answer with `OminityAuthState`
instead of `{ authenticated, session, user }`. A user with MFA gets a pending session: until the challenge is passed,
the server treats it as signed out. The `endpoints` props of the old providers are replaced by
`authBasePath` and `commerceBasePath` on `OminityProvider` (defaults `/api/auth` and `/api/commerce`).

## 5. Commerce: `useOminityCommerce` → `useCart`, `useWishlist`, `useCheckout`

| 1.x (`@ominity/next/commerce/react`) | 2.0 (`@ominity/next/react`) |
| --- | --- |
| `cartResource`, `cart` (items) | `cart` (SDK `Cart`), `items` (SDK `CartItem`) |
| `cartCount`, `cartSubtotal`, `cartDiscount`, `cartShipping`, `cartTax`, `cartTotal` | `count`; amounts on `cart` (`commerceMoneyValue(cart.totalAmount)`) |
| `addToCart(selection, quantity)` | `add(product \| productId, quantity)` |
| `setCartQuantity`, `removeFromCart`, `clearCart`, `setCartCountry`, `refreshCart` | `setQuantity`, `remove`, `clear`, `setCountry`, `refresh` |
| `applyPromotionCode`, `removePromotionCode` | Same names; an unknown code rejects with `PROMOTION_CODE_NOT_APPLIED` |
| `wishlist`, `toggleWishlist`, `removeFromWishlist`, `isWishlisted` | `useWishlist()`: `items`, `toggle`, `remove`, `has` (SDK `Product`) |
| `createOrder(input)` | `useCheckout().placeOrder({ notes, fields })`; the order is built from the cart on the server |
| `getOrderById`, `listOrderPayments`, `createOrderPayment` | `getOrder`, `listPayments`, `pay` (idempotency key added for you) |

Set the cart's email and addresses with `update(...)` before `placeOrder`. Extra order fields need the
`commerce.checkoutFields` route option.

## 6. Removed modules

- `@ominity/next/auth/react` and `@ominity/next/commerce/react`.
- `createCommerceClient`, `createCommerceCatalog`, the commerce debug logger, the commerce wrapper types
  (`CommerceProductSelection`, `CommerceCartSnapshot`, …) and the commerce mock data. Use the SDK: on the server
  with your API-key client, in the browser through the gateway (`useOminitySdk`, `useOminitySdkQuery`, …).
- The `next/commerce-cart` helpers (`getOrCreateCommerceCartSnapshot`, `updateCommerceCartAndRefresh`, …).
- Mock mode. `useMockData` (site support, auth, forms, tracking and the route config), the site support `mockClient`
  option, `getLiveCmsClient` (use `getCmsClient`) and the Dev Tool `mockData` option are gone. Every route talks to
  the configured Ominity tenant; point a development `.env` at a staging tenant instead.

`@ominity/next/commerce` now exports the pricing, routing and model helpers (`commerceMoneyValue`,
`commerceMoneyCurrency`) and the commerce events; `@ominity/next/commerce/server` exports
`createOminityCommerceRouteHandlers`.

## 7. Customer accounts

`OminityCustomerAccountsProvider` is part of `OminityProvider`; pass its props as `customerAccounts`. Read the active
account with `useCustomer`, `usePermission` and `<Can>`, and its data with `useOrders`, `useInvoices`,
`useSubscriptions`, `useSubscription` and `useAddresses`. The resource clients on
`useOminityCustomerAccounts().client` (used with `useOminityCustomerQuery`) still work but are deprecated. Team and
invitation features are unchanged on `useOminityCustomerAccounts`.

Subscription plan changes and cancellation now follow the API's quote-then-confirm flow (`quoteChange` /
`confirmChange`, `quoteCancellation` / `confirmCancellation`); the transition-products route is deprecated and may
answer 410.
