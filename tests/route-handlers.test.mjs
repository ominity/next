import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createOminityFormSubmissionUpdateRouteHandler,
  createOminityFormSubmitRouteHandler,
  createOminityFormUploadPresignRouteHandler,
} from "../dist/forms/index.js";
import { createOminityTrackingProxyRouteHandlers } from "../dist/next/tracking-proxy.js";
import { createOminityRequestCountryRouteHandlers } from "../dist/server/index.js";

test("createOminityFormSubmitRouteHandler validates form ids and forwards resolved language", async () => {
  const calls = [];

  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const headers = new Headers(init.headers);
    calls.push({
      url,
      method: init.method ?? "GET",
      headers,
      body: init.body ? JSON.parse(init.body) : null,
    });

    if (url.endsWith("/v1/modules/forms/101")) {
      return new Response(JSON.stringify({ resource: "form", id: 101 }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    if (url.endsWith("/v1/modules/forms/submissions")) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    return new Response("{}", { status: 404 });
  };

  const handler = createOminityFormSubmitRouteHandler({
    ominityApiKey: "secret",
    ominityBaseUrl: "https://example.ominity.test/api",
    formsValidateFormId: true,
    resolveLanguage: async () => "nl",
    fetchImpl,
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
        metadata: {},
      },
    }),
  }));

  assert.equal(response.status, 201);
  assert.equal(calls[0].url, "https://example.ominity.test/api/v1/modules/forms/101");
  assert.equal(calls[0].headers.get("accept-language"), "nl");
  assert.equal(calls[1].url, "https://example.ominity.test/api/v1/modules/forms/submissions");
  assert.equal(calls[1].headers.get("accept-language"), "nl");
  assert.equal(calls[1].body.data.metadata.locale, "nl");
});

test("createOminityFormUploadPresignRouteHandler uses the normalized media library endpoint", async () => {
  let forwardedUrl = "";
  let forwardedHeaders = null;
  let forwardedBody = null;

  const handler = createOminityFormUploadPresignRouteHandler({
    ominityApiKey: "secret",
    ominityBaseUrl: "https://example.ominity.test/api",
    resolveLanguage: () => "fr",
    fetchImpl: async (input, init = {}) => {
      forwardedUrl = String(input);
      forwardedHeaders = new Headers(init.headers);
      forwardedBody = JSON.parse(init.body);

      return new Response(JSON.stringify({
        url: "https://uploads.example.test/presigned",
        headers: {
          "x-upload-token": "token",
        },
        publicUrl: "https://cdn.example.test/file.png",
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
  });

  const response = await handler(new Request("https://example.com/api/forms/uploads/presign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      formId: 42,
      fieldName: "resume",
      filename: "resume.pdf",
      mimeType: "application/pdf",
      size: 12345,
    }),
  }));

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(forwardedUrl, "https://example.ominity.test/api/v1/media-library/uploads/presign");
  assert.equal(forwardedHeaders.get("accept-language"), "fr");
  assert.equal(forwardedBody.path, "forms/tmp/42");
  assert.equal(forwardedBody.metadata.type, "resume");
  assert.equal(body.url, "https://uploads.example.test/presigned");
  assert.equal(body.publicUrl, "https://cdn.example.test/file.png");
});

test("createOminityFormSubmissionUpdateRouteHandler forwards submission patches with the resolved language", async () => {
  let forwardedUrl = "";
  let forwardedHeaders = null;
  let forwardedBody = null;

  const handler = createOminityFormSubmissionUpdateRouteHandler({
    ominityApiKey: "secret",
    ominityBaseUrl: "https://example.ominity.test/api",
    resolveLanguage: () => "en",
    fetchImpl: async (input, init = {}) => {
      forwardedUrl = String(input);
      forwardedHeaders = new Headers(init.headers);
      forwardedBody = JSON.parse(init.body);

      return new Response(JSON.stringify({
        resource: "form_submission",
        id: 12,
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
  });

  const response = await handler(
    new Request("https://example.com/api/forms/submissions/12", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          status: "completed",
        },
      }),
    }),
    {
      params: Promise.resolve({ id: "12" }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(forwardedUrl, "https://example.ominity.test/api/v1/modules/forms/submissions/12");
  assert.equal(forwardedHeaders.get("accept-language"), "en");
  assert.equal(forwardedBody.data.status, "completed");
});

test("createOminityTrackingProxyRouteHandlers exposes debug snapshot and disabled responses", async () => {
  const disabledHandlers = createOminityTrackingProxyRouteHandlers({
    enabled: false,
    disabledReason: ["OMINITY_TRACKING_ENABLED=false", "OMINITY_API_KEY is not configured"],
  });

  const disabledResponse = await disabledHandlers.POST(new Request("https://example.com/api/omt", {
    method: "POST",
    body: JSON.stringify({ event: "page_view" }),
  }));

  assert.equal(disabledResponse.status, 503);
  assert.equal(
    (await disabledResponse.json()).error,
    "Tracking is disabled: OMINITY_TRACKING_ENABLED=false, OMINITY_API_KEY is not configured.",
  );

  const debugHandlers = createOminityTrackingProxyRouteHandlers({
    ominityApiKey: "secret",
    debug: true,
    logDebugSnapshots: false,
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }),
  });

  const getResponse = await debugHandlers.GET(new Request("https://example.com/api/omt", {
    headers: {
      "X-Forwarded-For": "203.0.113.10",
    },
  }));
  const debugPayload = await getResponse.json();

  assert.equal(getResponse.status, 200);
  assert.equal(debugPayload.resolvedClientIp, "203.0.113.10");

  const postResponse = await debugHandlers.POST(new Request("https://example.com/api/omt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": "203.0.113.10",
    },
    body: JSON.stringify({ event: "page_view" }),
  }));

  assert.equal(postResponse.status, 200);
  assert.equal(postResponse.headers.get("x-ominity-tracking-debug"), "1");
  assert.equal(postResponse.headers.get("x-ominity-debug-client-ip"), "203.0.113.10");
});

test("createOminityRequestCountryRouteHandlers returns no-store JSON responses", async () => {
  const { GET } = createOminityRequestCountryRouteHandlers({
    resolveCountry: async () => "BE",
  });

  const response = await GET(new Request("https://example.com/api/request-country"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.country, "BE");
  assert.equal(response.headers.get("cache-control"), "no-store");
});
