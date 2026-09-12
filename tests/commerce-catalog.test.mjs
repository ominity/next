import assert from "node:assert/strict";
import { test } from "node:test";

import { HTTPClient } from "@ominity/api-typescript";

import { createCommerceCatalog } from "../dist/commerce/server/index.js";

test("commerce catalog keeps SDK models, repairs pagination and caches repeated loads", async () => {
  const urls = [];
  const httpClient = new HTTPClient({
    fetcher: async (request) => {
      urls.push(request.url);

      if (request.url.includes("/offers")) {
        return Response.json({
          _embedded: {
            product_offers: [{
              resource: "product_offer",
              id: 2,
              productId: 1,
              type: "one-time",
              intervalId: null,
              quantity: 1,
              prices: { EUR: { amount: 19.95, formatted: "€19.95" } },
            }],
          },
          count: 1,
        }, { headers: { "Content-Type": "application/hal+json" } });
      }

      return Response.json({
        _embedded: {
          products: [{
            resource: "product",
            id: 1,
            sku: "SKU-1",
            ean: null,
            mpn: null,
            asin: null,
            title: "SDK product",
            shortTitle: null,
            coverImage: null,
            additionalImages: [],
            shortDescription: null,
            description: null,
            bulletpoints: [],
            boxContent: null,
            type: "physical",
            condition: "new",
            categoryId: 1,
            stock: 10,
            isBackorderAllowed: false,
            routes: {},
            searches: [],
            customFields: [],
            publishedAt: null,
            updatedAt: "2026-09-08T00:00:00.000Z",
            createdAt: "2026-09-08T00:00:00.000Z",
          }],
        },
        count: 1,
      }, { headers: { "Content-Type": "application/hal+json" } });
    },
  });
  const catalog = createCommerceCatalog({
    sdk: {
      serverURL: "https://example.test/api",
      security: { apiKey: "server-secret" },
      httpClient,
    },
  });

  const first = await catalog.listProducts({ limit: 50, maxPages: 2 });
  const second = await catalog.listProducts({ limit: 50, maxPages: 2 });

  assert.equal(first[0]?.product.title, "SDK product");
  assert.equal(first[0]?.offers[0]?.prices.EUR?.amount, 19.95);
  assert.strictEqual(second, first);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /\?page=1&limit=50$/);
  assert.match(urls[1], /\/products\/1\/offers\?page=1&limit=50$/);
});
