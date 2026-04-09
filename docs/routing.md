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

## Translated slug resolution

Resolver behavior:

1. detect locale from path segments using strategy
2. match route using any translated slug variant
3. resolve canonical localized slug for selected locale
4. optionally mark redirect when incoming slug is valid but non-canonical

## Canonical redirect policy

- `if-not-canonical`: redirect `/nl/contact-us` → `/nl/contacteer-ons`
- `never`: keep route valid without forced redirect

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
- `product`: `/{locale?}/p/{sku}-{slug}`
- `category`: `/{locale?}/c/{slug}` where category slug can be hierarchical (`a/b/c`)

Both `slug: "a/b/c"` and `slug: ["a", "b", "c"]` are supported for category defaults.

### Override by route type

```ts
const linkResolver = createCmsLinkResolver({
  config: routing,
  routeResolvers: {
    product: ({ route }) => `/shop/${route.parameters.slug}`,
  },
});
```

## Base path and trailing slash

`createRoutingConfig` supports:

- `basePath`
- `trailingSlash`

so behavior stays consistent with project-level Next URL preferences.
