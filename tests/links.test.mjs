import assert from "node:assert/strict";
import { test } from "node:test";

import { createCmsLinkResolver, createRoutingConfig } from "../dist/cms/index.js";

const locales = [
  { code: "en", language: "en", default: true },
  { code: "nl", language: "nl" },
  { code: "nl-BE", language: "nl", country: "BE" },
];

test("default page route object resolver builds localized page path", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "language",
  });
  const resolver = createCmsLinkResolver({
    config: routing,
  });

  const result = resolver.resolve({
    resource: "route",
    name: "page",
    locale: "nl",
    parameters: {
      id: 16,
      slug: "terugkommoment-rijbewijs-hasselt",
    },
  });

  assert.equal(result.href, "/nl/terugkommoment-rijbewijs-hasselt");
});

test("default product route object resolver uses /p/{sku}-{slug}", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "language",
  });
  const resolver = createCmsLinkResolver({
    config: routing,
  });

  const result = resolver.resolve({
    resource: "route",
    name: "product",
    locale: "nl",
    parameters: {
      sku: "ABC-123",
      slug: "fiets-band",
    },
  });

  assert.equal(result.href, "/nl/p/ABC-123-fiets-band");
});

test("default category resolver supports hierarchical slug string", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "language",
  });
  const resolver = createCmsLinkResolver({
    config: routing,
  });

  const result = resolver.resolve({
    resource: "route",
    name: "category",
    locale: "nl",
    parameters: {
      slug: "auto/onderdelen/remmen",
    },
  });

  assert.equal(result.href, "/nl/c/auto/onderdelen/remmen");
});

test("default category resolver supports hierarchical slug arrays", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "language",
  });
  const resolver = createCmsLinkResolver({
    config: routing,
  });

  const result = resolver.resolve({
    resource: "route",
    name: "category",
    locale: "nl",
    parameters: {
      slug: ["auto", "onderdelen", "remmen"],
    },
  });

  assert.equal(result.href, "/nl/c/auto/onderdelen/remmen");
});

test("locale segment strategy none omits locale prefix", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "none",
  });
  const resolver = createCmsLinkResolver({
    config: routing,
  });

  const result = resolver.resolve({
    resource: "route",
    name: "product",
    locale: "nl",
    parameters: {
      sku: "ABC-123",
      slug: "fiets-band",
    },
  });

  assert.equal(result.href, "/p/ABC-123-fiets-band");
});

test("country-language strategy yields /{country}/{language}/...", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "country-language",
  });
  const resolver = createCmsLinkResolver({
    config: routing,
  });

  const result = resolver.resolve({
    resource: "route",
    name: "product",
    locale: "nl-BE",
    parameters: {
      sku: "ABC-123",
      slug: "fiets-band",
    },
  });

  assert.equal(result.href, "/be/nl/p/ABC-123-fiets-band");
});

test("custom route resolver overrides defaults", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "language",
  });
  const resolver = createCmsLinkResolver({
    config: routing,
    routeResolvers: {
      product: ({ route }) => `/shop/${route.parameters.slug}`,
    },
  });

  const result = resolver.resolve({
    resource: "route",
    name: "product",
    locale: "nl",
    parameters: {
      sku: "ABC-123",
      slug: "fiets-band",
    },
  });

  assert.equal(result.href, "/nl/shop/fiets-band");
});

test("string links pass through by default", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "language",
  });
  const resolver = createCmsLinkResolver({
    config: routing,
  });

  const result = resolver.resolve("/contact");
  assert.equal(result.href, "/contact");
});

test("string links can be localized with configuration", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "language",
  });
  const resolver = createCmsLinkResolver({
    config: routing,
    stringLinkStrategy: "localize-relative",
  });

  const result = resolver.resolve("/contact", { locale: "nl" });
  assert.equal(result.href, "/nl/contact");
});

