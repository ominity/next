import assert from "node:assert/strict";
import { test } from "node:test";

import { HTTPClient } from "@ominity/api-typescript";

import {
  createOminityAuthEmailCodeSendRouteHandler,
  createOminityAuthLoginRouteHandler,
  createOminityAuthPasswordForgotRouteHandler,
  createOminityAuthRegisterRouteHandler,
} from "../dist/auth/server/index.js";
import { formatResendWait } from "../dist/react/resend-countdown.js";

const SITE = "https://app.example.com";
const VISITOR = { "user-agent": "Test/1.0", "x-forwarded-for": "203.0.113.7, 10.0.0.2" };

/**
 * Ominity's answers: `create` is how `POST /v1/users` answers (201, or 429 with a code), and the password grant says
 * `email_not_verified` for an account that hasn't entered its sign-up code yet.
 */
function api({ create = "created", grant = "ok" } = {}) {
  const requests = [];
  const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
  const fetcher = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    const body = request.method === "POST" ? await request.clone().text() : "";
    requests.push({ method: request.method, path, body });

    if (path === "/api/v1/users" && request.method === "POST") {
      if (create === "paused") {
        return json({ status: 429, title: "Too Many Requests", detail: "Sign-ups are paused for a while.", code: "signups.paused" }, 429, { "Retry-After": "1800" });
      }
      if (create === "limited") {
        return json({ status: 429, title: "Too Many Requests", detail: "Too many requests from this address." }, 429, { "Retry-After": "30" });
      }
      return json({ resource: "user", id: 12, firstName: "Emma", lastName: "Wilson", email: "emma.wilson@example.com", isMfaEnabled: false }, 201, { "Content-Type": "application/hal+json" });
    }
    if (path === "/api/v1/users/email-codes") {
      return json({ expiresAt: "2026-11-11T10:15:00+00:00", resendAvailableAt: "2026-11-11T10:01:00+00:00" }, 202);
    }
    if (path === "/api/v1/users/password-reset/send") {
      return json({ status: 429, title: "Too Many Requests", detail: "Too many requests from this address." }, 429, { "Retry-After": "60" });
    }
    if (request.method === "POST" && path.includes("oauth")) {
      return grant === "unverified"
        ? json({ error: "email_not_verified", error_description: "The email address isn't verified yet.", message: "The email address isn't verified yet." }, 400)
        : json({ error: "invalid_grant", message: "The user credentials were incorrect." }, 400);
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
    authSessionSecret: "s".repeat(40),
    sdkHttpClient: httpClient,
    ...extra,
  };
}

const signUp = { firstName: "Emma", lastName: "Wilson", email: "Emma.Wilson@example.com", password: "correct horse" };

test("a password sign-up asks for the emailed code instead of signing in", async () => {
  globalThis.__ominityTestCookies = new Map();
  const { requests, httpClient } = api();
  const response = await createOminityAuthRegisterRouteHandler(config(httpClient))(post("/api/auth/register", signUp, VISITOR));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "verification_required", email: "emma.wilson@example.com", expiresAt: null, resendAvailableAt: null });

  const created = JSON.parse(requests.find((request) => request.path === "/api/v1/users").body);
  assert.equal(created.verifyEmail, true);
  assert.equal(created.redirectUrl, `${SITE}/auth/verify`);
  assert.equal(created.ipAddress, "203.0.113.7", "the visitor's own IP, not the forwarded list");
  assert.equal(created.userAgent, "Test/1.0");
  assert.equal(requests.some((request) => request.path.includes("oauth")), false, "no password sign-in before the code");
});

test("without verification the sign-up signs in as before", async () => {
  globalThis.__ominityTestCookies = new Map();
  const { requests, httpClient } = api();
  await createOminityAuthRegisterRouteHandler(config(httpClient, { verifyEmailOnRegister: false }))(post("/api/auth/register", signUp, VISITOR));

  const created = JSON.parse(requests.find((request) => request.path === "/api/v1/users").body);
  assert.equal(created.verifyEmail, false);
  assert.equal(created.redirectUrl, undefined);
  assert.equal(requests.some((request) => request.path.includes("oauth")), true);
});

test("paused sign-ups and visitor limits come back as 429 with the wait", async () => {
  globalThis.__ominityTestCookies = new Map();
  const paused = await createOminityAuthRegisterRouteHandler(config(api({ create: "paused" }).httpClient))(post("/api/auth/register", signUp, VISITOR));
  assert.equal(paused.status, 429);
  assert.equal(paused.headers.get("Retry-After"), "1800");
  assert.equal((await paused.json()).code, "SIGNUPS_PAUSED");

  const limited = await createOminityAuthRegisterRouteHandler(config(api({ create: "limited" }).httpClient))(post("/api/auth/register", signUp, VISITOR));
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, "REGISTER_RATE_LIMITED");
});

test("signing in with the password of an unverified sign-up sends a code and asks for it", async () => {
  globalThis.__ominityTestCookies = new Map();
  const { requests, httpClient } = api({ grant: "unverified" });
  const response = await createOminityAuthLoginRouteHandler(config(httpClient))(post("/api/auth/login", { email: "emma.wilson@example.com", password: "correct horse" }, VISITOR));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "verification_required",
    email: "emma.wilson@example.com",
    expiresAt: "2026-11-11T10:15:00+00:00",
    resendAvailableAt: "2026-11-11T10:01:00+00:00",
  });
  const sent = JSON.parse(requests.find((request) => request.path === "/api/v1/users/email-codes").body);
  assert.equal(sent.ipAddress, "203.0.113.7");

  // A wrong password stays a failed sign-in.
  const wrong = await createOminityAuthLoginRouteHandler(config(api().httpClient))(post("/api/auth/login", { email: "emma.wilson@example.com", password: "nope" }, VISITOR));
  assert.equal(wrong.status, 401);
});

test("reset links send the visitor's IP and pass Ominity's wait on", async () => {
  const { requests, httpClient } = api();
  const response = await createOminityAuthPasswordForgotRouteHandler(config(httpClient))(post("/api/auth/password/forgot", { email: "emma.wilson@example.com" }, VISITOR));

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal((await response.json()).code, "PASSWORD_FORGOT_RATE_LIMITED");
  assert.equal(JSON.parse(requests[0].body).ipAddress, "203.0.113.7");
});

test("sending a code goes through with the visitor's IP", async () => {
  const { httpClient } = api();
  const ok = await createOminityAuthEmailCodeSendRouteHandler(config(httpClient))(post("/api/auth/email-code/send", { email: "a@example.com" }, VISITOR));
  assert.equal(ok.status, 200);
});

test("the resend wait reads in words", () => {
  assert.equal(formatResendWait(45, "en"), "45 seconds");
  assert.equal(formatResendWait(61, "en"), "2 minutes");
  assert.equal(formatResendWait(900, "en"), "15 minutes");
  assert.equal(formatResendWait(3653, "en"), "2 hours");
  assert.equal(formatResendWait(120, "nl"), "2 minuten");
});
