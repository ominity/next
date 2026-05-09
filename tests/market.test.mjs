import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectLanguages,
  resolveApiLanguage,
  resolveCurrencyForCountry,
  resolveLocaleForLanguage,
  resolveLocaleForLanguageAndCountry,
  toApiLanguage,
} from "../dist/cms/market.js";

const locales = [
  { code: "en", language: "en", default: true },
  { code: "nl-BE", language: "nl", country: "BE" },
  { code: "nl-NL", language: "nl", country: "NL" },
];

test("toApiLanguage returns language for locale code", () => {
  assert.equal(toApiLanguage("nl-BE"), "nl");
  assert.equal(toApiLanguage("en"), "en");
});

test("resolveApiLanguage handles empty input with fallback", () => {
  assert.equal(resolveApiLanguage(undefined, "nl-BE"), "nl");
  assert.equal(resolveApiLanguage("en-US"), "en");
});

test("collectLanguages returns unique language list", () => {
  assert.deepEqual(collectLanguages(locales), ["en", "nl"]);
});

test("resolveLocaleForLanguage picks best locale for language", () => {
  assert.equal(resolveLocaleForLanguage(locales, "nl", "en"), "nl-BE");
  assert.equal(resolveLocaleForLanguage(locales, "de", "en"), "en");
});

test("resolveLocaleForLanguageAndCountry prefers exact match", () => {
  assert.equal(resolveLocaleForLanguageAndCountry(locales, "nl", "NL", "en"), "nl-NL");
  assert.equal(resolveLocaleForLanguageAndCountry(locales, "nl", "FR", "en"), "nl-BE");
});

test("resolveCurrencyForCountry uses country currency and channel fallbacks", () => {
  const channel = {
    countries: [
      { code: "BE", name: "Belgium", currency: "EUR" },
      { code: "GB", name: "United Kingdom", currency: "GBP" },
    ],
    currencies: [
      { code: "EUR" },
      { code: "GBP" },
    ],
    defaultCurrencyCode: "EUR",
  };

  assert.equal(resolveCurrencyForCountry({
    country: "GB",
    channel,
  }), "GBP");
  assert.equal(resolveCurrencyForCountry({
    country: "US",
    locale: "nl-BE",
    channel,
  }), "EUR");
});
