import assert from "node:assert/strict";
import { test } from "node:test";

import { createOminityFormSubmitHandler } from "../dist/forms/server/submitHandler.js";

test("createOminityFormSubmitHandler rejects non-POST methods", async () => {
  const handler = createOminityFormSubmitHandler({
    ominityApiKey: "secret",
    fetchImpl: async () => new Response("{}", { status: 200 }),
  });

  const response = await handler(new Request("https://example.com/api/forms/submit", {
    method: "GET",
  }));

  assert.equal(response.status, 405);
});

test("createOminityFormSubmitHandler strips honeypot and merges metadata", async () => {
  let forwardedPayload = null;

  const fetchImpl = async (input, init) => {
    if (String(input).includes("/v1/modules/forms/submissions")) {
      forwardedPayload = JSON.parse(init.body);

      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    return new Response("{}", { status: 404 });
  };

  const handler = createOminityFormSubmitHandler({
    ominityApiKey: "secret",
    ominityBaseUrl: "https://example.ominity.test/api",
    fetchImpl,
  });

  const response = await handler(new Request("https://example.com/api/forms/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "nl-BE,nl;q=0.9",
      "User-Agent": "test-agent",
      Referer: "https://example.com/contact",
      "X-Forwarded-For": "203.0.113.10",
    },
    body: JSON.stringify({
      formId: 101,
      userId: null,
      recaptchaToken: null,
      honeypotFields: ["trap_input"],
      data: {
        full_name: "Jane",
        trap_input: "",
        honeypot: "remove-me",
        metadata: {
          locale: "nl",
        },
      },
    }),
  }));

  assert.equal(response.status, 201);
  assert.ok(forwardedPayload);
  assert.equal("trap_input" in forwardedPayload.data, false);
  assert.equal("honeypot" in forwardedPayload.data, false);
  assert.equal(forwardedPayload.data.metadata.locale, "nl-BE");
  assert.equal(forwardedPayload.data.metadata.user_agent, "test-agent");
  assert.equal(forwardedPayload.data.metadata.referrer, "https://example.com/contact");
  assert.equal(forwardedPayload.data.metadata.ip_address, "203.0.113.10");
});

test("createOminityFormSubmitHandler supports custom forwardSubmission transport", async () => {
  const handler = createOminityFormSubmitHandler({
    ominityApiKey: "secret",
    fetchImpl: async () => new Response("{}", { status: 500 }),
    forwardSubmission: async ({ payload }) => ({
      status: 202,
      body: {
        queued: true,
        formId: payload.formId,
      },
    }),
  });

  const response = await handler(new Request("https://example.com/api/forms/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      formId: 101,
      userId: null,
      recaptchaToken: null,
      data: {
        full_name: "Jane",
      },
    }),
  }));

  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(body.queued, true);
  assert.equal(body.formId, 101);
});
