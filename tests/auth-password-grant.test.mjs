import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAuthSession,
  isAuthSessionExpired,
  requestPasswordGrantToken,
  requestRefreshToken,
  requestUserAccessToken,
  sealAuthSession,
  unsealAuthSession,
} from "../dist/auth/index.js";
import {
  readAuthSessionCookie,
  writeAuthSessionCookie,
} from "../dist/next/auth.js";

function parseJsonBody(input) {
  if (!(input instanceof Request)) {
    return Promise.resolve(null);
  }

  return input.text().then((raw) => (raw.length > 0 ? JSON.parse(raw) : null));
}

test("requestPasswordGrantToken issues oauth2 password grant via SDK", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push({
      url: input instanceof Request ? input.url : String(input),
      method: input instanceof Request ? input.method : "GET",
      body: await parseJsonBody(input),
    });

    return new Response(JSON.stringify({
      access_token: "access-token",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "refresh-token",
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  try {
    const token = await requestPasswordGrantToken({
      sdk: {
        serverURL: "https://example.ominity.test/api",
      },
      username: "john@example.com",
      password: "secret",
      clientId: "web-client",
      clientSecret: "web-secret",
      scope: "read write",
    });

    assert.equal(token.accessToken, "access-token");
    assert.equal(token.refreshToken, "refresh-token");
    assert.equal(Number.isFinite(Date.parse(token.expiresAt)), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://example.ominity.test/api/oauth2/token");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].body.grant_type, "password");
    assert.equal(calls[0].body.username, "john@example.com");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestRefreshToken issues oauth2 refresh grant via SDK", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const body = await parseJsonBody(input);
    assert.equal(body.grant_type, "refresh_token");
    assert.equal(body.refresh_token, "refresh-token");
    return new Response(JSON.stringify({
      access_token: "new-token",
      token_type: "Bearer",
      expires_in: 1800,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  try {
    const token = await requestRefreshToken({
      sdk: {
        serverURL: "https://example.ominity.test/api",
      },
      refreshToken: "refresh-token",
      clientId: "web-client",
      clientSecret: "web-secret",
    });
    assert.equal(token.accessToken, "new-token");
    assert.equal(token.expiresIn, 1800);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestUserAccessToken uses users issue token endpoint", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (!(input instanceof Request)) {
      throw new Error("Expected request");
    }

    assert.equal(input.method, "POST");
    assert.equal(input.url, "https://example.ominity.test/api/v1/users/42/token");
    return new Response(JSON.stringify({
      access_token: "user-access-token",
      token_type: "Bearer",
      expires_in: 900,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  try {
    const token = await requestUserAccessToken({
      sdk: {
        serverURL: "https://example.ominity.test/api",
      },
      userId: 42,
    });
    assert.equal(token.accessToken, "user-access-token");
    assert.equal(token.expiresIn, 900);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("auth session seal/unseal and expiration check", async () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const session = createAuthSession({
    accessToken: "access-token",
    tokenType: "Bearer",
    expiresIn: 60,
    expiresAt: "2026-01-01T00:01:00.000Z",
    raw: {},
  }, {
    now,
    userId: 42,
    email: "john@example.com",
  });

  const encoded = await sealAuthSession(session, {
    secret: "test-super-secret-key-that-is-long-enough",
  });
  const decoded = await unsealAuthSession(encoded, {
    secret: "test-super-secret-key-that-is-long-enough",
  });

  assert.equal(decoded.accessToken, "access-token");
  assert.equal(decoded.userId, 42);
  assert.equal(decoded.email, "john@example.com");

  assert.equal(
    isAuthSessionExpired(decoded, new Date("2026-01-01T00:00:30.000Z")),
    false,
  );
  assert.equal(
    isAuthSessionExpired(decoded, new Date("2026-01-01T00:02:00.000Z")),
    true,
  );
});

test("next auth cookie helpers sign and read session cookies", async () => {
  const cookies = new Map();
  const writer = {
    set(name, value) {
      cookies.set(name, value);
    },
  };
  const reader = {
    get(name) {
      const value = cookies.get(name);
      return typeof value === "string" ? { value } : undefined;
    },
  };

  await writeAuthSessionCookie(writer, {
    accessToken: "cookie-token",
    tokenType: "Bearer",
    expiresAt: "2026-01-01T00:10:00.000Z",
  }, {
    sessionSecret: "test-super-secret-key-that-is-long-enough",
  });

  const session = await readAuthSessionCookie(reader, {
    sessionSecret: "test-super-secret-key-that-is-long-enough",
  });

  assert.ok(session);
  assert.equal(session.accessToken, "cookie-token");
});
