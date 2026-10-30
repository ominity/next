# `@ominity/next`

Production-ready Next.js App Router integration layer for Ominity CMS.

`@ominity/next` is intentionally split into reusable concerns:

- **CMS integration**: routing and rendering around the models owned by `@ominity/api-typescript`
- **Rendering engine**: generic, recursive CMS component rendering with a project-owned component registry
- **Next helpers**: route resolution, static params, metadata, sitemap, and draft mode utilities
- **Browser hooks**: one `OminityProvider` and hooks for sign-in, the user's settings, customer accounts, cart,
  checkout, wishlist, orders, invoices, subscriptions and addresses, all returning `@ominity/api-typescript` models
- **Server routes**: one App Router catch-all for auth, commerce, customer accounts, the browser SDK gateway, tracking,
  forms, draft mode and the Dev Tool
- **Actions**: validated server handlers plus headless request, resource, query, and mutation helpers

This package does **not** include project UI components. Each consuming website owns its own React components and visual design.

## Why this package exists

CMS-driven websites often need the same foundation repeatedly:

- fetch CMS pages/routes/menus/locales
- resolve translated slugs and locale-aware URLs
- render deeply nested CMS component trees
- keep pages server-first while allowing interactive client blocks
- support SSG, ISR, and SSR without rewriting integration logic per project

`@ominity/next` provides that foundation with explicit APIs and small, testable modules.

## Install

```bash
pnpm add @ominity/next @ominity/api-typescript@^1.6.0
```

If you use forms rendering, also install:

```bash
pnpm add react-hook-form
```

Peer dependencies:

- `@ominity/api-typescript` `^1.6.0`
- `next` `^15 || ^16`
- `react` `^18 || ^19`
- `react-dom` `^18 || ^19`

Upgrading from 1.x? See [`docs/migration-2.0.md`](docs/migration-2.0.md).

## Quick start

### 1) Create channel-aware site support

```ts
import { createOminitySiteSupport } from "@ominity/next/next";

export const siteSupport = createOminitySiteSupport({
  getConfig: () => ({
    apiUrl: process.env.OMINITY_API_URL,
    apiKey: process.env.OMINITY_API_KEY,
    debugLogs: process.env.NODE_ENV !== "production",
    localeSegmentStrategy: "language",
    canonicalRedirectPolicy: "if-not-canonical",
    stringLinkStrategy: "localize-relative",
    trailingSlash: false,
    basePath: "",
  }),
});

export const cmsClient = siteSupport.getCmsClient();
```

The API key identifies the current channel through `/channels/current`.
`siteSupport.getChannelContext()` and
`siteSupport.getChannelAwareCmsRouting()` use its languages, countries,
currencies, and defaults as their source of truth.

### 2) Define your project registry

```ts
import { createCmsRegistry, defineCmsComponent } from "@ominity/next/cms/rendering";

import { HeroBlock } from "@/components/cms/hero-block";
import { CarouselBlock } from "@/components/cms/carousel-block"; // can be a Client Component

export const cmsRegistry = createCmsRegistry([
  defineCmsComponent("hero", HeroBlock),
  defineCmsComponent("carousel", CarouselBlock),
]);
```

### 3) Resolve route + render page in App Router

```tsx
import { fetchCmsPageForParams } from "@ominity/next/next";
import { renderCmsPage } from "@ominity/next/cms/rendering";

import { cmsClient, siteSupport } from "@/lib/ominity";
import { cmsRegistry } from "@/lib/cms-registry";

export default async function CmsCatchAllPage({ params }: { params: { slug?: string[] } }) {
  const routing = await siteSupport.getChannelAwareCmsRouting();
  const routes = await cmsClient.getRoutes();
  const resolved = await fetchCmsPageForParams({
    client: cmsClient,
    routes,
    params,
    routing,
  });

  if (!resolved) {
    return null;
  }

  if (resolved.route.shouldRedirect) {
    // optional: redirect(resolved.route.canonicalPath)
  }

  return renderCmsPage({
    page: resolved.page,
    registry: cmsRegistry,
    context: {
      page: resolved.page,
      locale: resolved.route.locale,
      path: resolved.route.incomingPath,
      preview: false,
      debug: false,
    },
  });
}
```

## SSG / ISR / SSR

This package does not force one rendering mode.

- Use `generateCmsStaticParams` for SSG path generation.
- Use Next route-level `revalidate` for ISR.
- Use dynamic rendering when SSR is required.

Client Components can be nested inside rendered CMS pages without making the whole route client-rendered.

## One route file for every server route

`@ominity/next/routes` mounts every browser-facing package route from a single App Router catch-all, configured
once, the way the Laravel package registers its routes:

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
  draftToken: process.env.OMINITY_DRAFT_TOKEN,
  auth: { socialLoginSuccessPath: "/account", socialLoginFailurePath: "/login", socialLoginMfaPath: "/mfa" },
  commerce: { guestCheckout: true, paymentMethodsLimit: 100 },
  devTool: process.env.NODE_ENV !== "production",
});
```

| Path | Feature | Options |
| --- | --- | --- |
| `/api/auth/*` | sign-in, registration, MFA, password reset, session, login activity, social login | `auth: { socialLoginSuccessPath, socialLoginFailurePath, socialLoginMfaPath }` |
| `/api/commerce/*` | cart, checkout, shipping and payment methods, order payments | `commerce: { guestCheckout, checkoutFields, paymentMethodsLimit, resolveCountry, cartCookieName, cartCookieMaxAgeSeconds }` |
| `/api/customer-accounts/*` | account context, switching, team and invitations | `customerAccounts`, plus `activeCustomerCookieName`, `invitationAcceptPath`, `resolveInvitationAcceptUrl` |
| `/api/ominity/*` | the browser SDK gateway | `sdkGateway: { rules, denyRules, maxBodyBytes, membershipCacheSeconds }` |
| `/api/events` | visitor tracking | `tracking: { enabled, debug, enrichEvent, … }` |
| `/api/forms/submit` | CMS form submissions | `forms: { recaptchaSecret, formsValidateFormId, … }` |
| `/api/draft` | draft mode for CMS previews | `draftToken` |
| `/api/dev-tool/requests` | the Ominity Dev Tool request log | `devTool: true` |

Set a feature to `false` to switch it off; its paths then answer 404. `basePath` (default `/api`) moves all of them.
The shared options are the auth route options: `ominityBaseUrl`, `ominityApiKey`, `channelId`, `authClientId`,
`authClientSecret`, `authScope`, `authSessionSecret`, `authCookieName`, `authCookieMaxAgeSeconds`, `siteUrl`,
`nodeEnv`, `resolveLanguage`, `loginActivityEnabled`, `onLoginActivityError` and `debugEnabled`.

With `devTool` on, the SDK calls of the commerce and customer-account routes appear in the Dev Tool request log. Auth
calls deliberately do not: their bodies hold passwords and tokens.

## One provider and hooks for the browser

`@ominity/next/react` is the single browser entry point. Render `OminityProvider` once:

```tsx
"use client";

import { OminityProvider } from "@ominity/next/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <OminityProvider tracking={{ enabled: true }} customerAccounts={{ teamPageSize: 100 }}>
      {children}
    </OminityProvider>
  );
}
```

It composes the browser SDK, auth state, customer accounts, cart, wishlist and, when enabled, tracking and the Dev
Tool provider. Its props: `sdk` (browser SDK options), `authBasePath`, `commerceBasePath`, `customerAccounts`,
`wishlistStorageKey`, `tracking` and `devTool`.

Every value the hooks return and every request they make uses the `@ominity/api-typescript` SDK's own types (`User`,
`Cart`, `CartItem`, `Product`, `Order`, `Invoice`, `Subscription`, `SubscriptionChange`, …); the package defines no
wrapper models. Anything without a dedicated hook is done with the SDK itself through `useOminitySdk` and the query
hooks, via the `/api/ominity` gateway. API keys never reach the browser.

| Hook | |
| --- | --- |
| `useAuth` | Sign-in, registration, MFA challenge, password reset, social sign-in ([`docs/auth.md`](docs/auth.md)) |
| `useUser`, `useLoginActivity` | The user's profile, MFA methods, recovery codes and sign-in history |
| `useCustomer`, `usePermission`, `<Can>` | The active customer account and permission checks ([`docs/customer-accounts.md`](docs/customer-accounts.md)) |
| `useCart`, `useWishlist`, `useCheckout` | Cart, promotion codes, wishlist, checkout and payment ([`docs/commerce.md`](docs/commerce.md)) |
| `useOrders`, `useInvoices`, `useSubscriptions`, `useSubscription`, `useAddresses` | The active account's resources |
| `useOminitySdk`, `useOminitySdkQuery`, `useOminityCustomerSdkQuery`, … | The SDK itself ([`docs/sdk.md`](docs/sdk.md)) |

```tsx
"use client";

import { useAuth, useCart } from "@ominity/next/react";

export function HeaderStatus() {
  const auth = useAuth();
  const cart = useCart();

  return (
    <p>
      {auth.user ? `Hi ${auth.user.firstName}` : "Not signed in"} · {cart.count} in cart
    </p>
  );
}
```

## Auth

Sign-in runs on the server: the auth routes keep OAuth tokens in an encrypted HttpOnly session cookie and return
only `OminityAuthState` (`anonymous`, `mfa_required` with the methods, or `authenticated` with the SDK `User`). A
password or social sign-in of a user with MFA stays pending, and unusable on every server route, until
`verifyMfa` or `verifyRecoveryCode` completes it.

```tsx
const auth = useAuth();
const state = await auth.signIn({ email, password });
if (state.status === "mfa_required") await auth.verifyMfa("totp", code);
```

For custom server flows, `@ominity/next/auth` keeps `createAuthClient` (OAuth2 grants, MFA, recovery codes, login
activity, password reset), the signed-session helpers and `createOminityUserAccessSdk`; `@ominity/next/auth/server`
exports each auth route factory separately. See [`docs/auth.md`](docs/auth.md).

## Customer accounts and teams

A signed-in user belongs to one or more customer accounts (SDK `CustomerUser` memberships). `useCustomer` lists them
and switches the active one, which the server validates and keeps in an HttpOnly cookie. `useOrders`, `useInvoices`,
`useSubscriptions` (with quote-then-confirm plan changes and cancellation) and `useAddresses` read the active
account's data through the SDK gateway with the user's own token. Team members, invitations and roles stay on
`useOminityCustomerAccounts`. See [`docs/customer-accounts.md`](docs/customer-accounts.md).

## The SDK in client components

`@ominity/next/sdk` lets client components call `@ominity/api-typescript` as is, so every SDK endpoint is available
without wrapper code in this package. The gateway at `/api/ominity` forwards the browser's SDK requests to Ominity with
the signed-in user's access token from the encrypted session, after checking them against an allowlist (the user's
own account and the customers they belong to by default). No credential ever reaches the browser.

```tsx
"use client";

import { useOminityCustomerSdkPaginatedQuery } from "@ominity/next/react";

const payments = useOminityCustomerSdkPaginatedQuery(
  (sdk, { customerId, page, limit, signal }) =>
    sdk.commerce.customerPayments.list({ customerId, page, limit }, { signal }),
);
```

The query, paginated query (pages or "load more") and mutation hooks have variants for the active customer. See
[`docs/sdk.md`](docs/sdk.md).

## Commerce

The cart lives on the server, in an HttpOnly cookie, and the browser can only set the shopper's fields (email,
company, addresses, shipping method, country, currency, promotion codes). Signing in attaches the cart to the user and
the active customer after the membership is verified. Checkout builds the order from the cart on the server; the
browser sends only notes and the configured `checkoutFields`. Orders can only be read by the browser that placed them
or by the signed-in customer, and mandate payments are checked against that customer. Totals, discounts, shipping and
tax come from the SDK `Cart`; nothing is recalculated.

```tsx
const cart = useCart();
await cart.add(product, 2);
await cart.applyPromotionCode("WELCOME10"); // rejects with code PROMOTION_CODE_NOT_APPLIED when Ominity drops it

const checkout = useCheckout();
const order = await checkout.placeOrder({ notes });
const payment = await checkout.pay(order.id, { paymentmethodId, redirectUrl });
```

`@ominity/next/commerce` has the pricing (`resolveCommerceProductPrice`), routing and money helpers
(`commerceMoneyValue`, `commerceMoneyCurrency`) and the commerce events. Catalog data comes from the SDK. See
[`docs/commerce.md`](docs/commerce.md).

## Actions and resource helpers

`@ominity/next/actions/server` creates typed App Router actions with Standard
Schema validation, normalized safe errors, no-store responses, origin checks,
and optional idempotency handling. Choose the server-only API-key,
authenticated-user, or active-customer factory. Customer actions can require
one, any, or every role-derived customer permission before executing the exact
SDK call defined by the project.

`@ominity/next/actions` provides a same-origin request helper and a conventional
typed CRUD client. `@ominity/next/actions/react` adds headless query and mutation
state with cancellation and stale-response handling. See
[`docs/actions.md`](docs/actions.md) for route, validation, permission, client,
and React examples.

## SEO and sitemaps

`@ominity/next/seo` provides reusable helpers for CMS sitemaps, sitemap XML,
Organization/WebSite/CreativeWork/Breadcrumb JSON-LD, FAQ extraction, and safe
JSON-LD serialization. Pass `siteSupport.getSupportedLocales()` to
`buildCmsSitemap` to emit the active languages configured on the current
channel.

## Locale-aware links

`createCmsLinkResolver` accepts route objects or string links.

Built-in route defaults:

- `page` → `/{locale?}/{slug}`
- `product` → `/{locale?}/p/{sku}-{slug}` (prefix configurable)
- `category` → `/{locale?}/c/{slug}` (hierarchical slugs supported, prefix configurable)

Example route object:

```ts
{
  resource: "route",
  name: "page",
  locale: "en",
  parameters: {
    id: 2,
    slug: "contact-us"
  }
}
```

You can override link generation per route type with custom resolvers.
You can also override the built-in product/category prefixes with `defaultRoutePrefixes`.

## Localized slugs for hard-coded pages

For non-CMS routes (for example `/auth/login`), you can keep slug translations in JSON-style maps and let `@ominity/next` resolve canonical locale paths and alternates:

```ts
import {
  buildLocalizedSlugAlternates,
  buildLocalizedStaticPath,
} from "@ominity/next/next";

const slugByLocale = {
  en: "login",
  nl: "inloggen",
};

const canonicalPath = buildLocalizedStaticPath({
  routing,
  locale: "nl",
  prefixPath: "/auth",
  slugByLocale,
});
// -> /nl/auth/inloggen (depends on locale strategy)

const { alternates } = buildLocalizedSlugAlternates({
  routing,
  locale: "nl",
  prefixPath: "/auth",
  slugByLocale,
  baseUrl: "https://www.example.com",
});
```

These helpers use your configured/routing locales as the source of truth and gracefully fall back from locale code (e.g. `nl-BE`) to language code (e.g. `nl`) when needed.

`buildLocalizedSlugAlternates` is strategy-aware:

- `language`: emits language-only `hreflang` keys (`en`, `nl`, ...)
- `country-language`: emits country-language keys (`en-BE`, `nl-BE`, ...) and can expand all combinations with:

```ts
const { alternates } = buildLocalizedSlugAlternates({
  routing,
  locale: "nl-BE",
  slugByLocale,
  countries: ["BE", "NL"],
  languages: ["en", "nl"],
});
```

For CMS pages, `buildNextMetadataFromPage` accepts the same routing-aware inputs via:

- `routing`
- `alternateLanguages`
- `alternateCountries`

## Localized route templates

For routes that need nested static paths or placeholders, use localized templates instead of simple slug maps.

Examples:

- `payment`: `"checkout/payment"` or `"something/checkout/payment"`
- `product`: `"p/{sku}-{slug}"`
- `category`: `"c/{slug}"`

```ts
import {
  buildLocalizedRouteAlternates,
  buildLocalizedRoutePath,
} from "@ominity/next/next";

const paymentPath = buildLocalizedRoutePath({
  routing,
  locale: "nl",
  templateByLocale: {
    en: "checkout/payment",
    nl: "afrekenen/betalen",
  },
});
// -> /nl/afrekenen/betalen (depends on locale strategy)

const productPath = buildLocalizedRoutePath({
  routing,
  locale: "nl",
  templateByLocale: {
    en: "p/{sku}-{slug}",
    nl: "product/{sku}-{slug}",
  },
  params: {
    sku: "ABC-123",
    slug: "fiets-band",
  },
});
// -> /nl/product/ABC-123-fiets-band

const { alternates } = buildLocalizedRouteAlternates({
  routing,
  locale: "nl",
  templateByLocale: {
    en: "checkout/payment",
    nl: "afrekenen/betalen",
  },
  baseUrl: "https://www.example.com",
});
```

Template notes:

- `{param}` supports strings, numbers, and arrays (arrays expand as hierarchical segments when the segment is exactly `{param}`).
- Mixed segments like `{sku}-{slug}` require scalar values.

## next-intl bridge

`@ominity/next` now exposes `next-intl` APIs through `@ominity/next/intl`:

```ts
import {
  NextIntlClientProvider,
  defineRouting,
  useTranslations,
} from "@ominity/next/intl";
```

This lets starter projects consume `next-intl` via `@ominity/next` without adding a separate direct dependency first.

## Forms module (new)

`@ominity/next/forms` provides the lounge-depot forms builder capabilities as a reusable package module:

- `FormRenderer` client component for Ominity form definitions
- `createOminityFormSubmitHandler` server route helper
- route factories for submit/upload/update endpoints
- built-in themes (`tailwindDefaultTheme`, `unstyledTheme`, `loungeDepotFormTheme`)
- `createFormsClient` with response normalization + optional adapter integration
- `createShadcnFormAdapters` / `createShadcnFormComponents` helper for shadcn UI wiring

Example:

```tsx
"use client";

import { FormRenderer, tailwindDefaultTheme } from "@ominity/next/forms";

export function ContactForm({ form }: { form: unknown }) {
  return (
    <FormRenderer
      form={form}
      styled
      themeOverride={tailwindDefaultTheme}
      defaultPhoneCountry="BE"
    />
  );
}
```

```ts
import { createOminityFormSubmitHandler } from "@ominity/next/forms";

const handler = createOminityFormSubmitHandler({
  ominityApiKey: process.env.OMINITY_API_KEY ?? "",
  ominityBaseUrl: process.env.OMINITY_API_URL,
});

export const POST = (request: Request) => handler(request);
```

For lower-code App Router wiring, the package also exposes route factories:

```ts
import { createOminityFormSubmitRouteHandler } from "@ominity/next/forms";

export const POST = createOminityFormSubmitRouteHandler({
  ominityApiKey: process.env.OMINITY_API_KEY,
  ominityBaseUrl: process.env.OMINITY_API_URL,
});
```

## Visitor tracking

`OminityProvider` tracks visitors through the `/api/events` route of `createOminityRouteHandlers` when
`tracking={{ enabled: true }}`, and adds the signed-in user to every event. The proxy forwards events with the API key
on the server, so browser tracking and server-side SDK calls can share one UUID `visitorId`.

To use a different path, or tracking without `OminityProvider`, mount the proxy and the provider yourself. A short
neutral path such as `/api/omt` is less likely to be filtered than direct third-party analytics requests:

```ts
// app/api/omt/route.ts
import { createOminityTrackingProxyRouteHandlers } from "@ominity/next/tracking/proxy";

export const { GET, POST } = createOminityTrackingProxyRouteHandlers({
  ominityApiKey: process.env.OMINITY_API_KEY,
  ominityBaseUrl: process.env.OMINITY_API_URL,
  enabled: process.env.OMINITY_TRACKING_ENABLED !== "false",
  debug: process.env.OMINITY_DEBUG_LOGS === "true",
});
```

```tsx
<OminityProvider tracking={{ enabled: true, endpoint: "/api/omt" }}>{children}</OminityProvider>

// or, on its own:
import { TrackingProvider } from "@ominity/next/tracking/provider";

<TrackingProvider endpoint="/api/omt">{children}</TrackingProvider>
```

A route handler or server action can read (or set) the same visitor id and pass it to the SDK:

```ts
import { Ominity } from "@ominity/api-typescript";
import { ensureVisitorIdCookie } from "@ominity/next/tracking";
import { cookies } from "next/headers";

const visitorId = ensureVisitorIdCookie(await cookies());

const sdk = new Ominity({
  serverURL: process.env.OMINITY_API_URL ?? "",
  security: { apiKey: process.env.OMINITY_API_KEY ?? "" },
});

await sdk.tracking.events.track({
  event: "page_view",
  url: "https://shop.example.com/products/desk-lamp",
  visitorId,
});
```

`TrackingProvider` automatically tracks:

- `page_view` on initial render and App Router navigation
- `session_start` once per browser tab/session
- `scroll_depth` at `25/50/75/100`
- `outbound_click` for external links
- `file_download` for download/file links
- `form_submit` for native form submissions

The proxy forwards the original browser IP headers to Ominity, and the tracking controller can resolve them explicitly. This avoids storing the Next server IP when events are proxied server-to-server.

If a page originates from an Ominity resource such as a CMS page or product, register that page context once so every auto-tracked event on the page carries a stable backend relation:

```tsx
import { TrackingPageMetadata } from "@ominity/next/tracking/provider";

<TrackingPageMetadata
  origin={page}
  originOptions={{
    locale: "en",
    path: "/about",
    canonicalPath: "/en/about",
    route: {
      resource: "route",
      name: "page",
      locale: "en",
      parameters: {
        id: page.id,
        slug: page.slug,
      },
    },
  }}
/>
```

This adds `origin_resource` metadata to the emitted event payloads.

It also supports opt-in custom click events via `data-ominity-event`:

```tsx
<button
  data-ominity-event="button_click"
  data-ominity-title="Hero CTA"
  data-ominity-metadata='{"placement":"hero"}'
>
  Shop now
</button>
```

## Ominity Dev Tool

`@ominity/next/dev-tool` provides the development-only Ominity Dev Tool for
integrations. It captures SDK calls through its request-capture fetcher/HTTP client,
groups them by page load or async request, and renders tabs for general
integration state, config health, the active channel, route/rendering,
cache/revalidation, auth/customer context, commerce, forms, tracking, searchable
API requests, and export/copy tooling.

Turn it on in the route (`devTool: true` serves `/api/dev-tool/requests`) and in `OminityProvider`, and render the
bar:

```tsx
"use client";

import { OminityDevTool, createOminityDevToolSnapshot } from "@ominity/next/dev-tool";
import { OminityProvider } from "@ominity/next/react";

export function Providers({ children }: { children: React.ReactNode }) {
  const enabled = process.env.NODE_ENV !== "production";

  return (
    <OminityProvider
      devTool={{ enabled, snapshot: createOminityDevToolSnapshot({ appName: "Storefront", environment: process.env.NODE_ENV, enabled }) }}
    >
      {children}
      <OminityDevTool enabled={enabled} theme="system" endpoint="/api/dev-tool/requests" />
    </OminityProvider>
  );
}
```

The Dev Tool automatically detects its package and SDK versions, browser
runtime, current route, and route locale. The customer-account and tracking state
inside `OminityProvider` register their Dev Tool capability automatically. Pass
explicit props to `OminityDevTool` for app-specific adapters or to override
auto-detected information; for example `auth={false}` hides the auth tab.

On the server, pass `await siteSupport.getDevToolChannelInfo()` as the
`channel` capability in the provider snapshot. It reuses the cached current
channel request and fills the Channel tab with the detected identity, active
state, locales, languages, countries, currencies, domains, and available
payment and shipping methods.

For Laravel Debugbar-style request history, pass a request context to
`createOminityDevToolFetcher` or `createOminityDevToolHttpClient`. Use the same
`pageId` for async requests that belong to the same browser page and set
`parentId` when an async call follows a page request.

## Public modules

- `@ominity/next` – full surface
- `@ominity/next/react` – `OminityProvider` and every browser hook
- `@ominity/next/routes` – `createOminityRouteHandlers`, the single App Router catch-all
- `@ominity/next/cms` – client, stable CMS types, routing, locales, metadata helpers
- `@ominity/next/cms/rendering` – registry + recursive renderer
- `@ominity/next/next` – App Router integration helpers
- `@ominity/next/forms` – Ominity forms renderer + submit helpers
- `@ominity/next/commerce` – pricing, routing and money helpers, commerce events
- `@ominity/next/commerce/server` – `createOminityCommerceRouteHandlers`
- `@ominity/next/auth` – SDK-backed OAuth2, MFA, recovery code, password reset, and signed sessions
- `@ominity/next/auth/server` – secure App Router auth route handlers
- `@ominity/next/customer-accounts` – browser client, SDK model exports, and customer permission helpers
- `@ominity/next/customer-accounts/server` – secure account/team App Router route handlers
- `@ominity/next/customer-accounts/react` – account switching, team, permission, and invitation state/actions
- `@ominity/next/sdk` – browser SDK factory and error helpers
- `@ominity/next/sdk/react` – SDK provider, query, paginated query and mutation hooks
- `@ominity/next/sdk/server` – the SDK gateway route handlers and default rules
- `@ominity/next/actions`, `@ominity/next/actions/react`, `@ominity/next/actions/server` – typed actions and helpers
- `@ominity/next/server`, `@ominity/next/server/client-ip` – server utilities
- `@ominity/next/dev-tool` – Ominity Dev Tool, SDK call capture, and request grouping helpers
- `@ominity/next/debug` – backward-compatible Dev Tool import path
- `@ominity/next/seo` – sitemap, metadata-adjacent, and structured-data helpers
- `@ominity/next/intl` – `next-intl` bridge
- `@ominity/next/tracking` – visitor UUID cookie helpers for first-party tracking
- `@ominity/next/tracking/provider` – auto-tracking client provider for App Router
- `@ominity/next/tracking/proxy` – server-side first-party proxy helper

## Documentation

- `docs/architecture.md`
- `docs/rendering.md`
- `docs/component-registry.md`
- `docs/routing.md`
- `docs/i18n.md`
- `docs/ssg-isr-ssr.md`
- `docs/examples.md`
- `docs/forms.md`
- `docs/commerce.md`
- `docs/auth.md`
- `docs/customer-accounts.md`
- `docs/sdk.md`
- `docs/migration-2.0.md`
- `docs/troubleshooting.md`

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
```
