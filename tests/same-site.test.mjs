import assert from "node:assert/strict";
import { test } from "node:test";

import { isCrossSiteRequest } from "../dist/server/route-utils.js";

const post = (url, headers) => new Request(url, { method: "POST", headers });

test("mutations are same-site for the configured site and for the origin the request was sent to", () => {
  const site = "http://localhost:3000";
  // The configured site.
  assert.equal(isCrossSiteRequest(post("http://localhost:3000/api/commerce/cart/items", { origin: site }), site), false);
  // Opened on another address or port than NEXT_PUBLIC_SITE_URL, e.g. 127.0.0.1 or the LAN address `next dev` prints.
  assert.equal(isCrossSiteRequest(post("http://127.0.0.1:3000/api/commerce/cart/items", { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }), site), false);
  assert.equal(isCrossSiteRequest(post("http://localhost:3010/api/commerce/cart/items", { origin: "http://192.168.1.84:3010", host: "192.168.1.84:3010" }), site), false);
  // Behind a TLS-terminating proxy.
  assert.equal(isCrossSiteRequest(post("http://internal:3000/api/x", { origin: "https://shop.example", host: "shop.example", "x-forwarded-proto": "https" }), undefined), false);
  // No Origin: same-origin GETs and server-to-server calls.
  assert.equal(isCrossSiteRequest(post("http://localhost:3000/api/x", {}), site), false);
});

test("another site's requests are refused", () => {
  const site = "https://shop.example";
  assert.equal(isCrossSiteRequest(post("https://shop.example/api/x", { origin: "https://evil.example", host: "shop.example" }), site), true);
  assert.equal(isCrossSiteRequest(post("https://shop.example/api/x", { origin: "http://shop.example", host: "shop.example", "x-forwarded-proto": "https" }), site), true);
  assert.equal(isCrossSiteRequest(post("https://shop.example/api/x", { "sec-fetch-site": "cross-site" }), site), true);
});
