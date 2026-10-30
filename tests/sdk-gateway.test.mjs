import assert from "node:assert/strict";
import { test } from "node:test";

import { ErrorResponse } from "@ominity/api-typescript/models/errors";

import { readOminityAuthSession } from "../dist/auth/server/index.js";
import { writeAuthSessionCookie } from "../dist/next/auth.js";
import { createOminityBrowserSdk, toOminitySdkError } from "../dist/sdk/index.js";
import {
  OMINITY_SDK_GATEWAY_DEFAULT_RULES,
  createOminitySdkGatewayRouteHandlers,
} from "../dist/sdk/server/index.js";

const SITE = "https://store.example.com";
const API = "https://tenant.ominity.test/api";
const API_KEY = "server-api-key-never-in-the-browser";
const session = { accessToken: "user-access-token", userId: 7 };

function upstreamRecorder(respond = () => new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: { "Content-Type": "application/hal+json" },
})) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const request = new Request(input, init);
    calls.push({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers),
      body: init.body ? Buffer.from(init.body).toString() : null,
    });
    if (new URL(request.url).pathname === "/api/v1/users/7/customers/42") {
      return new Response(JSON.stringify({ customerId: 42 }), { status: 200 });
    }
    if (new URL(request.url).pathname === "/api/v1/users/7/customers/99") {
      return new Response(JSON.stringify({ status: 404 }), { status: 404 });
    }
    return respond(request);
  };
  return { calls, fetchImpl };
}

function gateway(overrides = {}) {
  const upstream = overrides.upstream ?? upstreamRecorder();
  const handlers = createOminitySdkGatewayRouteHandlers({
    ominityBaseUrl: API,
    ominityApiKey: API_KEY,
    channelId: "8",
    siteUrl: SITE,
    fetchImpl: upstream.fetchImpl,
    resolveSession: async () => ("session" in overrides ? overrides.session : session),
    ...overrides.config,
  });
  return { handlers, calls: upstream.calls };
}

function browserRequest(path, init = {}) {
  return new Request(`${SITE}/api/ominity${path}`, init);
}

test("customer routes are forwarded with the user's token, never the API key or browser credentials", async () => {
  const { handlers, calls } = gateway();
  const response = await handlers.POST(browserRequest("/v1/commerce/customers/42/subscriptions/5/changes/quote?include=product", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: "ominity_auth_session=sealed",
      Authorization: "Bearer attacker-supplied",
      "Idempotency-Key": "idem-1",
      "Accept-Language": "nl-BE,nl;q=0.9",
      "X-Forwarded-For": "203.0.113.9",
      "X-Channel-Id": "999",
      Origin: SITE,
    },
    body: JSON.stringify({ toOfferId: 12 }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("cache-control"), "private, no-store");

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${API}/v1/users/7/customers/42`);
  const forwarded = calls[1];
  assert.equal(forwarded.url, `${API}/v1/commerce/customers/42/subscriptions/5/changes/quote?include=product`);
  assert.equal(forwarded.method, "POST");
  assert.equal(forwarded.body, JSON.stringify({ toOfferId: 12 }));
  assert.equal(forwarded.headers.authorization, "Bearer user-access-token");
  assert.equal(forwarded.headers["x-channel-id"], "8");
  assert.equal(forwarded.headers["accept-language"], "nl-BE");
  assert.equal(forwarded.headers["idempotency-key"], "idem-1");
  assert.equal(forwarded.headers["x-forwarded-for"], "203.0.113.9");
  assert.equal(forwarded.headers.cookie, undefined);
  for (const call of calls) {
    assert.equal(JSON.stringify(call).includes(API_KEY), false);
    assert.equal(JSON.stringify(call).includes("attacker-supplied"), false);
  }

  await handlers.GET(browserRequest("/v1/commerce/customers/42/subscriptions"));
  assert.equal(calls.length, 3, "a confirmed membership is cached");
});

test("customers the user does not belong to and routes outside the allowlist are refused", async () => {
  const { handlers, calls } = gateway();

  const foreign = await handlers.GET(browserRequest("/v1/commerce/customers/99/orders"));
  assert.equal(foreign.status, 403);
  assert.equal((await foreign.json()).code, "CUSTOMER_ACCESS_DENIED");

  for (const path of ["/v1/commerce/orders", "/v1/commerce/invoices", "/v1/users", "/v1/commerce/customers"]) {
    const response = await handlers.GET(browserRequest(path));
    assert.equal(response.status, 403, path);
    assert.equal((await response.json()).code, "ROUTE_NOT_ALLOWED", path);
  }
  const create = await handlers.POST(browserRequest("/v1/commerce/customers/users/roles", { method: "POST", body: "{}" }));
  assert.equal(create.status, 403);

  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), ["/api/v1/users/7/customers/99"]);
});

test("user routes only reach the signed-in user, and admin-only routes below them stay closed", async () => {
  const { handlers, calls } = gateway();

  assert.equal((await handlers.GET(browserRequest("/v1/users/7/customers"))).status, 200);
  assert.equal((await handlers.PATCH(browserRequest("/v1/users/7", { method: "PATCH", body: "{}" }))).status, 200);

  const other = await handlers.GET(browserRequest("/v1/users/8/customers"));
  assert.equal(other.status, 403);
  assert.equal((await other.json()).code, "USER_ACCESS_DENIED");

  const token = await handlers.GET(browserRequest("/v1/users/7/token"));
  assert.equal(token.status, 403);
  assert.equal((await token.json()).code, "ROUTE_NOT_ALLOWED");

  assert.equal((await handlers.DELETE(browserRequest("/v1/users/7", { method: "DELETE" }))).status, 403);
  assert.equal(calls.length, 2);
});

test("anonymous visitors only reach public rules, which use the API key server-side", async () => {
  const { handlers, calls } = gateway({
    session: null,
    config: {
      rules: [
        ...OMINITY_SDK_GATEWAY_DEFAULT_RULES,
        { path: "commerce/products", methods: ["GET"], access: "public" },
        { path: "commerce/customers/{customer}/addresses", access: "public" },
      ],
    },
  });

  const anonymous = await handlers.GET(browserRequest("/v1/commerce/customers/42/orders"));
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).code, "UNAUTHENTICATED");

  const scopedPublic = await handlers.GET(browserRequest("/v1/commerce/customers/42/addresses"));
  assert.equal(scopedPublic.status, 401, "rules with {customer} always need a signed-in user");

  const products = await handlers.GET(browserRequest("/v1/commerce/products?limit=5"));
  assert.equal(products.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.authorization, `Bearer ${API_KEY}`);

  const write = await handlers.POST(browserRequest("/v1/commerce/products", { method: "POST", body: "{}" }));
  assert.equal(write.status, 403);
});

test("cross-site writes, unsafe paths and oversized bodies are refused before reaching Ominity", async () => {
  const { handlers, calls } = gateway({ config: { maxBodyBytes: 16 } });

  const crossSite = await handlers.POST(browserRequest("/v1/commerce/customers/42/addresses", {
    method: "POST",
    headers: { Origin: "https://attacker.example" },
    body: "{}",
  }));
  assert.equal(crossSite.status, 403);
  assert.equal((await crossSite.json()).code, "INVALID_ORIGIN");

  const fetchSite = await handlers.DELETE(browserRequest("/v1/commerce/customers/42/addresses/1", {
    method: "DELETE",
    headers: { "Sec-Fetch-Site": "cross-site" },
  }));
  assert.equal(fetchSite.status, 403);

  for (const path of [
    "/v1/commerce/customers/42/%2E%2E/%2E%2E/orders",
    "/v1/commerce/customers/42%2F..%2F..%2Forders",
    "/v1/commerce/customers/42//orders",
    "/commerce/customers/42/orders",
    "/v1",
  ]) {
    // URL parsing may already resolve encoded dot segments, which then fall outside the allowlist.
    const response = await handlers.GET(new Request(`${SITE}/api/ominity${path}`));
    assert.ok([403, 404].includes(response.status), `${path} answered ${response.status}`);
  }

  const large = await handlers.POST(browserRequest("/v1/commerce/customers/42/addresses", {
    method: "POST",
    body: JSON.stringify({ street: "A street name that is too long" }),
  }));
  assert.equal(large.status, 413);

  assert.equal(calls.every((call) => new URL(call.url).pathname === "/api/v1/users/7/customers/42"), true);
});

test("upstream responses keep their status and body; empty responses stay empty", async () => {
  const { handlers } = gateway({
    upstream: upstreamRecorder((request) => request.method === "DELETE"
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ status: 422, code: "subscription.next_period_locked" }), {
        status: 422,
        headers: { "Content-Type": "application/json", Sunset: "Wed, 01 Jan 2027 00:00:00 GMT", "Set-Cookie": "upstream=1" },
      })),
  });

  const refused = await handlers.POST(browserRequest("/v1/commerce/customers/42/subscriptions/5/changes", { method: "POST", body: "{}" }));
  assert.equal(refused.status, 422);
  assert.equal((await refused.json()).code, "subscription.next_period_locked");
  assert.equal(refused.headers.get("sunset"), "Wed, 01 Jan 2027 00:00:00 GMT");
  assert.equal(refused.headers.get("set-cookie"), null);

  const removed = await handlers.DELETE(browserRequest("/v1/commerce/customers/42/subscriptions/5/cancellation", { method: "DELETE" }));
  assert.equal(removed.status, 204);
  assert.equal(await removed.text(), "");
});

test("the browser SDK is the plain SDK pointed at the gateway, and gateway refusals become structured errors", async () => {
  const subscriptionChange = {
    resource: "subscription_change",
    id: "chg-1",
    subscriptionId: 5,
    type: "change",
    direction: "upgrade",
    status: "quoted",
    timing: "immediate",
    effectiveAt: null,
    from: { productId: 3, offerId: 10, intervalId: 1, recurringAmount: { value: "10.00", currency: "EUR" }, quantity: 1 },
    to: { productId: 4, offerId: 12, intervalId: 1, recurringAmount: { value: "20.00", currency: "EUR" }, quantity: 1 },
    quote: { lines: [], charge: { value: "6.45", currency: "EUR" }, credit: { value: "0.00", currency: "EUR" }, settlement: null },
    warnings: [],
    quoteExpiresAt: null,
    orderId: null,
    createdAt: null,
  };
  const { handlers, calls } = gateway({
    upstream: upstreamRecorder(() => new Response(JSON.stringify(subscriptionChange), {
      status: 201,
      headers: { "Content-Type": "application/hal+json" },
    })),
  });
  const browserCalls = [];
  const sdk = createOminityBrowserSdk({
    origin: SITE,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      browserCalls.push({ credentials: init?.credentials, authorization: request.headers.get("authorization") });
      return handlers[request.method](request);
    },
  });

  const quote = await sdk.commerce.customerSubscriptions.quoteChange({ customerId: 42, subscriptionId: 5, data: { toOfferId: 12 } });
  assert.equal(quote.id, "chg-1");
  assert.equal(calls.at(-1).url, `${API}/v1/commerce/customers/42/subscriptions/5/changes/quote`);
  assert.equal(calls.at(-1).headers.authorization, "Bearer user-access-token");
  assert.equal(browserCalls[0].credentials, "same-origin");
  assert.equal(browserCalls[0].authorization, null);

  const refused = await sdk.commerce.customers.list({}, { retries: { strategy: "none" } }).catch((error) => error);
  assert.equal(refused instanceof ErrorResponse, true);
  const error = toOminitySdkError(refused);
  assert.equal(error.status, 403);
  assert.equal(error.code, "ROUTE_NOT_ALLOWED");
});

test("an API refusal keeps its reason code and field messages", () => {
  const error = toOminitySdkError(new ErrorResponse({
    status: 422,
    title: "Unprocessable Content",
    detail: "Validation failed for the request",
    code: "subscription.next_period_locked",
    fields: { change: ["The next period is already being prepared."] },
    links: { documentation: { href: "https://docs.ominity.com", type: "text/html" } },
  }, { response: new Response(null), request: new Request("https://x.test"), body: "" }));

  assert.equal(error.status, 422);
  assert.equal(error.code, "subscription.next_period_locked");
  assert.equal(error.isValidationError, true);
  assert.deepEqual(error.fields, { change: ["The next period is already being prepared."] });
});

test("the gateway reads the encrypted session cookie and ignores expired sessions", async () => {
  const secret = "s".repeat(40);
  const jar = new Map();
  const store = {
    get: (name) => (jar.has(name) ? { value: jar.get(name) } : undefined),
    set: (name, value) => jar.set(name, value),
  };

  await writeAuthSessionCookie(store, {
    accessToken: "access",
    tokenType: "Bearer",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    userId: 7,
  }, { sessionSecret: secret });
  assert.equal((await readOminityAuthSession({ authSessionSecret: secret }, store))?.accessToken, "access");
  assert.equal(await readOminityAuthSession({ authSessionSecret: "x".repeat(40) }, store), null);

  await writeAuthSessionCookie(store, {
    accessToken: "access",
    tokenType: "Bearer",
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    userId: 7,
  }, { sessionSecret: secret });
  assert.equal(await readOminityAuthSession({ authSessionSecret: secret }, store), null);
});
