import assert from "node:assert/strict";
import { test } from "node:test";

import { toPublicAuthSession } from "../dist/auth/index.js";
import { normalizeChannel, createRoutingConfig } from "../dist/cms/index.js";
import { commerceMoneyCurrency, commerceMoneyValue } from "../dist/commerce/index.js";
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

test("money helpers read SDK amounts without re-modelling them", () => {
  assert.equal(commerceMoneyValue({ value: "108.25", currency: "usd" }), 108.25);
  assert.equal(commerceMoneyValue(undefined), 0);
  assert.equal(commerceMoneyCurrency({ value: "1.00", currency: "usd" }), "USD");
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
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    requests.push(path);
    if (path !== "/api/v1/channels/current") return new Response(null, { status: 404 });
    return Response.json({
      resource: "channel",
      id: 12,
      identifier: "web",
      name: "Website",
      defaultLanguage: { code: "nl-BE" },
      defaultCountry: { code: "BE" },
      languages: [
        { id: 1, code: "nl", name: "Nederlands", isActive: true, locale: { code: "nl-BE" } },
        { id: 2, code: "en", name: "English", isActive: true },
        { id: 3, code: "fr", name: "Français", isActive: false },
      ],
      countries: [
        { code: "BE", name: "Belgium", currency: "EUR", isEnabled: true },
        { code: "FR", name: "France", currency: "EUR", isEnabled: false },
      ],
      currencies: [],
    }, { headers: { "Content-Type": "application/hal+json" } });
  };

  try {
    const support = createOminitySiteSupport({
      getConfig: () => ({
        apiUrl: "https://tenant.ominity.test/api",
        apiKey: "server-api-key",
        localeSegmentStrategy: "language",
        canonicalRedirectPolicy: "if-not-canonical",
        stringLinkStrategy: "passthrough",
        trailingSlash: false,
        basePath: "",
      }),
    });

    const locales = await support.getSupportedLocales();
    assert.deepEqual(locales.map((locale) => locale.code), ["nl-BE", "en"]);
    assert.equal(locales.find((locale) => locale.code === "nl-BE")?.default, true);

    const channelContext = await support.getChannelContext();
    assert.deepEqual(channelContext.countries, ["BE"]);
    assert.equal(channelContext.defaultCountry, "BE");

    const channel = await support.getDevToolChannelInfo();
    assert.equal(channel.id, "12");
    assert.equal(channel.name, "Website");
    assert.equal(channel.source, "detected");
    assert.equal(channel.defaultLocale, "nl-BE");
    assert.deepEqual(channel.locales.map((locale) => locale.code), ["nl-BE", "en"]);
    assert.deepEqual(requests, ["/api/v1/channels/current"], "the channel is the only locale source, fetched once");
  } finally {
    globalThis.fetch = originalFetch;
  }
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
