import assert from "node:assert/strict";
import { test } from "node:test";

import { createAuthClient } from "../dist/auth/index.js";

async function parseRequestBody(input) {
  if (!(input instanceof Request)) {
    return null;
  }

  const raw = await input.text();
  if (raw.length === 0) {
    return null;
  }

  return JSON.parse(raw);
}

test("createAuthClient normalizes MFA, recovery, oauth accounts, customers and password reset flows", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (!(input instanceof Request)) {
      throw new Error("Expected request object");
    }

    const { pathname } = new URL(input.url);

    if (pathname === "/api/v1/users/7/mfa-methods" && input.method === "GET") {
      return new Response(JSON.stringify({
        _embedded: {
          user_mfa_methods: [
            {
              resource: "user_mfa_method",
              userId: 7,
              method: "totp",
              isEnabled: true,
              verifiedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        count: 1,
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/hal+json",
        },
      });
    }

    if (pathname === "/api/v1/users/7/mfa-methods/totp/send" && input.method === "POST") {
      return new Response(JSON.stringify({
        success: true,
        message: "MFA code sent",
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    if (pathname === "/api/v1/users/7/recovery-codes" && input.method === "GET") {
      return new Response(JSON.stringify({
        _embedded: {
          user_recovery_codes: [
            {
              resource: "user_recovery_code",
              id: 99,
              code: "abc-123",
            },
          ],
        },
        count: 1,
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/hal+json",
        },
      });
    }

    if (pathname === "/api/v1/users/7/recovery-codes/validate" && input.method === "POST") {
      const body = await parseRequestBody(input);
      assert.equal(body.code, "abc-123");

      return new Response(JSON.stringify({
        success: true,
        message: "valid",
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    if (pathname === "/api/v1/users/7/oauthaccounts" && input.method === "GET") {
      return new Response(JSON.stringify({
        _embedded: {
          socialprovider_users: [
            {
              resource: "socialprovider_user",
              id: 12,
              providerId: 4,
              userId: 7,
              identifier: "google_12",
              name: "John Doe",
              email: "john@example.com",
              avatar: null,
              updatedAt: "2026-01-01T00:00:00.000Z",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        count: 1,
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/hal+json",
        },
      });
    }

    if (pathname === "/api/v1/users/7/customers" && input.method === "GET") {
      return new Response(JSON.stringify({
        _embedded: {
          customer_users: [
            {
              resource: "customer_user",
              userId: 7,
              customerId: 55,
              roleId: 2,
              firstName: "John",
              lastName: "Doe",
              email: "john@example.com",
              updatedAt: "2026-01-01T00:00:00.000Z",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        count: 1,
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/hal+json",
        },
      });
    }

    if (pathname === "/api/v1/users/password-reset/send" && input.method === "POST") {
      const body = await parseRequestBody(input);
      assert.equal(body.email, "john@example.com");
      assert.equal(body.redirectUrl, "https://app.example.com/reset");

      return new Response(JSON.stringify({
        success: true,
        message: "sent",
        expiresAt: "2026-01-02T00:00:00.000Z",
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    if (pathname === "/api/v1/users/password-reset/update" && input.method === "POST") {
      const body = await parseRequestBody(input);
      assert.equal(body.email, "john@example.com");
      assert.equal(body.token, "reset-token");
      assert.equal(body.password, "new-password");

      return new Response(JSON.stringify({
        success: true,
        message: "updated",
        updatedAt: "2026-01-01T01:00:00.000Z",
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    throw new Error(`Unhandled request: ${input.method} ${input.url}`);
  };

  try {
    const client = createAuthClient({
      sdk: {
        serverURL: "https://example.ominity.test/api",
      },
    });

    const mfaMethods = await client.listUserMfaMethods({ userId: 7 });
    assert.equal(mfaMethods.items.length, 1);
    assert.equal(mfaMethods.items[0].method, "totp");
    assert.equal(mfaMethods.items[0].isEnabled, true);

    const mfaSend = await client.sendUserMfaCode({
      userId: 7,
      method: "totp",
    });
    assert.equal(mfaSend.success, true);

    const recoveryCodes = await client.listUserRecoveryCodes({ userId: 7 });
    assert.equal(recoveryCodes.items.length, 1);
    assert.equal(recoveryCodes.items[0].id, 99);

    const recoveryValidation = await client.validateUserRecoveryCode({
      userId: 7,
      code: "abc-123",
    });
    assert.equal(recoveryValidation.success, true);

    const oauthAccounts = await client.listUserOAuthAccounts({ userId: 7 });
    assert.equal(oauthAccounts.items.length, 1);
    assert.equal(oauthAccounts.items[0].providerId, 4);

    const customers = await client.listUserCustomers({ userId: 7 });
    assert.equal(customers.items.length, 1);
    assert.equal(customers.items[0].customerId, 55);

    const resetLink = await client.sendPasswordResetLink({
      email: "john@example.com",
      redirectUrl: "https://app.example.com/reset",
    });
    assert.equal(resetLink.success, true);
    assert.equal(resetLink.message, "sent");

    const resetPassword = await client.resetPassword({
      email: "john@example.com",
      token: "reset-token",
      password: "new-password",
    });
    assert.equal(resetPassword.success, true);
    assert.equal(resetPassword.message, "updated");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
