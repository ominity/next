import assert from "node:assert/strict";
import { test } from "node:test";

import { createCmsRegistry, defineCmsComponent } from "../dist/rendering/index.js";

test("createCmsRegistry registers components", () => {
  const Hero = () => null;
  const registry = createCmsRegistry([
    defineCmsComponent("hero", Hero),
  ]);

  assert.equal(registry.has("hero"), true);
  assert.equal(registry.get("hero")?.component, Hero);
});

test("createCmsRegistry throws for duplicate keys", () => {
  assert.throws(
    () => {
      createCmsRegistry([
        defineCmsComponent("hero", () => null),
        defineCmsComponent("hero", () => null),
      ]);
    },
    (error) => {
      assert.equal(error?.code, "REGISTRY_DUPLICATE_KEY");
      return true;
    },
  );
});

