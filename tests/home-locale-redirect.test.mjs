import assert from "node:assert/strict";
import { test } from "node:test";

import { createRoutingConfig } from "../dist/cms/routing/index.js";
import { resolveHomeLocaleRedirect } from "../dist/next/index.js";

const locales = [
  { code: "en", language: "en", default: true },
  { code: "nl", language: "nl" },
  { code: "nl-BE", language: "nl", country: "BE" },
];

test("home redirect can use accept-language matching", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "language",
  });

  const resolved = resolveHomeLocaleRedirect({
    incomingPath: "/",
    routing,
    mode: "accept-language",
    acceptLanguageHeader: "nl-BE,nl;q=0.9,en;q=0.8",
  });

  assert.ok(resolved);
  assert.equal(resolved.locale, "nl-BE");
  assert.equal(resolved.destinationPath, "/nl");
  assert.equal(resolved.source, "accept-language");
});

test("home redirect prefers locale cookie when configured", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "language",
  });

  const resolved = resolveHomeLocaleRedirect({
    incomingPath: "/",
    routing,
    mode: "cookie-accept-language",
    cookieHeader: "other=1; ominity_locale=nl-BE",
    acceptLanguageHeader: "en-US,en;q=0.9",
  });

  assert.ok(resolved);
  assert.equal(resolved.locale, "nl-BE");
  assert.equal(resolved.destinationPath, "/nl");
  assert.equal(resolved.source, "cookie");
});

test("home redirect can use geo country with country-language strategy", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "country-language",
  });

  const resolved = resolveHomeLocaleRedirect({
    incomingPath: "/",
    routing,
    mode: "geo-cookie-accept-language",
    countryHeader: "BE",
    acceptLanguageHeader: "nl-BE,nl;q=0.9,en;q=0.8",
  });

  assert.ok(resolved);
  assert.equal(resolved.locale, "nl-BE");
  assert.equal(resolved.destinationPath, "/be/nl");
  assert.equal(resolved.source, "geo-country");
});

test("home redirect skips bots by default", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "language",
  });

  const resolved = resolveHomeLocaleRedirect({
    incomingPath: "/",
    routing,
    mode: "accept-language",
    acceptLanguageHeader: "nl,en;q=0.8",
    userAgentHeader: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  });

  assert.equal(resolved, null);
});

test("home redirect only applies to root path", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales,
    localeSegmentStrategy: "language",
  });

  const resolved = resolveHomeLocaleRedirect({
    incomingPath: "/products",
    routing,
    mode: "accept-language",
    acceptLanguageHeader: "nl,en;q=0.8",
  });

  assert.equal(resolved, null);
});
