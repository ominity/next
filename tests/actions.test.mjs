import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createOminityResourceClient,
  OminityActionError,
  requestOminityAction,
} from "../dist/actions/index.js";
import {
  createOminityAction,
  OminityActionHttpError,
} from "../dist/actions/server/index.js";
import {
  resolveOminityActiveCustomerMembership,
} from "../dist/customer-accounts/server/index.js";

function standardSchema(validate) {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate,
    },
  };
}

test("action handlers validate query, JSON body, and async route parameters", async () => {
  const handler = createOminityAction({
    method: "POST",
    sameOrigin: true,
    siteUrl: "https://store.example.com",
    idempotency: { required: true },
    resolveContext: () => ({ tenant: "storefront" }),
    query: standardSchema((value) => ({
      value: { tags: value.tag },
    })),
    body: standardSchema((value) => {
      if (typeof value?.name !== "string") {
        return { issues: [{ path: ["name"], message: "Name is required." }] };
      }
      return { value: { name: value.name.trim() } };
    }),
    params: (value) => ({ id: Number(value.id) }),
    successStatus: 201,
    execute({ tenant, input, idempotencyKey }) {
      return {
        tenant,
        id: input.params.id,
        name: input.body.name,
        tags: input.query.tags,
        idempotencyKey,
      };
    },
  });

  const response = await handler(new Request(
    "https://store.example.com/api/widgets?tag=one&tag=two",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "create-widget-42",
        Origin: "https://store.example.com",
      },
      body: JSON.stringify({ name: " Widget " }),
    },
  ), { params: Promise.resolve({ id: "42" }) });

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    tenant: "storefront",
    id: 42,
    name: "Widget",
    tags: ["one", "two"],
    idempotencyKey: "create-widget-42",
  });
});

test("action validation produces field errors and rejects malformed JSON", async () => {
  const handler = createOminityAction({
    method: "POST",
    resolveContext: () => ({}),
    body: standardSchema(() => ({
      issues: [
        { path: ["email"], message: "Enter an email address." },
        { path: [{ key: "email" }], message: "Use a valid domain." },
      ],
    })),
    execute: () => ({ ok: true }),
  });

  const invalid = await handler(new Request("https://store.example.com/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }));
  assert.equal(invalid.status, 422);
  assert.deepEqual((await invalid.json()).details.fields.email, [
    "Enter an email address.",
    "Use a valid domain.",
  ]);

  const malformed = await handler(new Request("https://store.example.com/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  }));
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "INVALID_JSON");
});

test("action handlers reject cross-site mutations before resolving credentials", async () => {
  let resolved = false;
  const handler = createOminityAction({
    method: "DELETE",
    sameOrigin: true,
    siteUrl: "https://store.example.com",
    resolveContext: () => {
      resolved = true;
      return {};
    },
    execute: () => undefined,
    successStatus: 204,
  });

  const response = await handler(new Request("https://store.example.com/api/widgets/42", {
    method: "DELETE",
    headers: { Origin: "https://attacker.example" },
  }));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).code, "INVALID_ORIGIN");
  assert.equal(resolved, false);
});

test("action handlers expose deliberate errors and sanitize unexpected failures", async () => {
  const deliberate = createOminityAction({
    method: "GET",
    resolveContext: () => ({}),
    execute() {
      throw new OminityActionHttpError(409, "ALREADY_EXISTS", "This item already exists.");
    },
  });
  const deliberateResponse = await deliberate(new Request("https://store.example.com/api/item"));
  assert.deepEqual(await deliberateResponse.json(), {
    error: "This item already exists.",
    code: "ALREADY_EXISTS",
  });

  const unexpected = createOminityAction({
    method: "GET",
    resolveContext: () => ({}),
    error: { code: "WIDGET_LOAD_FAILED", message: "Could not load widgets." },
    execute() {
      throw new Error("database password appeared here");
    },
  });
  const unexpectedResponse = await unexpected(new Request("https://store.example.com/api/item"));
  assert.equal(unexpectedResponse.status, 500);
  assert.deepEqual(await unexpectedResponse.json(), {
    error: "Could not load widgets.",
    code: "WIDGET_LOAD_FAILED",
  });

  const upstreamValidation = createOminityAction({
    method: "POST",
    resolveContext: () => ({}),
    execute() {
      throw {
        status: 422,
        detail: "SQLSTATE details must stay private",
        fields: { email: ["This email address is already used."] },
      };
    },
  });
  const validationResponse = await upstreamValidation(new Request(
    "https://store.example.com/api/item",
    { method: "POST" },
  ));
  assert.deepEqual(await validationResponse.json(), {
    error: "The submitted data is invalid.",
    code: "VALIDATION_FAILED",
    details: { fields: { email: ["This email address is already used."] } },
  });
});

test("resource clients cover CRUD, query arrays, idempotency, and structured errors", async () => {
  const calls = [];
  const client = createOminityResourceClient({
    basePath: "/api/widgets/",
    fetch: async (input, init = {}) => {
      calls.push({ input: String(input), init });
      if (String(input).endsWith("/missing")) {
        return new Response(JSON.stringify({
          error: "Widget not found.",
          code: "NOT_FOUND",
        }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (init.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ id: 42 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await client.list({ status: ["open", "paid"], page: 2 });
  await client.create({ name: "Widget" }, { idempotencyKey: "widget-42" });
  await client.update(42, { name: "Updated" });
  await client.remove(42);

  assert.deepEqual(calls.map((call) => [call.init.method, call.input]), [
    ["GET", "/api/widgets?status=open&status=paid&page=2"],
    ["POST", "/api/widgets"],
    ["PATCH", "/api/widgets/42"],
    ["DELETE", "/api/widgets/42"],
  ]);
  assert.equal(new Headers(calls[1].init.headers).get("idempotency-key"), "widget-42");
  assert.equal(calls.every((call) => call.init.credentials === "same-origin"), true);
  assert.equal(calls.every((call) => call.init.cache === "no-store"), true);

  await assert.rejects(
    () => client.get("missing"),
    (error) => {
      assert.equal(error instanceof OminityActionError, true);
      assert.equal(error.status, 404);
      assert.equal(error.code, "NOT_FOUND");
      assert.equal(error.isRetryable, false);
      return true;
    },
  );
});

test("request helper requires same-origin paths", async () => {
  await assert.rejects(
    () => requestOminityAction("https://attacker.example/proxy"),
    /same-origin path/,
  );
});

test("active customer resolution replaces a stale cookie with a valid membership", async () => {
  const values = new Map([["ominity_active_customer", "999"]]);
  const writes = [];
  const cookieStore = {
    get(name) {
      const value = values.get(name);
      return typeof value === "string" ? { value } : undefined;
    },
    set(name, value, options) {
      values.set(name, value);
      writes.push({ name, value, options });
    },
  };
  const membership = {
    resource: "customer_user",
    userId: 7,
    customerId: 42,
    roleId: 3,
    isOwner: false,
    permissions: ["commerce.orders.view"],
    firstName: "Jamie",
    lastName: "Doe",
    email: "jamie@example.com",
    updatedAt: "2026-09-13T00:00:00.000Z",
    createdAt: "2026-09-13T00:00:00.000Z",
  };
  const sdk = {
    users: {
      customers: {
        get: async () => {
          throw { statusCode: 404 };
        },
        list: async () => ({ items: [membership] }),
      },
    },
  };

  const result = await resolveOminityActiveCustomerMembership(
    { nodeEnv: "development" },
    { context: { cookieStore, userId: 7 }, sdk },
  );

  assert.equal(result.customerId, 42);
  assert.equal(result.membership, membership);
  assert.equal(values.get("ominity_active_customer"), "42");
  assert.deepEqual(writes.map((write) => write.value), ["", "42"]);
});
