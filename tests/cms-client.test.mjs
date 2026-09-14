import assert from "node:assert/strict";
import { test } from "node:test";
import { HTTPClient } from "@ominity/api-typescript";

import { createCmsClient } from "../dist/cms/index.js";

test("getPageByPath uses the CMS slug filter without an unsupported path query", async () => {
  const requests = [];
  const client = createCmsClient({
    sdk: {
      serverURL: "https://example.ominity.test/api",
      httpClient: new HTTPClient({
        fetcher: async (request) => {
          requests.push(request.clone());
          return new Response(null, { status: 404 });
        },
      }),
    },
  });

  const page = await client.getPageByPath({
    path: "/products/",
    locale: "nl-BE",
  });

  assert.equal(page, null);
  assert.equal(requests.length, 1);

  const requestUrl = new URL(requests[0].url);
  assert.equal(requestUrl.pathname, "/api/v1/cms/pages");
  assert.equal(requestUrl.searchParams.get("filter[slug]"), "products");
  assert.equal(requestUrl.searchParams.has("path"), false);
  assert.equal(requestUrl.searchParams.get("include"), "content");
  assert.equal(requests[0].headers.get("accept-language"), "nl");
});

test("getPageByPath sends the root slug filter for the home page", async () => {
  let requestUrl;
  const client = createCmsClient({
    sdk: {
      serverURL: "https://example.ominity.test/api",
      httpClient: new HTTPClient({
        fetcher: async (request) => {
          requestUrl = new URL(request.url);
          return new Response(null, { status: 404 });
        },
      }),
    },
  });

  await client.getPageByPath({ path: "/" });

  assert.equal(requestUrl.searchParams.get("filter[slug]"), "/");
  assert.equal(requestUrl.searchParams.has("path"), false);
});
