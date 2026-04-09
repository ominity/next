import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { createRoutingConfig } from "../dist/cms/routing/index.js";
import { generateCmsStaticParams } from "../dist/next/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readFixture(name) {
  const fixturePath = path.join(__dirname, "fixtures", name);
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw);
}

test("generateCmsStaticParams includes localized canonical paths", async () => {
  const fixture = await readFixture("routes.fixture.json");

  const routing = createRoutingConfig({
    defaultLocale: "en",
    locales: fixture.locales,
    localeSegmentStrategy: "language",
  });

  const params = generateCmsStaticParams({
    routes: fixture.routes,
    routing,
    catchAllParam: "slug",
  });

  const serialized = params.map((entry) => entry.slug.join("/"));
  assert.ok(serialized.includes("en/contact-us"));
  assert.ok(serialized.includes("nl/contacteer-ons"));
});

