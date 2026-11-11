import assert from "node:assert/strict";
import { test } from "node:test";

import { HTTPClient } from "@ominity/api-typescript";

import {
  createOminityAuthPasskeyChallengeRouteHandler,
  createOminityAuthPasskeyVerifyRouteHandler,
  readOminityAuthSession,
} from "../dist/auth/server/index.js";
import { base64UrlToBuffer, bufferToBase64Url } from "../dist/react/webauthn.js";

const SITE = "https://app.example.com";
const SECRET = "s".repeat(40);
const CREDENTIAL = { id: "cred", rawId: "cred", type: "public-key", response: { clientDataJSON: "e30", authenticatorData: "AA", signature: "AA" } };

function cookieJar() {
  const values = new Map();
  return {
    values,
    get: (name) => (values.has(name) ? { value: values.get(name) } : undefined),
    set: (name, value, options = {}) => (options.maxAge === 0 ? values.delete(name) : values.set(name, value)),
  };
}

function api({ mfa = true, challengeStatus = 200, challenge } = {}) {
  const requests = [];
  const json = (body, status = 200, type = "application/hal+json") => new Response(JSON.stringify(body), { status, headers: { "Content-Type": type } });
  const fetcher = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    const body = request.method === "POST" ? await request.clone().text() : "";
    requests.push({ method: request.method, path, body, authorization: request.headers.get("authorization") });
    if (path === "/api/v1/users/passkeys/challenge") {
      if (challengeStatus !== 200) {
        return json({ status: challengeStatus, title: "Unprocessable Content", detail: "Not on the channel's domains.", code: "channel.url_not_allowed", _links: { documentation: { href: "https://docs.ominity.com/overview/handling-errors", type: "text/html" } } }, challengeStatus, "application/json");
      }
      return json(challenge ?? { hasPasskeys: true, challengeId: "ch-1", expiresAt: "2026-11-11T10:05:00+00:00", publicKey: { challenge: "abc", rpId: "app.example.com", allowCredentials: [], userVerification: "required" } }, 200, "application/json");
    }
    if (request.method === "POST" && path.includes("oauth")) {
      const sent = JSON.parse(body);
      return sent.grant_type === "passkey" && sent.challenge_id === "ch-1"
        ? json({ token_type: "Bearer", expires_in: 3600, access_token: "user-access-token", refresh_token: "refresh" }, 200, "application/json")
        : json({ error: "invalid_grant", message: "The passkey could not be verified. Try again." }, 400, "application/json");
    }
    if (path === "/api/v1/me") {
      return json({ resource: "user", id: 9, firstName: "Olivia", email: "olivia@example.com", isMfaEnabled: mfa });
    }
    if (path === "/api/v1/users/9/mfa-methods") {
      return json({ _embedded: { user_mfa_methods: mfa ? [{ resource: "user_mfa_method", userId: 9, method: "authenticator", isEnabled: true }] : [] }, count: mfa ? 1 : 0 });
    }
    if (path === "/api/v1/users/9/logins") {
      return json({ resource: "user_login", id: 1, userId: 9, createdAt: "2026-11-11T00:00:00Z" }, 201);
    }
    return json({}, 404);
  };
  return { requests, httpClient: new HTTPClient({ fetcher }) };
}

function post(path, body, headers = {}) {
  return new Request(`${SITE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

function config(httpClient, extra = {}) {
  return {
    ominityBaseUrl: "https://tenant.ominity.test/api",
    ominityApiKey: "k".repeat(32),
    authClientId: "client",
    authClientSecret: "secret",
    authSessionSecret: SECRET,
    sdkHttpClient: httpClient,
    ...extra,
  };
}

test("a passkey challenge is asked for the page's origin with the API key", async () => {
  const { requests, httpClient } = api();
  const response = await createOminityAuthPasskeyChallengeRouteHandler(config(httpClient))(post("/api/auth/passkey/challenge", { email: " Olivia@Example.com " }, {
    origin: "https://shop.example.com",
    "user-agent": "Test/1.0",
    "x-forwarded-for": "203.0.113.7",
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.hasPasskeys, true);
  assert.equal(body.challengeId, "ch-1");
  assert.equal(body.publicKey.rpId, "app.example.com");

  const sent = requests.find((request) => request.path === "/api/v1/users/passkeys/challenge");
  assert.equal(sent.authorization, `Bearer ${"k".repeat(32)}`);
  assert.deepEqual(JSON.parse(sent.body), { origin: "https://shop.example.com", email: "olivia@example.com", ipAddress: "203.0.113.7", userAgent: "Test/1.0" });
});

test("without an Origin header the site URL is the origin, and an email without passkeys gets no challenge", async () => {
  const { requests, httpClient } = api({ challenge: { hasPasskeys: false } });
  const response = await createOminityAuthPasskeyChallengeRouteHandler(config(httpClient, { siteUrl: "https://www.example.com/" }))(post("/api/auth/passkey/challenge", { email: "nobody@example.com" }));

  assert.deepEqual(await response.json(), { ok: true, hasPasskeys: false });
  assert.equal(JSON.parse(requests[0].body).origin, "https://www.example.com");
});

test("a discoverable challenge needs no body, and bad emails are refused before Ominity", async () => {
  const { requests, httpClient } = api();
  const discoverable = await createOminityAuthPasskeyChallengeRouteHandler(config(httpClient))(new Request(`${SITE}/api/auth/passkey/challenge`, { method: "POST", headers: { origin: SITE } }));
  assert.equal(discoverable.status, 200);
  assert.deepEqual(JSON.parse(requests[0].body), { origin: SITE });

  const invalid = await createOminityAuthPasskeyChallengeRouteHandler(config(httpClient))(post("/api/auth/passkey/challenge", { email: "nope" }));
  assert.equal(invalid.status, 400);
  assert.equal(requests.length, 1);
});

test("a site that isn't one of the channel's domains is told passkeys are not available", async () => {
  const { httpClient } = api({ challengeStatus: 422 });
  const response = await createOminityAuthPasskeyChallengeRouteHandler(config(httpClient))(post("/api/auth/passkey/challenge", {}, { origin: "https://evil.example" }));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "PASSKEY_NOT_AVAILABLE");
});

test("a verified passkey starts a session without the MFA step", async () => {
  const jar = cookieJar();
  globalThis.__ominityTestCookies = jar;
  const { requests, httpClient } = api({ mfa: true });
  const settings = config(httpClient);

  const state = await (await createOminityAuthPasskeyVerifyRouteHandler(settings)(post("/api/auth/passkey/verify", { challengeId: "ch-1", credential: CREDENTIAL }))).json();

  assert.equal(state.status, "authenticated");
  assert.equal(state.user.id, 9);
  assert.equal((await readOminityAuthSession(settings, jar))?.userId, 9);
  // The user has MFA, but a passkey already proved two factors.
  assert.equal(requests.some((request) => request.path === "/api/v1/users/9/mfa-methods"), false);

  const token = JSON.parse(requests.find((request) => request.path.includes("oauth")).body);
  assert.equal(token.grant_type, "passkey");
  assert.equal(token.challenge_id, "ch-1");
  assert.deepEqual(JSON.parse(token.credential), CREDENTIAL);
});

test("a passkey that doesn't verify answers 401 and starts no session", async () => {
  const jar = cookieJar();
  globalThis.__ominityTestCookies = jar;
  const { httpClient } = api();
  const settings = config(httpClient);

  const response = await createOminityAuthPasskeyVerifyRouteHandler(settings)(post("/api/auth/passkey/verify", { challengeId: "other", credential: CREDENTIAL }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "INVALID_PASSKEY");
  assert.equal(await readOminityAuthSession(settings, jar), null);

  const missing = await createOminityAuthPasskeyVerifyRouteHandler(settings)(post("/api/auth/passkey/verify", { challengeId: "ch-1" }));
  assert.equal(missing.status, 400);
});

test("base64url conversion round-trips binary data", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  const encoded = bufferToBase64Url(bytes);
  assert.equal(encoded.includes("+") || encoded.includes("/") || encoded.includes("="), false);
  assert.deepEqual(new Uint8Array(base64UrlToBuffer(encoded)), bytes);
});
