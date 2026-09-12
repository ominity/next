import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildOminityDebugDeleteResponse,
  buildOminityDebugGetResponse,
  clearOminityDebugEntries,
  createOminityDebugRequestContext,
  createOminityDebugFetcher,
  listOminityDebugEntries,
  listOminityDebugRequestGroups,
} from "../dist/debug/index.js";

test("debug fetcher captures Ominity requests with redacted sensitive headers", async () => {
  const originalFetch = globalThis.fetch;
  clearOminityDebugEntries();

  globalThis.fetch = async (input) => {
    assert.ok(input instanceof Request);
    assert.equal(input.headers.get("authorization"), "Bearer secret-token");

    return new Response(JSON.stringify({ ok: true, item: { id: 7 } }), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": "session=secret",
        "X-Trace-Id": "trace-1",
      },
    });
  };

  try {
    const fetcher = createOminityDebugFetcher({ source: "sdk" });
    assert.equal(typeof fetcher, "function");

    const response = await fetcher("https://api.example.test/api/v1/cms/pages?path=/", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: "/" }),
    });

    assert.equal(response.status, 201);
    const entries = listOminityDebugEntries(10);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].source, "sdk");
    assert.equal(entries[0].method, "POST");
    assert.equal(entries[0].status, 201);
    assert.equal(entries[0].ok, true);
    assert.equal(entries[0].requestHeaders.authorization, "[redacted]");
    assert.equal(entries[0].responseHeaders["set-cookie"], "[redacted]");
    assert.equal(entries[0].responseHeaders["x-trace-id"], "trace-1");
    assert.match(entries[0].requestBody, /"path":"\/"/);
    assert.match(entries[0].responseBody, /"item":\{"id":7\}/);
  } finally {
    globalThis.fetch = originalFetch;
    clearOminityDebugEntries();
  }
});

test("debug fetcher groups SDK calls by request context", async () => {
  const originalFetch = globalThis.fetch;
  clearOminityDebugEntries();

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  try {
    const parent = createOminityDebugRequestContext({
      request: new Request("https://site.test/nl/products?preview=1", { method: "GET" }),
      id: "page-load-1",
      pageId: "debug-page-1",
      kind: "page",
      route: "/[locale]/products",
    });
    const asyncRequest = createOminityDebugRequestContext({
      id: "cart-refresh-1",
      pageId: "debug-page-1",
      parentId: parent.id,
      kind: "async",
      label: "Cart refresh",
      route: "/api/cart",
    });

    const pageFetcher = createOminityDebugFetcher({
      source: "cms",
      requestContext: parent,
    });
    const asyncFetcher = createOminityDebugFetcher({
      source: "commerce",
      requestContext: asyncRequest,
    });
    await pageFetcher("https://api.example.test/api/v1/channels/current");
    await pageFetcher("https://api.example.test/api/v1/cms/pages?path=/products");
    await asyncFetcher("https://api.example.test/api/v1/commerce/carts/current");

    const entries = listOminityDebugEntries(10);
    assert.equal(entries.length, 3);
    assert.equal(entries.filter((entry) => entry.request.id === "page-load-1").length, 2);
    assert.equal(entries.filter((entry) => entry.request.id === "cart-refresh-1").length, 1);

    const groups = listOminityDebugRequestGroups(10);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((group) => group.id).sort(), ["cart-refresh-1", "page-load-1"]);
    assert.equal(groups.find((group) => group.id === "page-load-1").entryCount, 2);
    assert.equal(groups.find((group) => group.id === "cart-refresh-1").parentId, "page-load-1");
    assert.equal(groups.find((group) => group.id === "cart-refresh-1").kind, "async");
  } finally {
    globalThis.fetch = originalFetch;
    clearOminityDebugEntries();
  }
});

test("debug route lists, filters, and clears captured requests", async () => {
  clearOminityDebugEntries();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("failure", {
    status: 500,
    headers: { "Content-Type": "text/plain" },
  });

  try {
    const fetcher = createOminityDebugFetcher({ source: "cms" });
    assert.equal(typeof fetcher, "function");
    await fetcher("https://api.example.test/api/v1/channels/current");

    const getResponse = buildOminityDebugGetResponse(
      new Request("https://site.test/api/debug/sdk-requests?source=cms&limit=5"),
      { enabled: true },
    );
    const payload = await getResponse.json();
    assert.equal(payload.enabled, true);
    assert.equal(payload.source, "cms");
    assert.equal(payload.total, 1);
    assert.equal(payload.requestGroups.length, 1);
    assert.equal(payload.requestGroups[0].entryCount, 1);
    assert.equal(payload.requestGroups[0].errorCount, 1);
    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0].status, 500);

    const deleteResponse = buildOminityDebugDeleteResponse({ enabled: true });
    assert.equal(deleteResponse.status, 200);
    assert.equal(listOminityDebugEntries(10).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    clearOminityDebugEntries();
  }
});
