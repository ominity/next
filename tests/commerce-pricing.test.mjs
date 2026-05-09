import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePriceFromPriceMap } from "../dist/commerce/pricing.js";

test("resolvePriceFromPriceMap prefers selected currency", () => {
  const resolved = resolvePriceFromPriceMap({
    prices: {
      eur: "10.50",
      USD: 12,
    },
    preferredCurrency: "USD",
  });

  assert.deepEqual(resolved, {
    currency: "USD",
    value: 12,
  });
});

test("resolvePriceFromPriceMap respects allowed currencies and fallback", () => {
  const resolved = resolvePriceFromPriceMap({
    prices: {
      EUR: 10,
      GBP: 8,
    },
    preferredCurrency: "USD",
    allowedCurrencies: ["GBP"],
    fallbackCurrency: "EUR",
  });

  assert.deepEqual(resolved, {
    currency: "GBP",
    value: 8,
  });
});

test("resolvePriceFromPriceMap handles nested amount objects", () => {
  const resolved = resolvePriceFromPriceMap({
    prices: {
      EUR: { amount: "15.25" },
      USD: { value: 16.5 },
    },
    preferredCurrency: "EUR",
  });

  assert.deepEqual(resolved, {
    currency: "EUR",
    value: 15.25,
  });
});
