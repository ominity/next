import assert from "node:assert/strict";
import { test } from "node:test";

import { toPublicAuthSession } from "../dist/auth/index.js";
import { normalizeChannel, createRoutingConfig } from "../dist/cms/index.js";
import {
  commerceCartCount,
  commerceCartCurrency,
  commerceCartDiscount,
  commerceCartItemTotalPrice,
  commerceCartShipping,
  commerceCartSubtotal,
  commerceCartTax,
  commerceCartTotal,
} from "../dist/commerce/index.js";
import {
  buildCmsSitemap,
  buildLocalizedResourceSitemap,
  buildSitemapXml,
} from "../dist/seo/index.js";
import { createOminitySiteSupport } from "../dist/next/index.js";

test("public auth sessions never expose OAuth credentials", () => {
  const session = toPublicAuthSession({
    accessToken: "access-secret",
    refreshToken: "refresh-secret",
    tokenType: "Bearer",
    expiresAt: "2030-01-01T00:00:00.000Z",
    userId: 42,
    email: "person@example.com",
  });

  assert.deepEqual(session, {
    expiresAt: "2030-01-01T00:00:00.000Z",
    userId: 42,
    email: "person@example.com",
  });
  assert.equal(Object.hasOwn(session, "accessToken"), false);
  assert.equal(Object.hasOwn(session, "refreshToken"), false);
  assert.equal(Object.hasOwn(session, "tokenType"), false);
});

test("cart totals and currency are read from the backend Cart model", () => {
  const cart = {
    subtotalAmount: { value: "108.25", currency: "usd" },
    shippingAmount: { value: "12.00", currency: "usd" },
    discountAmount: { value: "8.25", currency: "usd" },
    taxAmount: { value: "21.00", currency: "usd" },
    totalAmount: { value: "133.00", currency: "usd" },
    totalQuantity: 7,
    currency: "usd",
  };

  assert.equal(commerceCartSubtotal(cart), 108.25);
  assert.equal(commerceCartShipping(cart), 12);
  assert.equal(commerceCartDiscount(cart), 8.25);
  assert.equal(commerceCartTax(cart), 21);
  assert.equal(commerceCartTotal(cart), 133);
  assert.equal(commerceCartCount(cart), 7);
  assert.equal(commerceCartCurrency(cart), "USD");
});

test("cart item totals are never reconstructed from unit price and quantity", () => {
  assert.equal(commerceCartItemTotalPrice({
    id: "item-1",
    quantity: 4,
    unitPrice: { value: "19.99", currency: "EUR" },
  }), 0);
});

test("channel normalization accepts numeric SDK channel and language ids", () => {
  const channel = normalizeChannel({
    id: 12,
    identifier: "web",
    name: "Website",
    languages: [{ id: 34, code: "nl-BE", name: "Nederlands", isActive: true }],
  });

  assert.equal(channel.id, "12");
  assert.equal(channel.languages[0]?.id, "34");
  assert.equal(channel.languages[0]?.code, "nl-BE");
});

test("site support uses active current-channel languages as locale source of truth", async () => {
  const support = createOminitySiteSupport({
    getConfig: () => ({
      useMockData: true,
      defaultLocale: "en",
      locales: [{ code: "en", language: "en", default: true }],
      localeSegmentStrategy: "language",
      canonicalRedirectPolicy: "if-not-canonical",
      stringLinkStrategy: "passthrough",
      trailingSlash: false,
      basePath: "",
    }),
    mockClient: {
      async getLocales() {
        return [
          { code: "en", language: "en", default: true },
          { code: "fr", language: "fr" },
        ];
      },
      async getChannel() {
        return {
          id: "12",
          identifier: "web",
          name: "Website",
          defaultLanguageCode: "nl-BE",
          languages: [
            { id: "1", code: "nl", localeCode: "nl-BE", name: "Nederlands", active: true },
            { id: "2", code: "en", name: "English", active: true },
            { id: "3", code: "fr", name: "Français", active: false },
          ],
          countries: [],
          currencies: [],
        };
      },
    },
  });

  const locales = await support.getSupportedLocales();
  assert.deepEqual(locales.map((locale) => locale.code), ["nl-BE", "en"]);
  assert.equal(locales.find((locale) => locale.code === "nl-BE")?.default, true);
});

test("CMS sitemap emits the configured channel locales and shared XML", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: [
      { code: "en", language: "en", default: true },
      { code: "nl", language: "nl" },
    ],
    localeSegmentStrategy: "language",
  });
  const entries = buildCmsSitemap({
    baseUrl: "https://example.com",
    routing,
    locales: ["en", "nl"],
    routes: [{
      id: "route-contact",
      pageId: "page-contact",
      locale: "en",
      path: "/contact",
      slug: "contact",
      canonicalPath: "/contact",
      translations: { en: "/contact", nl: "/contacteer-ons" },
    }],
  });

  assert.deepEqual(entries.map((entry) => entry.url), [
    "https://example.com/en/contact",
    "https://example.com/nl/contacteer-ons",
  ]);
  assert.match(buildSitemapXml(entries), /hreflang="nl"/);
  assert.match(buildSitemapXml(entries), /https:\/\/example\.com\/nl\/contacteer-ons/);
});

test("localized SDK resources are grouped into sitemap alternates", async () => {
  const entries = await buildLocalizedResourceSitemap({
    baseUrl: "https://example.com",
    locales: ["en", "nl"],
    async loadResources(locale) {
      return [{ id: "entry-1", slug: locale === "nl" ? "werk" : "work" }];
    },
    resolveGroupKey: (resource) => resource.id,
    resolvePath: (resource, locale) => `/${locale}/${resource.slug}`,
  });

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0]?.alternates.languages, {
    en: "https://example.com/en/work",
    nl: "https://example.com/nl/werk",
  });
});
