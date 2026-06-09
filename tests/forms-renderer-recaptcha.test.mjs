import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FormRenderer, normalizeOminityForm } from "../dist/forms/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readFixture(name) {
  const fixturePath = path.join(__dirname, "fixtures", name);
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw);
}

test("FormRenderer keeps v3 recaptcha hidden", async () => {
  const fixture = await readFixture("form.fixture.json");
  const form = normalizeOminityForm(fixture);

  const html = renderToStaticMarkup(
    React.createElement(FormRenderer, {
      form,
      submitUrl: "/api/forms/submit",
    }),
  );

  assert.equal(html.includes("reCAPTCHA"), false);
  assert.equal(html.includes('data-recaptcha-version="v3"'), false);
});

test("FormRenderer renders v2 checkbox recaptcha inside the normal field flow", async () => {
  const fixture = await readFixture("form.fixture.json");
  fixture.data._embedded.form_fields[2].helper = "Prove that you are human.";
  fixture.data._embedded.form_fields[2].options = {
    version: "v2_checkbox",
    siteKey: "public-site-key",
  };
  const form = normalizeOminityForm(fixture);

  const html = renderToStaticMarkup(
    React.createElement(FormRenderer, {
      form,
      submitUrl: "/api/forms/submit",
    }),
  );

  assert.equal(html.includes("reCAPTCHA"), true);
  assert.equal(html.includes("Prove that you are human."), true);
  assert.equal(html.includes('data-field-type="recaptcha"'), true);
  assert.equal(html.includes('data-recaptcha-version="v2-checkbox"'), true);
  assert.ok(
    html.indexOf('name="full_name"') < html.indexOf('data-field-type="recaptcha"'),
  );
});
