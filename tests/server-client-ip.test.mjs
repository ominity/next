import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveRequestClientIp,
  resolveRequestForwardedFor,
} from "../dist/server/client-ip.js";

test("resolveRequestClientIp prefers explicit proxy client IP headers over loopback forwarded values", () => {
  const request = new Request("https://example.com/api/forms/submit", {
    headers: {
      "X-Forwarded-For": "::1",
      "X-Vercel-Forwarded-For": "198.51.100.24",
    },
  });

  assert.equal(resolveRequestClientIp(request), "198.51.100.24");
});

test("resolveRequestClientIp prefers a public forwarded IP over a loopback real IP", () => {
  const request = new Request("https://example.com/api/forms/submit", {
    headers: {
      "X-Real-IP": "::1",
      "X-Forwarded-For": "94.110.206.244",
    },
  });

  assert.equal(resolveRequestClientIp(request), "94.110.206.244");
});

test("resolveRequestForwardedFor preserves the resolved client IP first and deduplicates the chain", () => {
  const request = new Request("https://example.com/api/forms/submit", {
    headers: {
      "X-Forwarded-For": "198.51.100.24, 203.0.113.10",
      "X-Real-IP": "198.51.100.24",
    },
  });

  assert.equal(
    resolveRequestForwardedFor(request),
    "198.51.100.24, 203.0.113.10",
  );
});

test("resolveRequestClientIp parses RFC 7239 Forwarded header values", () => {
  const request = new Request("https://example.com/api/forms/submit", {
    headers: {
      Forwarded: 'for=203.0.113.77;proto=https;by=203.0.113.1',
    },
  });

  assert.equal(resolveRequestClientIp(request), "203.0.113.77");
});
