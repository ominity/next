import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CUSTOMER_PERMISSIONS,
  CustomerAccountsError,
  createCustomerAccountsClient,
  findCustomerMembership,
  hasAnyCustomerPermission,
  hasEveryCustomerPermission,
  hasCustomerPermission,
  selectCustomerMembership,
} from "../dist/customer-accounts/index.js";
import {
  clearActiveCustomerId,
  createOminityCustomerAccountsRouteHandlers,
  readActiveCustomerId,
  writeActiveCustomerId,
} from "../dist/customer-accounts/server/index.js";
import { createOminitySdkCache } from "../dist/server/index.js";

const membership = {
  resource: "customer_user",
  userId: 7,
  customerId: 42,
  roleId: 3,
  isOwner: false,
  permissions: [
    CUSTOMER_PERMISSIONS.customerView,
    CUSTOMER_PERMISSIONS.usersView,
    "bookings.appointments.manage",
  ],
  firstName: "Jamie",
  lastName: "Doe",
  email: "jamie@example.com",
  updatedAt: "2026-09-12T00:00:00.000Z",
  createdAt: "2026-09-12T00:00:00.000Z",
};

test("customer permission helpers support core and module-registered permission keys", () => {
  assert.equal(hasCustomerPermission(membership, CUSTOMER_PERMISSIONS.usersView), true);
  assert.equal(hasCustomerPermission(membership, CUSTOMER_PERMISSIONS.usersManage), false);
  assert.equal(hasCustomerPermission(membership, "bookings.appointments.manage"), true);
  assert.equal(hasEveryCustomerPermission(membership, [
    CUSTOMER_PERMISSIONS.customerView,
    CUSTOMER_PERMISSIONS.usersView,
  ]), true);
  assert.equal(hasEveryCustomerPermission(membership, [
    CUSTOMER_PERMISSIONS.usersView,
    CUSTOMER_PERMISSIONS.usersManage,
  ]), false);
  assert.equal(hasAnyCustomerPermission(membership, [
    CUSTOMER_PERMISSIONS.usersManage,
    "bookings.appointments.manage",
  ]), true);
});

test("customer membership selection validates the preferred account and falls back predictably", () => {
  const second = { ...membership, customerId: 84 };
  assert.equal(findCustomerMembership([membership, second], 84)?.customerId, 84);
  assert.equal(findCustomerMembership([membership], -1), null);
  assert.equal(selectCustomerMembership([membership, second], 999)?.customerId, 42);
  assert.equal(selectCustomerMembership([], 42), null);
});

test("customer account client uses same-origin routes and keeps invitation tokens out of proxy URLs", async () => {
  const calls = [];
  const token = "a".repeat(64);
  const client = createCustomerAccountsClient({
    basePath: "/api/team/",
    fetch: async (input, init = {}) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await client.switchCustomer(42);
  await client.createInvitation({ email: "new@example.com", roleId: 3, language: "nl" });
  await client.inspectInvitation(token);
  await client.acceptInvitation(token);
  await client.updateMemberRole({ userId: 7, roleId: 4 });
  await client.revokeInvitation(9);

  assert.deepEqual(calls.map((call) => [call.init.method ?? "GET", call.url]), [
    ["POST", "/api/team/switch"],
    ["POST", "/api/team/invitations"],
    ["POST", "/api/team/invitations/inspect"],
    ["POST", "/api/team/invitations/accept"],
    ["PATCH", "/api/team/members/7"],
    ["DELETE", "/api/team/invitations/9"],
  ]);
  assert.equal(calls.some((call) => call.url.includes(token)), false);
  assert.deepEqual(JSON.parse(calls[0].init.body), { customerId: 42 });
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    email: "new@example.com",
    roleId: 3,
    language: "nl",
  });
  assert.deepEqual(JSON.parse(calls[2].init.body), { token });
  assert.equal(new Headers(calls[0].init.headers).get("accept"), "application/json");
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.equal(calls[0].init.cache, "no-store");
});

test("customer account client exposes structured backend failures", async () => {
  const client = createCustomerAccountsClient({
    fetch: async () => new Response(JSON.stringify({
      code: "INVITATION_EXPIRED",
      error: "This invitation has expired.",
      details: { expiresAt: "2026-09-01T00:00:00.000Z" },
    }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    }),
  });

  await assert.rejects(
    () => client.acceptInvitation("a".repeat(64)),
    (error) => {
      assert.equal(error instanceof CustomerAccountsError, true);
      assert.equal(error.status, 422);
      assert.equal(error.code, "INVITATION_EXPIRED");
      assert.equal(error.isValidationError, true);
      assert.equal(error.isRetryable, false);
      return true;
    },
  );
});

test("active customer cookies are HttpOnly and reject malformed account ids", () => {
  const values = new Map();
  const writes = [];
  const store = {
    get(name) {
      const value = values.get(name);
      return typeof value === "string" ? { value } : undefined;
    },
    set(name, value, options) {
      values.set(name, value);
      writes.push({ name, value, options });
    },
  };

  writeActiveCustomerId(store, 42, { secure: false, maxAgeSeconds: 60 });
  assert.equal(readActiveCustomerId(store), 42);
  assert.deepEqual(writes[0], {
    name: "ominity_active_customer",
    value: "42",
    options: {
      path: "/",
      maxAge: 60,
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    },
  });

  values.set("ominity_active_customer", "../../admin");
  assert.equal(readActiveCustomerId(store), null);
  clearActiveCustomerId(store, { secure: false });
  assert.equal(writes.at(-1).options.maxAge, 0);
});

test("public invitation inspection delegates to the SDK 1.4 invitation contract", async () => {
  const originalFetch = globalThis.fetch;
  const token = "b".repeat(64);
  let upstreamRequest = null;
  globalThis.fetch = async (input, init) => {
    upstreamRequest = input instanceof Request ? input : new Request(input, init);
    return new Response(JSON.stringify({
      resource: "customer_user_invitation",
      id: 11,
      customerId: 42,
      roleId: 3,
      channelId: 8,
      userId: null,
      email: "new@example.com",
      existingUser: false,
      requiresAccountCreation: true,
      status: "pending",
      expiresAt: "2026-09-20T00:00:00.000Z",
      acceptedAt: null,
      revokedAt: null,
      updatedAt: "2026-09-12T00:00:00.000Z",
      createdAt: "2026-09-12T00:00:00.000Z",
    }), {
      status: 200,
      headers: { "Content-Type": "application/hal+json" },
    });
  };

  try {
    const handlers = createOminityCustomerAccountsRouteHandlers({
      ominityBaseUrl: "https://example.ominity.test/api",
      channelId: "8",
      resolveLanguage: () => "nl",
    });
    const response = await handlers.POST(new Request(
      "https://store.example.com/api/customer-accounts/invitations/inspect",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      },
    ));
    const invitation = await response.json();

    assert.equal(response.status, 200);
    assert.equal(invitation.requiresAccountCreation, true);
    assert.equal(upstreamRequest.method, "GET");
    assert.equal(
      upstreamRequest.url,
      `https://example.ominity.test/api/v1/commerce/customer-user-invitations/${token}`,
    );
    assert.equal(upstreamRequest.headers.get("accept-language"), "nl");
    assert.equal(upstreamRequest.headers.get("x-channel-id"), "8");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the published SDK preserves the generated user customer-membership operation", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest = null;
  globalThis.fetch = async (input, init) => {
    upstreamRequest = input instanceof Request ? input : new Request(input, init);
    return new Response(JSON.stringify({
      _embedded: { customer_users: [membership] },
      count: 1,
      page: 1,
      limit: 250,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    }), {
      status: 200,
      headers: { "Content-Type": "application/hal+json" },
    });
  };

  try {
    const sdk = createOminitySdkCache({
      getOptions: () => ({
        serverURL: "https://example.ominity.test/api",
        security: { oAuth: "user-access-token" },
      }),
    }).get();
    const memberships = await sdk.users.customers.list({
      id: 7,
      include: "customer,role",
      page: 1,
      limit: 250,
    });

    assert.equal(memberships.items[0].customerId, 42);
    assert.equal(
      upstreamRequest.url,
      "https://example.ominity.test/api/v1/users/7/customers?include=customer%2Crole&page=1&limit=250",
    );
    assert.equal(upstreamRequest.headers.get("authorization"), "Bearer user-access-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
