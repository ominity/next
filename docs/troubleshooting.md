# Development and Troubleshooting

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

## Enable the Ominity Dev Tool

Turn on the request log route in `createOminityRouteHandlers` (it serves `/api/dev-tool/requests`), the Dev Tool
provider in `OminityProvider`, and render the bar:

```ts
// app/api/[...ominity]/route.ts
export const { GET, POST, PATCH, PUT, DELETE } = createOminityRouteHandlers({
  ...config,
  devTool: process.env.NODE_ENV !== "production",
});
```

```tsx
"use client";

import { OminityDevTool, createOminityDevToolSnapshot } from "@ominity/next/dev-tool";
import { OminityProvider } from "@ominity/next/react";

export function Providers({ children }: { children: React.ReactNode }) {
  const enabled = process.env.NODE_ENV !== "production";

  return (
    <OminityProvider
      devTool={{
        enabled,
        snapshot: createOminityDevToolSnapshot({ appName: "Storefront", environment: process.env.NODE_ENV, enabled }),
      }}
    >
      {children}
      <OminityDevTool enabled={enabled} endpoint="/api/dev-tool/requests" />
    </OminityProvider>
  );
}
```

`OminityProvider` renders `OminityDevToolProvider` for you; the customer accounts and tracking state register their
Dev Tool capability automatically. With `devTool` on, the commerce and customer-account routes log their SDK calls
in the request log. Auth calls are deliberately left out: their bodies hold passwords and tokens.

You can still pass manual props to `OminityDevTool` or call `useOminityDevToolCapability()` from an app-owned
adapter for project-specific CMS rendering, cache, forms, or spoof-user actions. Explicit bar props override
registered values, and `auth={false}` or `customer={false}` can hide those surfaces.

To capture SDK calls, pass a Dev Tool HTTP client into the SDK configuration. Add a
request context when you want the bar to group calls by the current page request,
previous page requests, or async requests triggered after the page loaded:

```ts
import {
  createOminityDevToolHttpClient,
  createOminityDevToolRequestContext,
} from "@ominity/next/dev-tool";

const requestContext = createOminityDevToolRequestContext({
  request,
  kind: "page",
  pageId: request.headers.get("x-ominity-debug-page-id") ?? undefined,
  route: "/[locale]/products/[slug]",
});

const sdkHttpClient = createOminityDevToolHttpClient({
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
- `channel`: API-key-detected current channel, locales, countries, currencies, domains, and commerce methods
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

### `useAuth must be used inside OminityProvider`

Cause: a hook from `@ominity/next/react` renders outside the provider.

Fix:

- render `OminityProvider` once, in a client component around the whole app (usually the root layout)
- `@ominity/next/auth/react` and `@ominity/next/commerce/react` no longer exist in 2.0; see
  [`docs/migration-2.0.md`](migration-2.0.md)

### Account or gateway requests return 401 right after signing in

Cause: the user has MFA. Until `verifyMfa` or `verifyRecoveryCode` completes, the session is pending and every
server route treats the browser as signed out.

Fix:

- check `useAuth().status === "mfa_required"` after `signIn` and show the MFA step
- set `auth.socialLoginMfaPath` so social sign-ins of MFA users land on the MFA page

### Cart, checkout or account requests return 403 `INVALID_ORIGIN`

Cause: the request's `Origin` does not match `siteUrl`.

Fix:

- set `siteUrl` to the origin the site is opened on, including the port in development

### A promotion code "does nothing"

Ominity drops unknown or inapplicable codes instead of refusing them. `applyPromotionCode` detects this and rejects
with `code: "PROMOTION_CODE_NOT_APPLIED"` (status 422); show that error to the shopper.

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
