import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { buildNextMetadataFromPage } from "../dist/next/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readFixture(name) {
  const fixturePath = path.join(__dirname, "fixtures", name);
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw);
}

test("buildNextMetadataFromPage maps canonical and alternates", async () => {
  const page = await readFixture("page.fixture.json");

  const metadata = buildNextMetadataFromPage(page, {
    baseUrl: "https://www.example.com",
    includeAlternates: true,
  });

  assert.equal(metadata.title, "Contact Ominity");
  assert.equal(metadata.description, "Get in touch with Ominity");
  assert.equal(metadata.alternates?.canonical, "https://www.example.com/contact-us");
  assert.equal(metadata.alternates?.languages?.nl, "https://www.example.com/contacteer-ons");
  assert.equal(metadata.robots?.index, true);
  assert.equal(metadata.openGraph?.type, "website");
});

