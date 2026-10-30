# The Ominity SDK in the browser

`@ominity/next/sdk` lets client components use `@ominity/api-typescript` exactly as documented, the same way the PHP
and Laravel packages expose their SDK: configure it once, then call any SDK method. New SDK endpoints are available as
soon as the SDK is updated; nothing has to be added to this package.

This is also how the hooks in `@ominity/next/react` work: `useUser`, `useLoginActivity`, `useOrders`,
`useInvoices`, `useSubscriptions` and `useAddresses` are SDK calls through this gateway and return the SDK's own
models. Whatever has no dedicated hook, call the SDK directly with the hooks below.

The browser never holds a credential. Its SDK talks to a gateway route in your app, which checks the route against an
allowlist and forwards it to Ominity with the signed-in user's OAuth access token from the encrypted, HttpOnly session
cookie. The server API key never leaves the server.

```
browser SDK ──▶ /api/ominity/v1/… (your app) ──▶ https://<tenant>/api/v1/…
  no credentials     allowlist, membership check,     user access token,
                     origin check, headers            channel, language, client IP
```

## Add the gateway route

`createOminityRouteHandlers` from `@ominity/next/routes` already serves the gateway at `/api/ominity`, together with
every other package route; pass its options as `sdkGateway: { rules, denyRules, maxBodyBytes, membershipCacheSeconds }`,
or `sdkGateway: false` to switch it off. On its own:

```ts
// app/api/ominity/[...path]/route.ts
import { createOminitySdkGatewayRouteHandlers } from "@ominity/next/sdk/server";

export const { GET, POST, PATCH, PUT, DELETE } = createOminitySdkGatewayRouteHandlers({
  ominityBaseUrl: process.env.OMINITY_API_URL,
  channelId: process.env.OMINITY_CHANNEL_ID,
  authSessionSecret: process.env.OMINITY_AUTH_SESSION_SECRET,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnv: process.env.NODE_ENV,
});
```

The config extends the auth route config, so pass the same session secret and cookie name as your auth routes.

For every request the gateway:

- only accepts paths matching an allowed rule (403 `ROUTE_NOT_ALLOWED` otherwise);
- requires a signed-in user for `user` rules (401 `UNAUTHENTICATED`). An expired session is treated as signed out,
  like the auth `me` route;
- checks `{self}` against the session's user (403 `USER_ACCESS_DENIED`);
- confirms through Ominity that the user belongs to each `{customer}` in the path, cached for 60 seconds per access
  token (403 `CUSTOMER_ACCESS_DENIED`). The Ominity API then checks the user's customer permissions itself;
- refuses cross-site writes (403 `INVALID_ORIGIN`) and bodies over 1 MiB (413 `PAYLOAD_TOO_LARGE`);
- sends only `Accept`, `Content-Type`, `Idempotency-Key`, the resolved language, the configured channel, the client IP
  and the credential. Browser cookies and any `Authorization` header are dropped;
- returns the status and body unchanged with `Cache-Control: private, no-store`, keeping only `Content-Type`,
  `Content-Disposition`, `Deprecation`, `Sunset` and `Retry-After`.

Gateway refusals use the Ominity API's error shape, so the SDK raises them like any API error.

### Allowed routes

Rules match the path after the API version. `{self}` is the signed-in user's id, `{customer}` a customer the user
belongs to, `*` one segment and `**` one or more segments.

| Default rule | Methods |
|---|---|
| `me` | `GET` |
| `users/{self}` | `GET`, `PATCH` |
| `users/{self}/**` (except `users/{self}/token`) | all |
| `commerce/customers/{customer}` | `GET`, `PATCH` |
| `commerce/customers/{customer}/**` | all |
| `commerce/customers/users/permissions`, `…/users/roles[/*]` | `GET` |

Everything a customer does in their own account is covered, including endpoints added to the SDK later, e.g. the
subscription plan changes and cancellation. Store-wide routes such as `commerce/orders` or `commerce/invoices` are
not, because they are admin routes.

Extend the defaults by spreading them:

```ts
import {
  OMINITY_SDK_GATEWAY_DEFAULT_RULES,
  createOminitySdkGatewayRouteHandlers,
} from "@ominity/next/sdk/server";

createOminitySdkGatewayRouteHandlers({
  ...config,
  ominityApiKey: process.env.OMINITY_API_KEY,
  rules: [
    ...OMINITY_SDK_GATEWAY_DEFAULT_RULES,
    { path: "commerce/products", methods: ["GET"], access: "public" },
    { path: "commerce/products/*", methods: ["GET"], access: "public" },
  ],
});
```

A `public` rule also serves anonymous visitors, using the server API key for them. Only use it for data every visitor
may see, and keep it to `GET`: the API key has admin rights. Rules containing `{self}` or `{customer}` always need a
signed-in user. `denyRules` (default `OMINITY_SDK_GATEWAY_DEFAULT_DENY_RULES`) are checked before `rules`.

Other options: `basePath` (default `/api/ominity`), `maxBodyBytes`, `membershipCacheSeconds`, `resolveLanguage`, and
`resolveSession` to supply the access token from a custom auth setup.

## Use the SDK in client components

`useOminitySdk()` returns the plain SDK. It uses `/api/ominity` on the current origin; `OminityProvider` takes the
browser SDK options (`basePath`, `origin`, `language`, `timeoutMs`, `retryConfig`, `fetch`) as `sdk`:

```tsx
"use client";

import { OminityProvider } from "@ominity/next/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <OminityProvider sdk={{ basePath: "/api/ominity" }}>{children}</OminityProvider>;
}
```

The hooks are exported from `@ominity/next/react` and `@ominity/next/sdk/react`. `OminitySdkProvider` from
`@ominity/next/sdk/react` provides only the SDK, for apps that do not use `OminityProvider`, and can take your own
instance as `sdk`. Outside React, `createOminityBrowserSdk(options)` from `@ominity/next/sdk` creates the same
instance.

### Queries

`useOminitySdkQuery(loader, { key })` loads data with `loading`, `ready`, `error` and `refresh`. It reloads when `key`
changes (compared by value), cancels the superseded request when you pass `signal` to the SDK call, and never returns
data loaded for a previous key.

```tsx
const subscription = useOminitySdkQuery(
  (sdk, { signal }) => sdk.commerce.customerSubscriptions.get({ customerId, id }, { signal }),
  { key: [customerId, id] },
);
```

### Paginated lists

`useOminitySdkPaginatedQuery` passes `page` and `limit` to the loader and returns `items`, `page`, `count`,
`totalPages`, `hasNext`, `hasPrevious`, `setPage`, `next`, `previous`, `loadMore` and `refresh`. While the next page
loads, the current one stays shown.

```tsx
const orders = useOminitySdkPaginatedQuery(
  (sdk, { page, limit, signal }) => sdk.commerce.customerOrders.list(
    { customerId, page, limit, sort: "-createdAt" },
    { signal },
  ),
  { key: [customerId], pageSize: 25 },
);

// mode: "append" adds each page to `items` for "load more" lists, with `loadingMore` while it loads.
```

### Mutations

`useOminitySdkMutation(action, { onSuccess, onError })` returns `execute`, `pending`, `data`, `error` and `reset`.

```tsx
const quote = useOminitySdkMutation((sdk, toOfferId: number) =>
  sdk.commerce.customerSubscriptions.quoteChange({ customerId, subscriptionId, data: { toOfferId } }));

await quote.execute(12);
```

### The active customer

Inside `OminityProvider`, the customer variants insert the active customer ID, wait until it is known,
reload after an account switch without showing the previous customer's data, and can require customer permissions
as an early UI check.

```tsx
import {
  CUSTOMER_PERMISSIONS,
  useOminityCustomerSdkMutation,
  useOminityCustomerSdkPaginatedQuery,
  useOminityCustomerSdkQuery,
} from "@ominity/next/react";

const subscriptions = useOminityCustomerSdkPaginatedQuery(
  (sdk, { customerId, page, limit, signal }) =>
    sdk.commerce.customerSubscriptions.list({ customerId, page, limit, include: "product" }, { signal }),
  { permission: CUSTOMER_PERMISSIONS.subscriptionsView },
);

const transitions = useOminityCustomerSdkQuery(
  (sdk, { customerId, signal }) =>
    sdk.commerce.customerSubscriptions.listTransitions({ customerId, subscriptionId }, { signal }),
  { key: [subscriptionId] },
);

const quoteCancellation = useOminityCustomerSdkMutation((sdk, subscriptionId: number, { customerId }) =>
  sdk.commerce.customerSubscriptions.cancel({ customerId, subscriptionId }));
```

## Errors

Hooks report errors as `OminityActionError` (`status`, `code`, `fields`, `isValidationError`, …).
`toOminitySdkError(error)` from `@ominity/next/sdk` does the same for direct SDK calls. `code` is the API's
machine-readable reason when it sends one, such as `subscription.next_period_locked`; otherwise it follows the status
(`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, …) or names the gateway refusal
(`ROUTE_NOT_ALLOWED`, `CUSTOMER_ACCESS_DENIED`, …). Network failures have status `0`.
