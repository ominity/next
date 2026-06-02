import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearVisitorIdCookie,
  ensureVisitorIdCookie,
  isVisitorId,
  readVisitorIdCookie,
  writeVisitorIdCookie,
} from "../dist/next/index.js";

function createCookieStore(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    get(name) {
      const value = values.get(name);
      if (typeof value !== "string") {
        return undefined;
      }

      return { value };
    },
    set(name, value) {
      values.set(name, value);
    },
    read(name) {
      return values.get(name);
    },
  };
}

test("ensureVisitorIdCookie reuses existing valid visitor id", () => {
  const existing = "648cd59e-8f79-40a7-a4de-1fb65b42c00c";
  const store = createCookieStore({ _omtvid: existing });

  const resolved = ensureVisitorIdCookie(store);

  assert.equal(resolved, existing);
  assert.equal(readVisitorIdCookie(store), existing);
});

test("ensureVisitorIdCookie generates and stores a uuid when missing", () => {
  const store = createCookieStore();
  const resolved = ensureVisitorIdCookie(store);

  assert.equal(isVisitorId(resolved), true);
  assert.equal(store.read("_omtvid"), resolved);
});

test("writeVisitorIdCookie ignores invalid ids and clearVisitorIdCookie expires cookie", () => {
  const store = createCookieStore();

  writeVisitorIdCookie(store, "not-a-uuid");
  assert.equal(store.read("_omtvid"), undefined);

  writeVisitorIdCookie(store, "648cd59e-8f79-40a7-a4de-1fb65b42c00c");
  assert.equal(readVisitorIdCookie(store), "648cd59e-8f79-40a7-a4de-1fb65b42c00c");

  clearVisitorIdCookie(store);
  assert.equal(store.read("_omtvid"), "");
  assert.equal(readVisitorIdCookie(store), null);
});
