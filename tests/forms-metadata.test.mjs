import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FormRenderer,
  normalizeOminityForm,
} from "../dist/forms/index.js";
import {
  buildMetadataPayload,
  normalizeMetadataLocale,
} from "../dist/forms/utils/metadata.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readFixture(name) {
  const fixturePath = path.join(__dirname, "fixtures", name);
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw);
}

test("normalizeMetadataLocale resolves locale codes to language codes", () => {
  assert.equal(normalizeMetadataLocale("nl-NL"), "nl");
  assert.equal(normalizeMetadataLocale("fr_BE"), "fr");
  assert.equal(normalizeMetadataLocale("en"), "en");
  assert.equal(normalizeMetadataLocale(""), null);
  assert.equal(normalizeMetadataLocale(null), null);
});

test("buildMetadataPayload excludes server-enriched keys", async () => {
  const fixture = await readFixture("form.fixture.json");
  fixture.data._embedded.form_fields[1].options = [
    "page_url",
    "locale",
    "ip_address",
    "user_agent",
  ];
  const form = normalizeOminityForm(fixture);
  const metadataField = form._embedded.form_fields.find((field) => field.type === "metadata");

  assert.ok(metadataField);

  const payload = buildMetadataPayload(metadataField, undefined, {
    page_url: "https://example.com/contact",
    locale: "nl-NL",
  });

  assert.deepEqual(payload, {
    page_url: "https://example.com/contact",
    locale: "nl",
  });
});

test("FormRenderer does not render hidden metadata inputs for server-enriched keys", async () => {
  const fixture = await readFixture("form.fixture.json");
  fixture.data._embedded.form_fields[1].options = [
    "page_url",
    "locale",
    "ip_address",
    "user_agent",
  ];
  const form = normalizeOminityForm(fixture);

  const html = renderToStaticMarkup(
    React.createElement(FormRenderer, {
      form,
      submitUrl: "/api/forms/submit",
      locale: "nl-NL",
    }),
  );

  assert.equal(html.includes('name="metadata.page_url"'), true);
  assert.equal(html.includes('name="metadata.locale"'), true);
  assert.equal(html.includes('name="metadata.ip_address"'), false);
  assert.equal(html.includes('name="metadata.user_agent"'), false);
});
