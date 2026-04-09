import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { createRoutingConfig, resolveCmsRoute } from "../dist/cms/routing/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readFixture(name) {
  const fixturePath = path.join(__dirname, "fixtures", name);
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw);
}

test("routing resolves translated slugs across locales", async () => {
  const fixture = await readFixture("routes.fixture.json");

  const config = createRoutingConfig({
    defaultLocale: "en",
    locales: fixture.locales,
    localeSegmentStrategy: "language",
    canonicalRedirectPolicy: "if-not-canonical",
  });

  const resolved = resolveCmsRoute({
    routes: fixture.routes,
    incomingPath: "/nl/contacteer-ons",
    config,
  });

  assert.ok(resolved);
  assert.equal(resolved.locale, "nl");
  assert.equal(resolved.localizedPath, "/contacteer-ons");
  assert.equal(resolved.shouldRedirect, false);
});

test("routing canonical redirect behavior is configurable", async () => {
  const fixture = await readFixture("routes.fixture.json");

  const redirectConfig = createRoutingConfig({
    defaultLocale: "en",
    locales: fixture.locales,
    localeSegmentStrategy: "language",
    canonicalRedirectPolicy: "if-not-canonical",
  });

  const noRedirectConfig = createRoutingConfig({
    defaultLocale: "en",
    locales: fixture.locales,
    localeSegmentStrategy: "language",
    canonicalRedirectPolicy: "never",
  });

  const needsRedirect = resolveCmsRoute({
    routes: fixture.routes,
    incomingPath: "/nl/contact-us",
    config: redirectConfig,
  });

  const noRedirect = resolveCmsRoute({
    routes: fixture.routes,
    incomingPath: "/nl/contact-us",
    config: noRedirectConfig,
  });

  assert.ok(needsRedirect);
  assert.ok(noRedirect);
  assert.equal(needsRedirect.shouldRedirect, true);
  assert.equal(noRedirect.shouldRedirect, false);
});

test("routing supports language, country-language and no-locale strategies", async () => {
  const fixture = await readFixture("routes.fixture.json");

  const languageConfig = createRoutingConfig({
    defaultLocale: "en",
    locales: fixture.locales,
    localeSegmentStrategy: "language",
  });
  const countryLanguageConfig = createRoutingConfig({
    defaultLocale: "en",
    locales: fixture.locales,
    localeSegmentStrategy: "country-language",
  });
  const noneConfig = createRoutingConfig({
    defaultLocale: "en",
    locales: fixture.locales,
    localeSegmentStrategy: "none",
  });

  const languageResolved = resolveCmsRoute({
    routes: fixture.routes,
    incomingPath: "/nl/contacteer-ons",
    config: languageConfig,
  });
  const countryLanguageResolved = resolveCmsRoute({
    routes: fixture.routes,
    incomingPath: "/be/nl/contacteer-ons",
    config: countryLanguageConfig,
  });
  const noneResolved = resolveCmsRoute({
    routes: fixture.routes,
    incomingPath: "/contact-us",
    config: noneConfig,
  });

  assert.ok(languageResolved);
  assert.ok(countryLanguageResolved);
  assert.ok(noneResolved);
  assert.equal(languageResolved.locale, "nl");
  assert.equal(countryLanguageResolved.locale, "nl-BE");
  assert.equal(noneResolved.locale, "en");
});

