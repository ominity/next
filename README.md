# `@ominity/next`

Production-ready Next.js App Router integration layer for Ominity CMS.

`@ominity/next` is intentionally split into three concerns:

- **CMS integration**: stable models + API client normalization around `@ominity/api-typescript`
- **Rendering engine**: generic, recursive CMS component rendering with a project-owned component registry
- **Next helpers**: route resolution, static params, metadata, sitemap, and draft mode utilities
- **Commerce/Auth utilities**: API-first commerce client and SDK-backed OAuth2/auth helpers

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
pnpm add @ominity/next @ominity/api-typescript@^1.1.6
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

## Auth (server-side)

`@ominity/next/auth` now provides a robust server-first auth layer on top of `@ominity/api-typescript@^1.1.6`:

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
- built-in themes (`tailwindDefaultTheme`, `unstyledTheme`, `loungeDepotFormTheme`)
- `createFormsClient` with response normalization + optional adapter integration
- `createShadcnFormComponents` helper for shadcn UI wiring

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

## Visitor tracking

Use a first-party Next route plus `TrackingProvider` so carts, orders, and browser tracking share one UUID `visitorId`.

Create a same-origin proxy route. A short neutral path such as `/api/omt` is less likely to be filtered than direct third-party analytics requests:

```ts
import { createOminityTrackingProxyHandler } from "@ominity/next/tracking/proxy";

const handler = createOminityTrackingProxyHandler({
  ominityApiKey: process.env.OMINITY_API_KEY ?? "",
  ominityBaseUrl: process.env.OMINITY_API_URL,
});

export const POST = (request: Request) => handler(request);
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

## Public modules

- `@ominity/next` – full surface
- `@ominity/next/cms` – client, stable CMS types, routing, locales, metadata helpers
- `@ominity/next/cms/rendering` – registry + recursive renderer
- `@ominity/next/next` – App Router integration helpers
- `@ominity/next/forms` – Ominity forms renderer + submit helpers
- `@ominity/next/commerce` – SDK-backed commerce client + normalized cart/order/payment models
- `@ominity/next/auth` – SDK-backed OAuth2, MFA, recovery code, password reset, and signed sessions
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
- `docs/auth.md`
- `docs/troubleshooting.md`

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
```
