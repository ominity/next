import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { normalizeOminityForm, normalizeOminityForms } from "../dist/forms/normalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readFixture(name) {
  const fixturePath = path.join(__dirname, "fixtures", name);
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw);
}

test("normalizeOminityForm normalizes wrapped form payload", async () => {
  const fixture = await readFixture("form.fixture.json");

  const form = normalizeOminityForm(fixture);

  assert.equal(form.id, 101);
  assert.equal(form.name, "contact");
  assert.equal(form._embedded.form_fields.length, 2);
  assert.equal(form._embedded.form_fields[0].name, "full_name");
  assert.equal(form._embedded.form_fields[0].validation.isRequired, true);
  assert.deepEqual(form._embedded.form_fields[1].options, ["page_url", "locale"]);
});

test("normalizeOminityForms normalizes list payload", async () => {
  const fixture = await readFixture("form.fixture.json");

  const forms = normalizeOminityForms({
    items: [fixture.data],
  });

  assert.equal(forms.length, 1);
  assert.equal(forms[0].title, "Contact us");
});

