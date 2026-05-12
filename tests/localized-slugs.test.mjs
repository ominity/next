import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildLocalizedSlugAlternates,
  buildLocalizedStaticPath,
  resolveLocalizedSlug,
} from "../dist/next/index.js";
import { createRoutingConfig } from "../dist/cms/index.js";

const baseLocales = [
  { code: "en", language: "en", default: true },
  { code: "nl", language: "nl" },
  { code: "nl-BE", language: "nl", country: "BE" },
];

test("resolveLocalizedSlug falls back from locale code to language code", () => {
  const slug = resolveLocalizedSlug({
    slugByLocale: {
      en: "contact",
      nl: "contacteer-ons",
    },
    locale: "nl-BE",
    locales: baseLocales,
    defaultLocale: "en",
  });

  assert.equal(slug, "contacteer-ons");
});

test("buildLocalizedStaticPath supports translated slugs in language strategy", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: baseLocales,
    localeSegmentStrategy: "language",
  });

  const path = buildLocalizedStaticPath({
    routing,
    locale: "nl",
    prefixPath: "/auth",
    slugByLocale: {
      en: "login",
      nl: "inloggen",
    },
  });

  assert.equal(path, "/nl/auth/inloggen");
});

test("buildLocalizedStaticPath supports translated slugs in country-language strategy", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: baseLocales,
    localeSegmentStrategy: "country-language",
  });

  const path = buildLocalizedStaticPath({
    routing,
    locale: "nl-BE",
    prefixPath: "/auth",
    slugByLocale: {
      en: "login",
      nl: "inloggen",
    },
  });

  assert.equal(path, "/be/nl/auth/inloggen");
});

test("buildLocalizedStaticPath falls back to default locale slug when translation is missing", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: [
      { code: "en", language: "en", default: true },
      { code: "de", language: "de" },
    ],
    localeSegmentStrategy: "language",
  });

  const path = buildLocalizedStaticPath({
    routing,
    locale: "de",
    slugByLocale: {
      en: "contact",
    },
  });

  assert.equal(path, "/de/contact");
});

test("buildLocalizedSlugAlternates returns canonical and language alternates", () => {
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: baseLocales,
    localeSegmentStrategy: "language",
  });

  const result = buildLocalizedSlugAlternates({
    routing,
    locale: "nl",
    slugByLocale: {
      en: "contact",
      nl: "contacteer-ons",
    },
    baseUrl: "https://www.example.com",
  });

  assert.equal(result.canonicalPath, "/nl/contacteer-ons");
  assert.equal(result.alternates.canonical, "https://www.example.com/nl/contacteer-ons");
  assert.equal(result.alternates.languages?.en, "https://www.example.com/en/contact");
  assert.equal(result.alternates.languages?.nl, "https://www.example.com/nl/contacteer-ons");
});
