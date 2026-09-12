import assert from "node:assert/strict";
import { test } from "node:test";

import {
  completeOminityAuthSocialLogin,
  recordOminityAuthLoginActivity,
} from "../dist/auth/server/index.js";

test("recordOminityAuthLoginActivity derives request metadata on the server", async () => {
  const originalFetch = globalThis.fetch;
  let forwardedRequest = null;
  globalThis.fetch = async (input) => {
    assert.ok(input instanceof Request);
    forwardedRequest = input.clone();
    return new Response(JSON.stringify({
      resource: "user_login",
      id: 91,
      userId: 7,
      ipAddress: "198.51.100.24",
      location: null,
      device: "macOS",
      browser: "Safari",
      userAgent: "Browser UA",
      createdAt: "2026-09-12T10:00:00.000Z",
    }), {
      status: 201,
      headers: { "Content-Type": "application/hal+json" },
    });
  };

  try {
    const activity = await recordOminityAuthLoginActivity({
      ominityBaseUrl: "https://example.ominity.test/api",
    }, {
      request: new Request("https://storefront.test/api/auth/login", {
        headers: {
          "user-agent": "Browser UA",
          "x-ominity-client-ip": "198.51.100.24",
        },
      }),
      session: {
        accessToken: "user-access-token",
        tokenType: "Bearer",
        expiresAt: "2030-01-01T00:00:00.000Z",
        userId: 7,
      },
    });

    assert.equal(activity?.id, 91);
    assert.ok(forwardedRequest instanceof Request);
    assert.equal(
      new URL(forwardedRequest.url).pathname,
      "/api/v1/users/7/logins",
    );
    assert.equal(forwardedRequest.headers.get("authorization"), "Bearer user-access-token");
    assert.deepEqual(JSON.parse(await forwardedRequest.text()), {
      ipAddress: "198.51.100.24",
      userAgent: "Browser UA",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recordOminityAuthLoginActivity reports missing user context without failing auth", async () => {
  let reported = null;
  const activity = await recordOminityAuthLoginActivity({
    onLoginActivityError(error, context) {
      reported = { error, context };
    },
  }, {
    request: new Request("https://storefront.test/api/auth/login"),
    session: {
      accessToken: "user-access-token",
      tokenType: "Bearer",
      expiresAt: "2030-01-01T00:00:00.000Z",
    },
  });

  assert.equal(activity, null);
  assert.ok(reported?.error instanceof Error);
  assert.equal(reported?.context.ipAddress, "unknown");
  assert.equal(reported?.context.userAgent, "unknown");
});

test("completeOminityAuthSocialLogin writes the session and records the provider login", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const events = [];
  const cookies = new Map();
  const cookieStore = {
    get(name) {
      const value = cookies.get(name);
      return typeof value === "string" ? { value } : undefined;
    },
    set(name, value, options) {
      cookies.set(name, value);
      events.push({ type: "cookie", name, options });
    },
  };

  globalThis.fetch = async (input) => {
    assert.ok(input instanceof Request);
    const request = input.clone();
    const url = new URL(request.url);
    calls.push({
      method: request.method,
      path: url.pathname,
      query: url.search,
      authorization: request.headers.get("authorization"),
    });

    if (url.pathname === "/api/v1/settings/socialproviders/4/users/token") {
      return Response.json({
        resource: "socialprovider_user",
        id: 12,
        providerId: 4,
        userId: 7,
        identifier: "provider-user-7",
        email: "user@example.com",
        updatedAt: "2026-09-12T10:00:00.000Z",
        createdAt: "2026-09-12T10:00:00.000Z",
      }, { headers: { "Content-Type": "application/hal+json" } });
    }

    if (url.pathname === "/api/v1/users/7/token") {
      return Response.json({
        token_type: "Bearer",
        expires_in: 3600,
        access_token: "social-user-access-token",
        refresh_token: "social-user-refresh-token",
      });
    }

    if (url.pathname === "/api/v1/me") {
      return Response.json({
        resource: "user",
        id: 7,
        firstName: "Social",
        lastName: "User",
        email: "user@example.com",
      }, { headers: { "Content-Type": "application/hal+json" } });
    }

    if (url.pathname === "/api/v1/users/7/logins") {
      events.push({ type: "login" });
      assert.deepEqual(JSON.parse(await request.text()), {
        ipAddress: "203.0.113.42",
        userAgent: "OAuth browser",
      });
      return Response.json({
        resource: "user_login",
        id: 92,
        userId: 7,
        ipAddress: "203.0.113.42",
        location: null,
        device: "macOS",
        browser: "Safari",
        userAgent: "OAuth browser",
        createdAt: "2026-09-12T10:01:00.000Z",
      }, {
        status: 201,
        headers: { "Content-Type": "application/hal+json" },
      });
    }

    return new Response(null, { status: 404 });
  };

  try {
    const result = await completeOminityAuthSocialLogin({
      ominityBaseUrl: "https://example.ominity.test/api",
      ominityApiKey: "server-api-key",
      authSessionSecret: "test-auth-session-secret-at-least-32-characters",
    }, {
      request: new Request("https://storefront.test/api/auth/social/4/callback?code=once", {
        headers: {
          "user-agent": "OAuth browser",
          "x-ominity-client-ip": "203.0.113.42",
        },
      }),
      providerId: 4,
      code: "once",
      cookieStore,
    });

    assert.equal(result.user.id, 7);
    assert.equal(result.providerUser.providerId, 4);
    assert.equal(result.session.userId, 7);
    assert.ok(cookies.get("ominity_auth_session"));
    assert.equal(cookies.get("ominity_auth_session").includes("social-user-access-token"), false);
    assert.deepEqual(calls.map(({ method, path, query }) => ({ method, path, query })), [
      {
        method: "GET",
        path: "/api/v1/settings/socialproviders/4/users/token",
        query: "?code=once",
      },
      { method: "GET", path: "/api/v1/users/7/token", query: "" },
      { method: "GET", path: "/api/v1/me", query: "" },
      { method: "POST", path: "/api/v1/users/7/logins", query: "" },
    ]);
    assert.equal(calls[1].authorization, "Bearer server-api-key");
    assert.equal(calls[2].authorization, "Bearer social-user-access-token");
    assert.equal(calls[3].authorization, "Bearer social-user-access-token");
    assert.deepEqual(events.map((event) => event.type), ["cookie", "login"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("completeOminityAuthSocialLogin rejects an unlinked provider account", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  let cookieWritten = false;
  globalThis.fetch = async () => {
    requestCount += 1;
    return Response.json({
      resource: "socialprovider_user",
      id: 13,
      providerId: 4,
      userId: null,
      identifier: "unlinked-provider-user",
      email: "unlinked@example.com",
      updatedAt: "2026-09-12T10:00:00.000Z",
      createdAt: "2026-09-12T10:00:00.000Z",
    }, { headers: { "Content-Type": "application/hal+json" } });
  };

  try {
    await assert.rejects(
      completeOminityAuthSocialLogin({
        ominityBaseUrl: "https://example.ominity.test/api",
        ominityApiKey: "server-api-key",
        authSessionSecret: "test-auth-session-secret-at-least-32-characters",
      }, {
        request: new Request("https://storefront.test/api/auth/social/4/callback?code=once"),
        providerId: 4,
        code: "once",
        cookieStore: {
          get() {
            return undefined;
          },
          set() {
            cookieWritten = true;
          },
        },
      }),
      (error) => error?.code === "SOCIAL_ACCOUNT_NOT_LINKED",
    );
    assert.equal(requestCount, 1);
    assert.equal(cookieWritten, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
