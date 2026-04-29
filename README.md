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
pnpm add @ominity/next @ominity/api-typescript@^1.1.1
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
import { createCmsRegistry, defineCmsComponent } from "@ominity/next/rendering";

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
import { renderCmsPage } from "@ominity/next/rendering";

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

`@ominity/next/auth` now provides a robust server-first auth layer on top of `@ominity/api-typescript@^1.1.1`:

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
- `product` → `/{locale?}/p/{sku}-{slug}`
- `category` → `/{locale?}/c/{slug}` (hierarchical category slugs supported)

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

## Public modules

- `@ominity/next` – full surface
- `@ominity/next/cms` – client, stable CMS types, routing, locales, metadata helpers
- `@ominity/next/rendering` – registry + recursive renderer
- `@ominity/next/next` – App Router integration helpers
- `@ominity/next/forms` – Ominity forms renderer + submit helpers
- `@ominity/next/commerce` – SDK-backed commerce client + normalized cart/order/payment models
- `@ominity/next/auth` – SDK-backed OAuth2, MFA, recovery code, password reset, and signed sessions

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
