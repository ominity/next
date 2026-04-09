import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { createFormsClient } from "../dist/forms/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readFixture(name) {
  const fixturePath = path.join(__dirname, "fixtures", name);
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw);
}

test("createFormsClient fetches and normalizes form by id", async () => {
  const fixture = await readFixture("form.fixture.json");

  const calls = [];
  const fetchImpl = async (input, init) => {
    calls.push({ input, init });

    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  const client = createFormsClient({
    baseUrl: "https://example.ominity.test/api",
    apiKey: "secret",
    fetchImpl,
  });

  const form = await client.getFormById({
    formId: 101,
    include: "form_fields",
    locale: "nl",
  });

  assert.ok(form);
  assert.equal(form.id, 101);
  assert.equal(calls.length, 1);

  const requestUrl = new URL(calls[0].input);
  assert.equal(requestUrl.pathname, "/api/v1/modules/forms/101");
  assert.equal(requestUrl.searchParams.get("include"), "form_fields");
  assert.equal(requestUrl.searchParams.get("preview"), null);
  assert.equal(calls[0].init.headers.get("Authorization"), "Bearer secret");
  assert.equal(calls[0].init.headers.get("Accept-Language"), "nl");
});

test("createFormsClient supports adapter usage (optional SDK module path)", async () => {
  const fixture = await readFixture("form.fixture.json");

  const client = createFormsClient({
    adapter: {
      async getFormById() {
        return fixture;
      },
    },
  });

  const form = await client.getFormById({ formId: 101 });

  assert.ok(form);
  assert.equal(form.name, "contact");
});

