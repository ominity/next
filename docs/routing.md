# Routing Strategies

`@ominity/next` uses a configurable route strategy so each website can choose URL structure without forking internals.

## Supported strategies

- `none`
  - example: `/contact`
- `language`
  - example: `/nl/contacteer-ons`
- `country-language`
  - example: `/be/nl/contacteer-ons`

## Configure routing

```ts
import { createRoutingConfig } from "@ominity/next/cms";

export const routing = createRoutingConfig({
  defaultLocale: "en",
  locales: [
    { code: "en", language: "en", default: true },
    { code: "nl", language: "nl" },
    { code: "nl-BE", language: "nl", country: "BE" },
  ],
  localeSegmentStrategy: "language",
  canonicalRedirectPolicy: "if-not-canonical",
});
```

For channel-driven projects, fetch locales via `cmsClient.getLocales()` and pass that list to `createRoutingConfig` so channel language/country/default settings drive route matching.

## Translated slug resolution

Resolver behavior:

1. detect locale from path segments using strategy
2. match route using any translated slug variant
3. resolve canonical localized slug for selected locale
4. optionally mark redirect when incoming slug is valid but non-canonical

## Canonical redirect policy

- `if-not-canonical`: redirect `/nl/contact-us` → `/nl/contacteer-ons`
- `never`: keep route valid without forced redirect

## Optional Home Locale Redirect

Use `resolveHomeLocaleRedirect` when you want `/` to redirect to the best locale URL for the current visitor.

Supported modes:

- `off`
- `accept-language`
- `cookie-accept-language`
- `geo-cookie-accept-language`

Example:

```ts
import { resolveHomeLocaleRedirect } from "@ominity/next/next";

const homeRedirect = resolveHomeLocaleRedirect({
  incomingPath: "/",
  routing,
  mode: "cookie-accept-language",
  cookieHeader: request.headers.get("cookie"),
  acceptLanguageHeader: request.headers.get("accept-language"),
  userAgentHeader: request.headers.get("user-agent"),
});

if (homeRedirect) {
  // In Next.js App Router pages:
  // redirect(homeRedirect.destinationPath);
}
```

Recommended SEO defaults:

- keep this behavior optional (`off` by default)
- skip bots/crawlers
- use temporary redirects (302/307), not permanent

## Locale-aware link building

Use `createCmsLinkResolver` to generate localized hrefs from route objects or strings.

### Supported route object shape

```ts
{
  resource: "route",
  name: "page" | "product" | "category" | string,
  locale?: "nl",
  parameters: {
    // route-specific
  }
}
```

### Built-in defaults

- `page`: `/{locale?}/{slug}`
- `product`: `/{locale?}/p/{sku}-{slug}` (prefix configurable)
- `category`: `/{locale?}/c/{slug}` where category slug can be hierarchical (`a/b/c`) (prefix configurable)

Both `slug: "a/b/c"` and `slug: ["a", "b", "c"]` are supported for category defaults.

You can override the built-in product/category prefixes globally:

```ts
const linkResolver = createCmsLinkResolver({
  config: routing,
  defaultRoutePrefixes: {
    product: "product",
    category: "category",
  },
});
```

### Override by route type

```ts
const linkResolver = createCmsLinkResolver({
  config: routing,
  routeResolvers: {
    product: ({ route }) => `/shop/${route.parameters.slug}`,
  },
});
```

## Localized route templates

For non-CMS routes that need nested paths or dynamic placeholders, use the route template helpers from `@ominity/next/next`:

```ts
import { buildLocalizedRoutePath } from "@ominity/next/next";

const paymentPath = buildLocalizedRoutePath({
  routing,
  locale: "nl",
  templateByLocale: {
    en: "checkout/payment",
    nl: "afrekenen/betalen",
  },
});
// /nl/afrekenen/betalen

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
// /nl/product/ABC-123-fiets-band
```

Template behavior:

- `{param}` supports string/number/array values.
- Arrays are expanded as hierarchical segments when used as a full segment (`.../{slug}`).
- Mixed segments (`{sku}-{slug}`) only accept scalar values.

## Base path and trailing slash

`createRoutingConfig` supports:

- `basePath`
- `trailingSlash`

so behavior stays consistent with project-level Next URL preferences.
