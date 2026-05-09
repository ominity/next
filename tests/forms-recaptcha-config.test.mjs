import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  deriveFormRecaptchaConfig,
  normalizeOminityForm,
  resolveFormRecaptchaConfig,
} from "../dist/forms/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readFixture(name) {
  const fixturePath = path.join(__dirname, "fixtures", name);
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw);
}

test("deriveFormRecaptchaConfig returns config from recaptcha form field", async () => {
  const fixture = await readFixture("form.fixture.json");
  const form = normalizeOminityForm(fixture);

  const config = deriveFormRecaptchaConfig(form);

  assert.deepEqual(config, {
    version: "v3",
    siteKey: "public-site-key",
    action: "form_submit",
  });
});

test("resolveFormRecaptchaConfig prefers explicit override", async () => {
  const fixture = await readFixture("form.fixture.json");
  const form = normalizeOminityForm(fixture);

  const config = resolveFormRecaptchaConfig(form, {
    version: "v3",
    siteKey: "override-key",
    action: "custom-action",
  });

  assert.deepEqual(config, {
    version: "v3",
    siteKey: "override-key",
    action: "custom-action",
  });
});
