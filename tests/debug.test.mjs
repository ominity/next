import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { SDK_VERSION } from "@ominity/api-typescript";
import { renderToStaticMarkup } from "react-dom/server";

import { OminityDevToolLogo } from "../dist/debug/OminityDevToolLogo.js";

import {
  OMINITY_NEXT_PACKAGE_VERSION,
  buildOminityDebugDeleteResponse,
  buildOminityDebugGetResponse,
  clearOminityDebugEntries,
  countOminityDevToolErrors,
  createOminityDevToolChannelInfo,
  createOminityDevToolSnapshot,
  createOminityDebugRequestContext,
  createOminityDebugFetcher,
  listOminityDebugEntries,
  listOminityDebugRequestGroups,
} from "../dist/debug/index.js";

test("Dev Tool logo supports a white monochrome dark-mode mark", () => {
  const colored = renderToStaticMarkup(OminityDevToolLogo({ size: 24 }));
  const monochrome = renderToStaticMarkup(OminityDevToolLogo({ size: 24, monochrome: true }));

  assert.doesNotMatch(colored, /filter:/);
  assert.match(monochrome, /filter:brightness\(0\) invert\(1\)/);
});

test("Dev Tool channel info uses the current channel as its locale source", () => {
  const channel = createOminityDevToolChannelInfo({
    channel: {
      id: "12",
      identifier: "storefront",
      name: "Storefront",
      defaultLanguageCode: "nl-BE",
      defaultCountryCode: "BE",
      defaultCurrencyCode: "EUR",
      languages: [
        { id: "1", code: "nl-BE", name: "Nederlands", active: true, default: true },
        { id: "2", code: "en", name: "English", active: true },
      ],
      countries: [{ code: "BE", name: "Belgium", currency: "EUR", enabled: true, default: true }],
      currencies: [{ code: "EUR", name: "Euro", symbol: "€", default: true }],
    },
    source: "detected",
    defaultLocale: "nl-BE",
    locales: [
      { code: "nl-BE", language: "nl", country: "BE", label: "Nederlands", default: true },
      { code: "en", language: "en", label: "English" },
    ],
    languages: ["nl", "en"],
    countries: ["BE"],
    currencies: ["EUR"],
    countryCurrencyMap: { BE: "EUR" },
  });

  assert.equal(channel.id, "12");
  assert.equal(channel.source, "detected");
  assert.equal(channel.defaultLocale, "nl-BE");
  assert.deepEqual(channel.locales.map((locale) => locale.code), ["nl-BE", "en"]);
  assert.deepEqual(channel.languages.map((language) => language.code), ["nl-BE", "en"]);
  assert.deepEqual(channel.countryCurrencyMap, { BE: "EUR" });
});

test("Dev Tool supplies package metadata and actionable configuration health", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const snapshot = createOminityDevToolSnapshot({
    appName: "Storefront",
    environment: "development",
    runtime: "Browser",
    nextVersion: "16.2.9",
    mockData: false,
    requiredEnvironment: [
      { name: "OMINITY_API_URL", value: "https://example.ominity.test/api" },
      { name: "OMINITY_API_KEY", value: "" },
    ],
    unsafeWarnings: ["Example warning", "Example warning"],
  });

  assert.equal(OMINITY_NEXT_PACKAGE_VERSION, packageJson.version);
  assert.equal(snapshot.integration.packageVersion, packageJson.version);
  assert.equal(snapshot.integration.packageName, "@ominity/next");
  assert.equal(snapshot.integration.sdkVersion, SDK_VERSION);
  assert.equal(snapshot.health.mode, "live");
  assert.deepEqual(snapshot.health.missingEnvironment, ["OMINITY_API_KEY"]);
  assert.deepEqual(snapshot.health.unsafeWarnings, ["Example warning"]);
  assert.equal(snapshot.health.checks[0].status, "enabled");
  assert.equal(snapshot.health.checks[1].status, "disabled");
  assert.equal(snapshot.health.checks[1].severity, "error");
  assert.equal(countOminityDevToolErrors(snapshot, 2, "Endpoint unavailable"), 4);
});

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
