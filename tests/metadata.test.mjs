import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { buildNextMetadataFromPage } from "../dist/next/index.js";
import { createRoutingConfig } from "../dist/cms/index.js";

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

test("buildNextMetadataFromPage uses language-only alternates when locale strategy is language", async () => {
  const page = await readFixture("page.fixture.json");
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: [
      { code: "en", language: "en", default: true },
      { code: "nl", language: "nl" },
      { code: "nl-BE", language: "nl", country: "BE" },
    ],
    localeSegmentStrategy: "language",
  });

  const metadata = buildNextMetadataFromPage(page, {
    baseUrl: "https://www.example.com",
    includeAlternates: true,
    routing,
    locale: "nl-BE",
  });

  assert.equal(metadata.alternates?.canonical, "https://www.example.com/nl/contacteer-ons");
  assert.equal(metadata.alternates?.languages?.en, "https://www.example.com/en/contact-us");
  assert.equal(metadata.alternates?.languages?.nl, "https://www.example.com/nl/contacteer-ons");
  assert.equal(metadata.alternates?.languages?.["en-BE"], undefined);
});

test("buildNextMetadataFromPage expands country-language alternates to all combinations", async () => {
  const page = await readFixture("page.fixture.json");
  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: [
      { code: "en", language: "en", default: true },
      { code: "nl", language: "nl" },
    ],
    localeSegmentStrategy: "country-language",
  });

  const metadata = buildNextMetadataFromPage(page, {
    baseUrl: "https://www.example.com",
    includeAlternates: true,
    routing,
    locale: "nl-BE",
    alternateLanguages: ["en", "nl"],
    alternateCountries: ["BE", "NL"],
  });

  assert.equal(metadata.alternates?.languages?.["en-BE"], "https://www.example.com/be/en/contact-us");
  assert.equal(metadata.alternates?.languages?.["nl-BE"], "https://www.example.com/be/nl/contacteer-ons");
  assert.equal(metadata.alternates?.languages?.["en-NL"], "https://www.example.com/nl/en/contact-us");
  assert.equal(metadata.alternates?.languages?.["nl-NL"], "https://www.example.com/nl/nl/contacteer-ons");
});
