import assert from "node:assert/strict";
import { test } from "node:test";

import { HTTPClient } from "@ominity/api-typescript";

import {
  createOminityAuthLoginRouteHandler,
  createOminityAuthMeRouteHandler,
  createOminityAuthMfaSendRouteHandler,
  createOminityAuthMfaValidateRouteHandler,
  createOminityAuthRecoveryValidateRouteHandler,
  createOminityAuthSocialRouteHandlers,
  readOminityAuthSession,
} from "../dist/auth/server/index.js";

const SITE = "https://store.example.com";
const SECRET = "s".repeat(40);

function cookieJar() {
  const values = new Map();
  return {
    values,
    get: (name) => (values.has(name) ? { value: values.get(name) } : undefined),
    set: (name, value, options = {}) => (options.maxAge === 0 ? values.delete(name) : values.set(name, value)),
  };
}

function api({ mfa, limited = false }) {
  const calls = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/hal+json" } });
  const fetcher = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    calls.push(`${request.method} ${path}`);
    if (request.method === "POST" && path.includes("oauth")) {
      return json({ token_type: "Bearer", expires_in: 3600, access_token: "user-access-token", refresh_token: "refresh" });
    }
    if (path === "/api/v1/settings/socialproviders/4/users/token") {
      return json({ resource: "socialprovider_user", id: 12, providerId: 4, userId: 7, identifier: "p-7", email: "jamie@example.com", updatedAt: "2026-10-29T00:00:00Z", createdAt: "2026-10-29T00:00:00Z" });
    }
    if (path === "/api/v1/users/7/token") {
      return json({ token_type: "Bearer", expires_in: 3600, access_token: "user-access-token", refresh_token: "refresh" });
    }
    if (path === "/api/v1/me") {
      return json({ resource: "user", id: 7, firstName: "Jamie", email: "jamie@example.com", isMfaEnabled: mfa });
    }
    if (path === "/api/v1/users/7/mfa-methods") {
      return json({ _embedded: { user_mfa_methods: mfa ? [{
        resource: "user_mfa_method", userId: 7, method: "authenticator", isEnabled: true, details: { secret: "TOTP-SECRET", qrCode: "data:image/png" },
      }, { resource: "user_mfa_method", userId: 7, method: "sms", isEnabled: false }] : [] }, count: mfa ? 2 : 0 });
    }
    const tooMany = (detail) => new Response(JSON.stringify({
      status: 429, title: "Too Many Requests", detail, retryAfter: 540,
      _links: { documentation: { href: "https://docs.ominity.com/overview/handling-errors", type: "text/html" } },
    }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "540" } });
    if (limited && (path.endsWith("/validate") || path.endsWith("/send"))) {
      return tooMany("Too many wrong codes. Try again later.");
    }
    if (path === "/api/v1/users/7/mfa-methods/authenticator/validate") {
      return new Response(JSON.stringify({ success: (await request.clone().text()).includes("123456") }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path === "/api/v1/users/7/logins") {
      return json({ resource: "user_login", id: 1, userId: 7, createdAt: "2026-10-29T00:00:00Z" }, 201);
    }
    return json({}, 404);
  };
  return { calls, httpClient: new HTTPClient({ fetcher }) };
}

function post(path, body) {
  return new Request(`${SITE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("a user with MFA gets a pending session that grants nothing until the code is verified", async () => {
  const jar = cookieJar();
  globalThis.__ominityTestCookies = jar;
  const { calls, httpClient } = api({ mfa: true });
  const config = {
    ominityBaseUrl: "https://tenant.ominity.test/api",
    authClientId: "client",
    authClientSecret: "secret",
    authSessionSecret: SECRET,
    sdkHttpClient: httpClient,
  };

  const login = await (await createOminityAuthLoginRouteHandler(config)(post("/api/auth/login", {
    email: "jamie@example.com",
    password: "correct horse",
  }))).json();
  assert.equal(login.status, "mfa_required");
  assert.deepEqual(login.methods.map((method) => method.method), ["authenticator"], "only the methods the user turned on, under Ominity's own names");
  assert.equal(JSON.stringify(login).includes("TOTP-SECRET"), false, "setup secrets never reach the browser");
  assert.equal(calls.includes("POST /api/v1/users/7/logins"), false, "login activity waits for the second factor");

  assert.equal(await readOminityAuthSession(config, jar), null, "the gateway and account routes see no session");
  assert.ok(await readOminityAuthSession(config, jar, { allowPendingMfa: true }));
  assert.equal((await (await createOminityAuthMeRouteHandler(config)(new Request(`${SITE}/api/auth/me`))).json()).status, "mfa_required");

  const wrong = await createOminityAuthMfaValidateRouteHandler(config)(post("/api/auth/mfa/validate", { method: "authenticator", code: "000000" }));
  assert.equal(wrong.status, 422);
  assert.equal(await readOminityAuthSession(config, jar), null);

  const verified = await (await createOminityAuthMfaValidateRouteHandler(config)(post("/api/auth/mfa/validate", {
    method: "authenticator",
    code: "123456",
  }))).json();
  assert.equal(verified.status, "authenticated");
  assert.equal(verified.user.resource, "user");
  assert.equal(verified.user.id, 7);
  assert.equal((await readOminityAuthSession(config, jar))?.userId, 7);
  assert.ok(calls.includes("POST /api/v1/users/7/logins"));

  const me = await (await createOminityAuthMeRouteHandler(config)(new Request(`${SITE}/api/auth/me`))).json();
  assert.equal(me.status, "authenticated");
  assert.equal(me.user.email, "jamie@example.com");
});

test("a user without MFA is signed in directly and receives the SDK User", async () => {
  const jar = cookieJar();
  globalThis.__ominityTestCookies = jar;
  const { httpClient } = api({ mfa: false });
  const config = { authClientId: "client", authClientSecret: "secret", authSessionSecret: SECRET, sdkHttpClient: httpClient };

  const login = await (await createOminityAuthLoginRouteHandler(config)(post("/api/auth/login", {
    email: "jamie@example.com",
    password: "correct horse",
  }))).json();
  assert.equal(login.status, "authenticated");
  assert.deepEqual(Object.keys(login).sort(), ["expiresAt", "status", "user"]);
  assert.equal(login.user.firstName, "Jamie");
  assert.equal(JSON.stringify(login).includes("user-access-token"), false);
  assert.ok(await readOminityAuthSession(config, jar));
});

test("a social sign-in that still needs MFA goes to the MFA page with a pending session", async () => {
  for (const [mfa, expected] of [[true, "/auth/mfa?socialLogin=mfa_required"], [false, "/account?socialLogin=success"]]) {
    const jar = cookieJar();
    globalThis.__ominityTestCookies = jar;
    const { httpClient } = api({ mfa });
    const config = {
      ominityBaseUrl: "https://tenant.ominity.test/api",
      ominityApiKey: "server-api-key",
      authSessionSecret: SECRET,
      siteUrl: SITE,
      sdkHttpClient: httpClient,
      socialLoginBasePath: "/api/auth/social",
      socialLoginSuccessPath: "/account",
      socialLoginMfaPath: "/auth/mfa",
    };

    const response = await createOminityAuthSocialRouteHandlers(config).GET(new Request(`${SITE}/api/auth/social/4/callback?code=once`));
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location"));
    assert.equal(`${location.pathname}?${location.searchParams.toString()}`.startsWith(expected), true, location.toString());
    const session = await readOminityAuthSession(config, jar);
    assert.equal(session === null, mfa, "the MFA user's session stays pending");
  }
});

test("too many wrong codes answer 429 with the wait, not \"invalid code\"", async () => {
  const jar = cookieJar();
  globalThis.__ominityTestCookies = jar;
  const { httpClient } = api({ mfa: true, limited: true });
  const config = {
    ominityBaseUrl: "https://tenant.ominity.test/api",
    authClientId: "client",
    authClientSecret: "secret",
    authSessionSecret: SECRET,
    sdkHttpClient: httpClient,
  };

  await createOminityAuthLoginRouteHandler(config)(post("/api/auth/login", { email: "jamie@example.com", password: "correct horse" }));

  for (const [handler, path, body, code] of [
    [createOminityAuthMfaValidateRouteHandler, "/api/auth/mfa/validate", { method: "authenticator", code: "123456" }, "MFA_RATE_LIMITED"],
    [createOminityAuthRecoveryValidateRouteHandler, "/api/auth/mfa/recovery/validate", { code: "K7Q2M9XA" }, "MFA_RATE_LIMITED"],
    [createOminityAuthMfaSendRouteHandler, "/api/auth/mfa/send", { method: "email" }, "MFA_SEND_RATE_LIMITED"],
  ]) {
    const response = await handler(config)(post(path, body));
    assert.equal(response.status, 429, path);
    assert.equal(response.headers.get("retry-after"), "540", path);
    const payload = await response.json();
    assert.equal(payload.code, code, path);
    assert.equal(payload.details.retryAfter, 540, path);
  }

  assert.equal(await readOminityAuthSession(config, jar), null, "still pending");
});
