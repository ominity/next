import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildLocalizedRouteAlternates,
  buildLocalizedRoutePath,
  buildRouteTemplateParams,
  resolveLocalizedRouteTemplate,
  stringifyRouteTemplateParam,
} from "../dist/next/index.js";
import { createRoutingConfig } from "../dist/cms/index.js";

const baseLocales = [
  { code: "en", language: "en", default: true },
  { code: "nl", language: "nl" },
  { code: "nl-BE", language: "nl", country: "BE" },
];

test("resolveLocalizedRouteTemplate falls back from locale code to language code", () => {
  const template = resolveLocalizedRouteTemplate({
    templateByLocale: {
      en: "checkout/payment",
      nl: "afrekenen/betalen",
    },
    locale: "nl-BE",
    locales: baseLocales,
    defaultLocale: "en",
  });

  assert.equal(template, "afrekenen/betalen");
});

test("buildLocalizedRoutePath supports static nested templates", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: baseLocales,
    localeSegmentStrategy: "language",
  });

  const path = buildLocalizedRoutePath({
    routing,
    locale: "nl",
    templateByLocale: {
      en: "checkout/payment",
      nl: "afrekenen/betalen",
    },
  });

  assert.equal(path, "/nl/afrekenen/betalen");
});

test("buildLocalizedRoutePath supports country-language strategy for nested templates", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: baseLocales,
    localeSegmentStrategy: "country-language",
  });

  const path = buildLocalizedRoutePath({
    routing,
    locale: "nl-BE",
    templateByLocale: {
      en: "checkout/payment",
      nl: "afrekenen/betalen",
    },
  });

  assert.equal(path, "/be/nl/afrekenen/betalen");
});

test("buildLocalizedRoutePath supports dynamic placeholders", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: baseLocales,
    localeSegmentStrategy: "language",
  });

  const path = buildLocalizedRoutePath({
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

  assert.equal(path, "/nl/product/ABC-123-fiets-band");
});

test("buildLocalizedRoutePath supports hierarchical placeholders", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: baseLocales,
    localeSegmentStrategy: "language",
  });

  const path = buildLocalizedRoutePath({
    routing,
    locale: "nl",
    templateByLocale: {
      en: "c/{slug}",
      nl: "categorie/{slug}",
    },
    params: {
      slug: ["fietsen", "onderdelen", "remmen"],
    },
  });

  assert.equal(path, "/nl/categorie/fietsen/onderdelen/remmen");
});

test("buildLocalizedRouteAlternates supports localized nested templates", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: baseLocales,
    localeSegmentStrategy: "language",
  });

  const result = buildLocalizedRouteAlternates({
    routing,
    locale: "nl",
    templateByLocale: {
      en: "checkout/payment",
      nl: "afrekenen/betalen",
    },
    baseUrl: "https://www.example.com",
  });

  assert.equal(result.canonicalPath, "/nl/afrekenen/betalen");
  assert.equal(result.alternates.canonical, "https://www.example.com/nl/afrekenen/betalen");
  assert.equal(result.alternates.languages?.en, "https://www.example.com/en/checkout/payment");
  assert.equal(result.alternates.languages?.nl, "https://www.example.com/nl/afrekenen/betalen");
});

test("buildLocalizedRoutePath throws when required params are missing", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: baseLocales,
    localeSegmentStrategy: "language",
  });

  assert.throws(() => {
    buildLocalizedRoutePath({
      routing,
      locale: "en",
      templateByLocale: {
        en: "p/{sku}-{slug}",
      },
      params: {
        sku: "ABC-123",
      },
    });
  });
});

test("buildLocalizedRoutePath throws when array params are used in mixed segments", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: baseLocales,
    localeSegmentStrategy: "language",
  });

  assert.throws(() => {
    buildLocalizedRoutePath({
      routing,
      locale: "en",
      templateByLocale: {
        en: "p/{sku}-{slug}",
      },
      params: {
        sku: "ABC-123",
        slug: ["fiets", "band"],
      },
    });
  });
});

test("buildRouteTemplateParams normalizes supported parameter types", () => {
  const params = buildRouteTemplateParams({
    sku: "ABC-123",
    quantity: 2,
    slug: ["fiets", "band"],
    ignored: { key: "value" },
  });

  assert.deepEqual(params, {
    sku: "ABC-123",
    quantity: 2,
    slug: ["fiets", "band"],
  });
});

test("stringifyRouteTemplateParam converts arrays into slash-separated values", () => {
  assert.equal(stringifyRouteTemplateParam("abc"), "abc");
  assert.equal(stringifyRouteTemplateParam(["a", "b", "c"]), "a/b/c");
});
