import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildRecaptchaScriptSrc,
  hasRecaptchaExecuteApi,
  hasRecaptchaWidgetApi,
  resolveRecaptchaApi,
} from "../dist/forms/recaptcha/runtime.js";

test("buildRecaptchaScriptSrc uses score-based render mode for enterprise v3", () => {
  assert.equal(
    buildRecaptchaScriptSrc({
      version: "v3",
      siteKey: "enterprise-site-key",
      provider: "enterprise",
      scriptUrl: "https://www.google.com/recaptcha/enterprise.js",
      clientApiNamespace: "grecaptcha.enterprise",
      action: "submit",
    }),
    "https://www.google.com/recaptcha/enterprise.js?render=enterprise-site-key",
  );
});

test("buildRecaptchaScriptSrc uses explicit render mode for checkbox widgets", () => {
  assert.equal(
    buildRecaptchaScriptSrc({
      version: "v2-checkbox",
      siteKey: "public-site-key",
      provider: "classic",
      scriptUrl: "https://www.google.com/recaptcha/api.js?hl=en",
      clientApiNamespace: "grecaptcha",
    }),
    "https://www.google.com/recaptcha/api.js?hl=en&render=explicit",
  );
});

test("resolveRecaptchaApi supports nested enterprise namespaces", async () => {
  const enterpriseApi = {
    ready: () => {},
    render: () => 1,
    execute: async () => "enterprise-token",
    reset: () => {},
  };
  const classicApi = {
    ready: () => {},
    render: () => 0,
    execute: async () => "classic-token",
    reset: () => {},
    enterprise: enterpriseApi,
  };
  const root = {
    grecaptcha: classicApi,
  };

  assert.equal(resolveRecaptchaApi(root, "grecaptcha"), classicApi);
  assert.equal(
    resolveRecaptchaApi(root, "grecaptcha.enterprise"),
    enterpriseApi,
  );
  assert.equal(resolveRecaptchaApi(root, "grecaptcha.missing"), null);
});

test("resolveRecaptchaApi accepts classic v3 api shape", () => {
  const v3Api = {
    ready: () => {},
    execute: async () => "classic-v3-token",
  };
  const root = {
    grecaptcha: v3Api,
  };

  const resolved = resolveRecaptchaApi(root, "grecaptcha");

  assert.equal(resolved, v3Api);
  assert.equal(hasRecaptchaExecuteApi(resolved), true);
  assert.equal(hasRecaptchaWidgetApi(resolved), false);
});
