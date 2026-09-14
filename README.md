# `@ominity/next`

Production-ready Next.js App Router integration layer for Ominity CMS.

`@ominity/next` is intentionally split into reusable concerns:

- **CMS integration**: routing and rendering around the models owned by `@ominity/api-typescript`
- **Rendering engine**: generic, recursive CMS component rendering with a project-owned component registry
- **Next helpers**: route resolution, static params, metadata, sitemap, and draft mode utilities
- **Commerce/Auth/Customer account utilities**: API-first commerce, OAuth2/auth, account switching, team, role, permission, and invitation helpers
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
pnpm add @ominity/next @ominity/api-typescript@^1.4.5
```

If you use forms rendering, also install:

```bash
pnpm add react-hook-form
```

Peer dependencies:

- `next` `^15 || ^16`
- `react` `^18 || ^19`
- `react-dom` `^18 || ^19`

## Quick start

### 1) Create a CMS client

```ts
import { createCmsClient } from "@ominity/next/cms";

export const cmsClient = createCmsClient({
  sdk: {
    serverURL: process.env.OMINITY_API_URL ?? "",
    security: {
      apiKey: process.env.OMINITY_API_KEY ?? "",
    },
    language: "en",
    channelId: process.env.OMINITY_CHANNEL_ID,
  },
  debug: {
    enabled: process.env.NODE_ENV !== "production",
  },
});
```

`getLocales()` now resolves languages through `/localization/languages` and merges channel defaults (`/channels/current`) when available.

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
import { createRoutingConfig } from "@ominity/next/cms";
import { fetchCmsPageForParams } from "@ominity/next/next";
import { renderCmsPage } from "@ominity/next/cms/rendering";

import { cmsClient } from "@/lib/cms-client";
import { cmsRegistry } from "@/lib/cms-registry";

const routing = createRoutingConfig({
  defaultLocale: "en",
  locales: [
    { code: "en", language: "en", default: true },
    { code: "nl", language: "nl" },
  ],
  localeSegmentStrategy: "language",
  canonicalRedirectPolicy: "if-not-canonical",
});

export default async function CmsCatchAllPage({ params }: { params: { slug?: string[] } }) {
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

## Auth

`@ominity/next/auth` provides a server-first auth layer on top of `@ominity/api-typescript@^1.4.5`:

- OAuth2 token issuance (`password`, `refresh_token`, and other supported grants)
- user access token issuance (`users/{id}/token`)
- MFA method flows (list/get/enable/disable/send/validate)
- recovery code flows (list/regenerate/validate)
- user OAuth account and customer lookups
- password reset link + password reset helpers
- signed auth session cookies (`sealAuthSession` / `unsealAuthSession`)

Example:

```ts
import { createAuthClient } from "@ominity/next/auth";

const auth = createAuthClient({
  sdk: {
    serverURL: process.env.OMINITY_API_URL ?? "",
    security: {
      apiKey: process.env.OMINITY_API_KEY ?? "",
    },
  },
});

const token = await auth.issuePasswordToken({
  username: "john@example.com",
  password: "secret",
  clientId: process.env.OMINITY_OAUTH_CLIENT_ID ?? "",
  clientSecret: process.env.OMINITY_OAUTH_CLIENT_SECRET ?? "",
});
```

App Router handlers are available from `@ominity/next/auth/server`. When they
manage OAuth with the encrypted HttpOnly session cookie, their JSON responses
contain only the public user/session projection and never the access token,
refresh token, client secret, or super-admin API key.

Client applications can reuse `OminityAuthProvider` and `useOminityAuth` from
`@ominity/next/auth/react`; endpoint paths and address storage remain
configurable.

Successful password, registration, and linked social-provider sign-ins are
recorded automatically by the shared auth route handlers.
`createOminityAuthSocialRouteHandlers` handles provider discovery, OAuth start,
one-time callback exchange, encrypted session creation, and redirects from one
optional catch-all route. `createOminityAuthLoginActivityRouteHandlers` and
`useOminityLoginActivity` provide session-bound listing, detail lookup,
pagination, loading, and error state while applications retain full control over
rendering.

## Customer accounts and teams

`@ominity/next/customer-accounts` uses the SDK 1.4 customer membership,
invitation, role, and permission models directly. A single optional catch-all
App Router endpoint handles account context and switching, team members,
invitations, assignable roles, and the customer permission catalogue:

```ts
// app/api/customer-accounts/[[...path]]/route.ts
import { createOminityCustomerAccountsRouteHandlers } from "@ominity/next/customer-accounts/server";

const handlers = createOminityCustomerAccountsRouteHandlers({
  ominityBaseUrl: process.env.OMINITY_API_URL,
  channelId: process.env.OMINITY_CHANNEL_ID,
  authClientId: process.env.OMINITY_AUTH_CLIENT_ID,
  authClientSecret: process.env.OMINITY_AUTH_CLIENT_SECRET,
  authSessionSecret: process.env.OMINITY_AUTH_SESSION_SECRET,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnv: process.env.NODE_ENV,
});

export const { GET, POST, PATCH, DELETE } = handlers;
```

Wrap branded client UI with the auth and customer account providers:

```tsx
"use client";

import { OminityAuthProvider } from "@ominity/next/auth/react";
import { OminityCustomerAccountsProvider } from "@ominity/next/customer-accounts/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <OminityAuthProvider>
      <OminityCustomerAccountsProvider>{children}</OminityCustomerAccountsProvider>
    </OminityAuthProvider>
  );
}
```

`useOminityCustomerAccounts()` provides the account list, active account,
switching, permission checks, members, invitations, assignable roles, partial
loading errors, and all team mutations. Its typed client also covers active
customer details, addresses, groups, mandates, payments, orders, invoices and
PDFs, subscription cancellation, and transition products. `useOminityCustomerQuery`
reloads these resources on an account switch without exposing stale data.
Invitation registration continues through the normal auth registration route;
the package only inspects and accepts an invitation after the authenticated
user's email matches. See
[`docs/customer-accounts.md`](docs/customer-accounts.md) for the complete route
surface and headless rendering examples.

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

## Commerce

Use `createCommerceCatalog` from `@ominity/next/commerce/server` for server-only
catalog access. It returns SDK `Product`, `ProductOffer`, and `Category` models
without creating application wire models. App Router cart, checkout, order, and
payment handlers live in the same server module so the API key remains outside
the browser.

Use `OminityCommerceProvider` and `useOminityCommerce` from
`@ominity/next/commerce/react` in client UI. Cart mutations send product ID and
quantity only. Cart count, subtotal, shipping, discounts, tax, currency, and
total are read from the `Cart` returned by Ominity; the package does not
recalculate them from cart items.

For the default browser integration, add one optional catch-all route with
`createOminityCommerceRouteHandlers`. It covers cart operations, cart-scoped
shipping methods, payment methods and issuers, checkout, orders, order payments,
and payment reads. Commerce mutations use same-origin checks, and payment
creation forwards `Idempotency-Key`. `createCommerceClient` also exposes the SDK
1.4.5 product, offer, shipping-class, issuer, order-payment, and payment
operations under their original SDK model names. See
[`docs/commerce.md`](docs/commerce.md) for the route table and headless examples.

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
  useMockData: process.env.OMINITY_USE_MOCK_DATA === "true",
});
```

## Visitor tracking

Use a first-party Next route plus `TrackingProvider` so carts, orders, and browser tracking share one UUID `visitorId`.

Create a same-origin proxy route. A short neutral path such as `/api/omt` is less likely to be filtered than direct third-party analytics requests:

```ts
import { createOminityTrackingProxyRouteHandlers } from "@ominity/next/tracking/proxy";

export const { GET, POST } = createOminityTrackingProxyRouteHandlers({
  ominityApiKey: process.env.OMINITY_API_KEY,
  ominityBaseUrl: process.env.OMINITY_API_URL,
  enabled: process.env.OMINITY_TRACKING_ENABLED !== "false",
  debug: process.env.OMINITY_DEBUG_LOGS === "true",
});
```

Wrap your app with the client provider:

```ts
import { Ominity } from "@ominity/api-typescript";
import { createCommerceClient } from "@ominity/next/commerce";
import { ensureVisitorIdCookie } from "@ominity/next/tracking";
import { TrackingProvider } from "@ominity/next/tracking/provider";

const visitorId = ensureVisitorIdCookie(cookies());

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TrackingProvider endpoint="/api/omt">
      {children}
    </TrackingProvider>
  );
}

const commerce = createCommerceClient({
  sdk: {
    serverURL: process.env.OMINITY_API_URL ?? "",
    security: { apiKey: process.env.OMINITY_API_KEY ?? "" },
  },
  visitorIdResolver: () => visitorId,
});

await commerce.createCart({ data: { currency: "EUR" } }); // visitorId is auto-injected

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

## Debug bar

`@ominity/next/debug` provides a development-only debug bar for Ominity
integrations. It captures SDK calls through the debug fetcher/HTTP client,
groups them by page load or async request, and renders tabs for general
integration state, config health, the active channel, route/rendering,
cache/revalidation, auth/customer context, commerce, forms, tracking, searchable
API requests, and export/copy tooling.

```tsx
"use client";

import { OminityAuthProvider } from "@ominity/next/auth/react";
import { OminityDebugBar, OminityDebugProvider } from "@ominity/next/debug";
import { OminityCommerceProvider } from "@ominity/next/commerce/react";
import { OminityCustomerAccountsProvider } from "@ominity/next/customer-accounts/react";
import { TrackingProvider } from "@ominity/next/tracking/provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const debugEnabled = process.env.NODE_ENV !== "production";

  return (
    <OminityDebugProvider
      enabled={debugEnabled}
      initialSnapshot={{
        integration: {
          appName: "Storefront",
          environment: process.env.NODE_ENV,
          debugBar: true,
        },
      }}
    >
      <OminityAuthProvider>
        <OminityCustomerAccountsProvider>
          <OminityCommerceProvider>
            <TrackingProvider>
              {children}
              <OminityDebugBar enabled={debugEnabled} theme="system" />
            </TrackingProvider>
          </OminityCommerceProvider>
        </OminityCustomerAccountsProvider>
      </OminityAuthProvider>
    </OminityDebugProvider>
  );
}
```

`OminityAuthProvider`, `OminityCustomerAccountsProvider`,
`OminityCommerceProvider`, and `TrackingProvider` automatically register their
debug capability when they are rendered inside `OminityDebugProvider`. Projects
that remove one of those modules simply do not render that provider, and the tab
does not appear. Pass explicit props to `OminityDebugBar` for app-specific
adapters or to override auto-detected information; for example `auth={false}`
hides the auth tab.

For Laravel Debugbar-style request history, pass a request context to
`createOminityDebugFetcher` or `createOminityDebugHttpClient`. Use the same
`pageId` for async requests that belong to the same browser page and set
`parentId` when an async call follows a page request.

## Public modules

- `@ominity/next` – full surface
- `@ominity/next/cms` – client, stable CMS types, routing, locales, metadata helpers
- `@ominity/next/cms/rendering` – registry + recursive renderer
- `@ominity/next/next` – App Router integration helpers
- `@ominity/next/forms` – Ominity forms renderer + submit helpers
- `@ominity/next/commerce` – shared SDK-model helpers and commerce events
- `@ominity/next/commerce/server` – server catalog and App Router route handlers
- `@ominity/next/commerce/react` – reusable cart, checkout, and wishlist client state
- `@ominity/next/auth` – SDK-backed OAuth2, MFA, recovery code, password reset, and signed sessions
- `@ominity/next/auth/server` – secure App Router auth route handlers
- `@ominity/next/auth/react` – reusable browser auth state and workflows
- `@ominity/next/customer-accounts` – browser client, SDK model exports, and customer permission helpers
- `@ominity/next/debug` – development debug bar, SDK call capture, and request grouping helpers
- `@ominity/next/customer-accounts/server` – secure account/team App Router route handlers
- `@ominity/next/customer-accounts/react` – account switching, team, permission, and invitation state/actions
- `@ominity/next/seo` – sitemap, metadata-adjacent, and structured-data helpers
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
- `docs/troubleshooting.md`

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
```
