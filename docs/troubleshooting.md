# Debugging and Troubleshooting

## Enable client debug logs

```ts
const client = createCmsClient({
  sdk: { /* ... */ },
  debug: {
    enabled: true,
  },
});
```

Debug logs include endpoint, query payload, and normalization milestones.

## Enable the debug bar

Create a debug route that exposes the captured SDK calls:

```ts
// app/api/debug/sdk-requests/route.ts
import { createOminityDebugRouteHandlers } from "@ominity/next/debug";

export const { GET, DELETE } = createOminityDebugRouteHandlers({
  enabled: process.env.NODE_ENV !== "production",
});
```

Render the bar from a client component:

```tsx
"use client";

import { OminityDebugBar } from "@ominity/next/debug";
import { useOminityAuth } from "@ominity/next/auth/react";
import { useOminityCustomerAccounts } from "@ominity/next/customer-accounts/react";

export function OminityDebugTools() {
  const auth = useOminityAuth();
  const customer = useOminityCustomerAccounts();

  return (
    <OminityDebugBar
      enabled={process.env.NODE_ENV !== "production"}
      integration={{
        appName: "Storefront",
        environment: process.env.NODE_ENV,
        debugBar: true,
      }}
      health={{
        mode: "live",
        environment: process.env.NODE_ENV,
        apiUrl: process.env.NEXT_PUBLIC_OMINITY_API_URL,
        localeSegmentStrategy: "language",
        checks: [
          { label: "API URL", status: "enabled" },
          { label: "Channel", status: "unknown", severity: "warning" },
        ],
      }}
      auth={{
        ready: auth.ready,
        authenticated: !!auth.session,
        session: auth.session,
        mfaVerified: auth.mfaVerified,
        mfaMethods: auth.mfaMethods,
        savedAddressCount: auth.savedAddresses.length,
        actions: {
          refresh: auth.refreshAuth,
          signIn: auth.signIn,
          signOut: auth.signOut,
        },
      }}
      customer={{
        ready: customer.ready,
        loading: customer.loading,
        activeCustomerId: customer.activeCustomerId,
        activeMembership: customer.activeMembership,
        memberships: customer.memberships,
        memberCount: customer.members?.count,
        invitationCount: customer.invitations?.count,
        pendingMutations: Array.from(customer.pendingMutations),
        actions: {
          refresh: customer.refreshContext,
          switchCustomer: customer.switchCustomer,
        },
      }}
      rendering={{
        nextRoute: "/[locale]/products/[slug]",
        incomingPath: "/en/products/desk-lamp",
        resolvedCmsPath: "/products/desk-lamp",
        cmsPage: {
          id: "page_123",
          slug: "desk-lamp",
          locale: "en",
          status: "published",
        },
      }}
      cache={{
        enabled: true,
        routeRevalidateSeconds: 300,
        entries: [
          {
            key: "cms:routes:en",
            resource: "routes",
            status: "hit",
            scope: "memory",
          },
        ],
      }}
      commerce={{
        visitorId: "visitor-id",
        cartId: "cart-id",
        currency: "EUR",
        country: "BE",
      }}
      forms={{
        submissionEndpoint: "/api/forms/submit",
        uploadPresignEndpoint: "/api/forms/uploads/presign",
      }}
      tracking={{
        visitorId: "visitor-id",
        proxyEndpoint: "/api/omt",
      }}
    />
  );
}
```

To capture SDK calls, pass a debug HTTP client into the SDK configuration. Add a
request context when you want the bar to group calls by the current page request,
previous page requests, or async requests triggered after the page loaded:

```ts
import {
  createOminityDebugHttpClient,
  createOminityDebugRequestContext,
} from "@ominity/next/debug";

const requestContext = createOminityDebugRequestContext({
  request,
  kind: "page",
  pageId: request.headers.get("x-ominity-debug-page-id") ?? undefined,
  route: "/[locale]/products/[slug]",
});

const sdkHttpClient = createOminityDebugHttpClient({
  source: "cms",
  requestContext,
});
```

The auth tab can render a spoof/impersonation form, but it only calls
`auth.actions.spoofUser` when the application provides that callback. Keep that
callback behind a dev-only, server-side route; never expose the Ominity
super-admin API key to the browser.

Supported debug surfaces:

- `integration`: package versions, app, environment, runtime, API URL, flags
- `health`: env/config checks, missing variables, unsafe setup warnings
- `channel`: detected or configured channel, locales, countries, currencies
- `rendering`: matched route, resolved CMS path, canonical redirect, page model, component tree, permission checks
- `cache`: cache hits/misses, resource timestamps, ISR/revalidate state
- `auth` and `customer`: session, MFA, login activity, memberships, switching, dev-only sign-in/spoof callbacks
- `commerce`: visitor/cart IDs, country/currency, totals, promotions, shipping/payment methods
- `forms`: rendered forms, submission endpoints, reCAPTCHA, metadata, validation/submission errors, uploads
- `tracking`: visitor/session IDs, page origin relation, queued/sent/failed events, proxy/client-IP diagnostics
- `utilities`: body preview limit, redacted headers, preserve logs setting, export/copy snapshot, live-update pause, optional cache/recording actions

## Common issues

### Missing component output

Cause: CMS component key is not registered.

Fix:

- verify registry keys match CMS keys exactly
- set renderer `missingComponent: "throw"` during development

### Nested field not rendering

Cause: value is a plain object without nested CMS component markers.

Fix:

- inspect normalized page payload
- ensure nested component values are delivered as `page_content_component` or component-like payloads

### Wrong canonical redirect

Cause: route strategy or locale list mismatch.

Fix:

- verify `localeSegmentStrategy`
- verify locale codes (`nl-BE` vs `nl-be`)
- verify route translation map contains expected localized slug

### Metadata alternates incomplete

Cause: translation paths missing on page model.

Fix:

- ensure `CmsPage.translations` is filled by your CMS endpoint/normalizer
- set `includeAlternates: true`
- pass `routing` into `buildNextMetadataFromPage` so alternates follow `OMINITY_LOCALE_SEGMENT_STRATEGY`
- for `country-language` cartesian alternates, also pass `alternateLanguages` and `alternateCountries`

### Forms do not submit

Cause: missing submit route or missing API credentials.

Fix:

- verify `/api/forms/submit` route is wired with `createOminityFormSubmitHandler`
- verify `OMINITY_API_KEY` / API base URL env vars
- if using reCAPTCHA, verify form field options expose a valid site key and backend verification is configured in Ominity CMS

### Forms render but custom UI is ignored

Cause: component overrides not passed correctly.

Fix:

- map overrides with `createShadcnFormComponents`
- pass the result via `components` prop on `FormRenderer`
- ensure prop signatures are compatible with standard HTML input props

### Auth session cookie cannot be read

Cause: signed cookie secret mismatch or missing `sessionSecret`.

Fix:

- use the same `sessionSecret` for both write/read paths
- ensure secret length is at least 32 characters
- if using unsigned cookies for local testing, set `allowUnsigned: true` explicitly

### OAuth2 or MFA calls fail unexpectedly

Cause: wrong API credentials, channel, or auth context for protected endpoints.

Fix:

- verify SDK `security` configuration (API key / bearer security)
- verify endpoint context (`/oauth2/*` vs `/users/*`)
- enable auth debug logs on `createAuthClient({ debug: { enabled: true } })`

## Typed errors

Primary error classes:

- `CmsClientError`
- `CmsNormalizationError`
- `CmsRouteResolutionError`
- `CmsRegistryError`
- `CmsRenderError`
- `AuthClientError`

All include consistent `code` values for observability and alerting.
