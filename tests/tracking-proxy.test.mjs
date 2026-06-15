import assert from "node:assert/strict";
import { test } from "node:test";

import { createOminityTrackingProxyHandler } from "../dist/next/tracking-proxy.js";

test("createOminityTrackingProxyHandler rejects non-POST methods", async () => {
  const handler = createOminityTrackingProxyHandler({
    ominityApiKey: "secret",
    fetchImpl: async () => new Response("{}", { status: 200 }),
  });

  const response = await handler(new Request("https://example.com/api/omt", {
    method: "GET",
  }));

  assert.equal(response.status, 405);
});

test("createOminityTrackingProxyHandler forwards payload and client headers to Ominity", async () => {
  let forwardedUrl = "";
  let forwardedHeaders = null;
  let forwardedPayload = null;

  const fetchImpl = async (input, init) => {
    forwardedUrl = String(input);
    forwardedHeaders = new Headers(init.headers);
    forwardedPayload = JSON.parse(init.body);

    return new Response(JSON.stringify({
      success: true,
      visitorId: "648cd59e-8f79-40a7-a4de-1fb65b42c00c",
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  const handler = createOminityTrackingProxyHandler({
    ominityApiKey: "secret",
    ominityBaseUrl: "https://example.ominity.test/api",
    fetchImpl,
    enrichEvent: async () => ({
      proxy: "next",
    }),
  });

  const response = await handler(new Request("https://shop.example.com/api/omt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Browser UA",
      "X-Forwarded-For": "203.0.113.10",
      "X-Request-Id": "req_123",
    },
    body: JSON.stringify({
      event: "page_view",
      visitorId: "648cd59e-8f79-40a7-a4de-1fb65b42c00c",
      url: "https://shop.example.com/products/desk-lamp",
      metadata: {
        source: "provider",
      },
    }),
  }));

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(forwardedUrl, "https://example.ominity.test/api/v1/tracking/events");
  assert.equal(forwardedHeaders.get("authorization"), "Bearer secret");
  assert.equal(forwardedHeaders.get("user-agent"), "Browser UA");
  assert.equal(forwardedHeaders.get("x-forwarded-for"), "203.0.113.10");
  assert.equal(forwardedHeaders.get("x-real-ip"), "203.0.113.10");
  assert.equal(forwardedHeaders.get("x-ominity-client-ip"), "203.0.113.10");
  assert.equal(forwardedHeaders.get("x-request-id"), "req_123");
  assert.equal(forwardedPayload.event, "page_view");
  assert.equal(forwardedPayload.visitorId, "648cd59e-8f79-40a7-a4de-1fb65b42c00c");
  assert.equal(forwardedPayload.metadata.source, "provider");
  assert.equal(forwardedPayload.metadata.proxy, "next");
});

test("createOminityTrackingProxyHandler supports custom forwardEvent transport", async () => {
  const handler = createOminityTrackingProxyHandler({
    ominityApiKey: "secret",
    fetchImpl: async () => new Response("{}", { status: 500 }),
    forwardEvent: async ({ payload }) => ({
      status: 202,
      body: {
        queued: true,
        event: payload.event,
      },
    }),
  });

  const response = await handler(new Request("https://example.com/api/omt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event: "page_view",
    }),
  }));

  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(body.queued, true);
  assert.equal(body.event, "page_view");
});

test("createOminityTrackingProxyHandler prefers explicit client IP headers over forwarded fallback values", async () => {
  let forwardedHeaders = null;

  const fetchImpl = async (_input, init) => {
    forwardedHeaders = new Headers(init.headers);

    return new Response(JSON.stringify({
      success: true,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  const handler = createOminityTrackingProxyHandler({
    ominityApiKey: "secret",
    ominityBaseUrl: "https://example.ominity.test/api",
    fetchImpl,
  });

  const response = await handler(new Request("https://shop.example.com/api/omt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": "::ffff:127.0.0.1",
      "X-Real-IP": "198.51.100.24",
    },
    body: JSON.stringify({
      event: "page_view",
    }),
  }));

  assert.equal(response.status, 200);
  assert.equal(forwardedHeaders.get("x-real-ip"), "198.51.100.24");
  assert.equal(forwardedHeaders.get("x-ominity-client-ip"), "198.51.100.24");
  assert.equal(forwardedHeaders.get("x-forwarded-for"), "198.51.100.24, 127.0.0.1");
});

test("createOminityTrackingProxyHandler resolves RFC 7239 Forwarded header values", async () => {
  let forwardedHeaders = null;

  const fetchImpl = async (_input, init) => {
    forwardedHeaders = new Headers(init.headers);

    return new Response(JSON.stringify({
      success: true,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  const handler = createOminityTrackingProxyHandler({
    ominityApiKey: "secret",
    ominityBaseUrl: "https://example.ominity.test/api",
    fetchImpl,
  });

  const response = await handler(new Request("https://shop.example.com/api/omt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Forwarded: 'for=203.0.113.77;proto=https;by=203.0.113.1',
    },
    body: JSON.stringify({
      event: "page_view",
    }),
  }));

  assert.equal(response.status, 200);
  assert.equal(forwardedHeaders.get("x-real-ip"), "203.0.113.77");
  assert.equal(forwardedHeaders.get("x-ominity-client-ip"), "203.0.113.77");
  assert.equal(forwardedHeaders.get("x-forwarded-for"), "203.0.113.77");
});

test("createOminityTrackingProxyHandler prefers a public forwarded IP over a loopback real IP", async () => {
  let forwardedHeaders = null;

  const fetchImpl = async (_input, init) => {
    forwardedHeaders = new Headers(init.headers);

    return new Response(JSON.stringify({
      success: true,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  const handler = createOminityTrackingProxyHandler({
    ominityApiKey: "secret",
    ominityBaseUrl: "https://example.ominity.test/api",
    fetchImpl,
  });

  const response = await handler(new Request("https://shop.example.com/api/omt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Real-IP": "::1",
      "X-Forwarded-For": "94.110.206.244",
    },
    body: JSON.stringify({
      event: "page_view",
    }),
  }));

  assert.equal(response.status, 200);
  assert.equal(forwardedHeaders.get("x-real-ip"), "94.110.206.244");
  assert.equal(forwardedHeaders.get("x-ominity-client-ip"), "94.110.206.244");
  assert.equal(forwardedHeaders.get("x-forwarded-for"), "94.110.206.244");
});
