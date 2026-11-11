import assert from "node:assert/strict";
import { test } from "node:test";

import { HTTPClient } from "@ominity/api-typescript";

import { createOminityCustomerAccountsRouteHandlers } from "../dist/customer-accounts/server/index.js";
import {
  createOminityAuthEmailCodeSendRouteHandler,
  createOminityAuthEmailCodeVerifyRouteHandler,
  readOminityAuthSession,
} from "../dist/auth/server/index.js";

const SITE = "https://app.example.com";
const SECRET = "s".repeat(40);

function cookieJar() {
  const values = new Map();
  return {
    values,
    get: (name) => (values.has(name) ? { value: values.get(name) } : undefined),
    set: (name, value, options = {}) => (options.maxAge === 0 ? values.delete(name) : values.set(name, value)),
  };
}

function api({ mfa = false, codeStatus = 202 } = {}) {
  const requests = [];
  const json = (body, status = 200, type = "application/hal+json") => new Response(JSON.stringify(body), { status, headers: { "Content-Type": type } });
  const fetcher = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    const body = request.method === "POST" ? await request.clone().text() : "";
    requests.push({ method: request.method, path, body, authorization: request.headers.get("authorization") });
    if (path === "/api/v1/users/email-codes") {
      // Ominity answers this endpoint with plain JSON, not HAL.
      return codeStatus === 202
        ? json({ expiresAt: "2026-11-04T10:15:00+00:00", resendAvailableAt: "2026-11-04T10:01:00+00:00" }, 202, "application/json")
        : json({ status: codeStatus, title: "Too Many Requests", detail: "Too many codes were requested." }, codeStatus, "application/json");
    }
    if (request.method === "POST" && path.includes("oauth")) {
      return new URLSearchParams(body).get("code") === "123456" || body.includes("123456")
        ? json({ token_type: "Bearer", expires_in: 3600, access_token: "user-access-token", refresh_token: "refresh" })
        : json({ error: "invalid_grant", message: "The code is wrong or has expired." }, 400);
    }
    if (path === "/api/v1/me") {
      return json({ resource: "user", id: 9, firstName: "", email: "new@example.com", isMfaEnabled: mfa });
    }
    if (path === "/api/v1/users/9/mfa-methods") {
      return json({ _embedded: { user_mfa_methods: mfa ? [{ resource: "user_mfa_method", userId: 9, method: "authenticator", isEnabled: true }] : [] }, count: mfa ? 1 : 0 });
    }
    if (path === "/api/v1/users/9/customers" && request.method === "POST") {
      const input = JSON.parse(body);
      return input.name
        ? json({ resource: "customer_user", userId: 9, customerId: 55, roleId: 1, isOwner: true, permissions: [] }, 201)
        : json({ message: "Customer accounts can't be created here.", code: "customer.self_service_disabled", errors: { name: ["Customer accounts can't be created here."] } }, 422);
    }
    if (path === "/api/v1/users/9/customers") {
      return json({
        _embedded: { customer_users: [{
          resource: "customer_user", userId: 9, customerId: 55, roleId: 1, isOwner: true, permissions: [],
          firstName: "", lastName: "", email: "new@example.com", updatedAt: "2026-11-04T00:00:00.000Z", createdAt: "2026-11-04T00:00:00.000Z",
        }] },
        count: 1, page: 1, limit: 250, totalPages: 1, hasNext: false, hasPrevious: false,
      });
    }
    if (path === "/api/v1/users/9/logins") {
      return json({ resource: "user_login", id: 1, userId: 9, createdAt: "2026-11-04T00:00:00Z" }, 201);
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

test("sending a code asks Ominity with the API key and links to this site's verify page", async () => {
  const { requests, httpClient } = api();
  const response = await createOminityAuthEmailCodeSendRouteHandler(config(httpClient))(post("/api/auth/email-code/send", {
    email: " New@Example.com ",
    // Never used: the email must not link anywhere else.
    redirectUrl: "https://evil.example/steal",
  }, { "user-agent": "Test/1.0", "x-forwarded-for": "203.0.113.7" }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, expiresAt: "2026-11-04T10:15:00+00:00", resendAvailableAt: "2026-11-04T10:01:00+00:00" });

  const sent = requests.find((request) => request.path === "/api/v1/users/email-codes");
  assert.equal(sent.authorization, `Bearer ${"k".repeat(32)}`);
  const body = JSON.parse(sent.body);
  assert.equal(body.email, "new@example.com");
  assert.equal(body.redirectUrl, `${SITE}/auth/verify`);
  assert.equal(body.ipAddress, "203.0.113.7");
  assert.equal(body.userAgent, "Test/1.0");
});

test("the verify page path is configurable and invalid emails are refused before Ominity", async () => {
  const { requests, httpClient } = api();
  await createOminityAuthEmailCodeSendRouteHandler(config(httpClient, { emailCodePath: "/signup/verify" }))(post("/api/auth/email-code/send", { email: "a@example.com" }));
  assert.equal(JSON.parse(requests[0].body).redirectUrl, `${SITE}/signup/verify`);

  const invalid = await createOminityAuthEmailCodeSendRouteHandler(config(httpClient))(post("/api/auth/email-code/send", { email: "nope" }));
  assert.equal(invalid.status, 400);
  assert.equal(requests.length, 1);
});

test("rate limits from Ominity come back as 429", async () => {
  const { httpClient } = api({ codeStatus: 429 });
  const response = await createOminityAuthEmailCodeSendRouteHandler(config(httpClient))(post("/api/auth/email-code/send", { email: "a@example.com" }));
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, "EMAIL_CODE_RATE_LIMITED");
});

test("a correct code starts a session with the email_code grant", async () => {
  const jar = cookieJar();
  globalThis.__ominityTestCookies = jar;
  const { requests, httpClient } = api();
  const settings = config(httpClient);

  const wrong = await createOminityAuthEmailCodeVerifyRouteHandler(settings)(post("/api/auth/email-code/verify", { email: "new@example.com", code: "000000" }));
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).code, "INVALID_CODE");
  assert.equal(await readOminityAuthSession(settings, jar), null);

  const state = await (await createOminityAuthEmailCodeVerifyRouteHandler(settings)(post("/api/auth/email-code/verify", { email: "new@example.com", code: "123 456" }))).json();
  assert.equal(state.status, "authenticated");
  assert.equal(state.user.id, 9);
  assert.equal((await readOminityAuthSession(settings, jar))?.userId, 9);

  const token = requests.filter((request) => request.path.includes("oauth")).at(-1);
  assert.match(token.body, /email_code/);
  assert.match(token.body, /new@example\.com/);
});

test("a user with MFA still has to pass the second factor", async () => {
  const jar = cookieJar();
  globalThis.__ominityTestCookies = jar;
  const { httpClient } = api({ mfa: true });
  const settings = config(httpClient);

  const state = await (await createOminityAuthEmailCodeVerifyRouteHandler(settings)(post("/api/auth/email-code/verify", { email: "new@example.com", code: "123456" }))).json();
  assert.equal(state.status, "mfa_required");
  assert.equal(await readOminityAuthSession(settings, jar), null);
});

test("a new user creates their customer account and it becomes the active one", async () => {
  const jar = cookieJar();
  globalThis.__ominityTestCookies = jar;
  const { requests, httpClient } = api();
  const settings = config(httpClient, { siteUrl: SITE });

  await createOminityAuthEmailCodeVerifyRouteHandler(settings)(post("/api/auth/email-code/verify", { email: "new@example.com", code: "123456" }));
  const handlers = createOminityCustomerAccountsRouteHandlers({ ...settings, basePath: "/api/customer-accounts" });

  const refused = await handlers.POST(post("/api/customer-accounts/accounts", { type: "private" }, { origin: SITE }));
  assert.equal(refused.status, 422);
  assert.equal((await refused.json()).code, "customer.self_service_disabled");

  const created = await handlers.POST(post("/api/customer-accounts/accounts", { name: " Acme BV " }, { origin: SITE }));
  const createdBody = await created.clone().json();
  assert.equal(created.status, 200, JSON.stringify(createdBody));
  assert.equal((await created.json()).activeCustomerId, 55);

  const sent = requests.filter((request) => request.method === "POST" && request.path === "/api/v1/users/9/customers").at(-1);
  assert.equal(sent.authorization, "Bearer user-access-token");
  assert.deepEqual(JSON.parse(sent.body), { type: "business", name: "Acme BV" });
});
