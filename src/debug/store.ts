import type { OminityDebugEntry, OminityDebugSource } from "./types.js";

interface OminityDebugStoreState {
  entries: OminityDebugEntry[];
}

const STORE_KEY = "__ominityNextDebugStore__";
const MAX_ENTRIES = 300;

function resolveStore(): OminityDebugStoreState {
  const runtime = globalThis as typeof globalThis & {
    [STORE_KEY]?: OminityDebugStoreState;
  };

  if (!runtime[STORE_KEY]) {
    runtime[STORE_KEY] = {
      entries: [],
    };
  }

  return runtime[STORE_KEY]!;
}

export function appendOminityDebugEntry(entry: OminityDebugEntry): void {
  const store = resolveStore();
  store.entries.push(entry);

  if (store.entries.length > MAX_ENTRIES) {
    store.entries.splice(0, store.entries.length - MAX_ENTRIES);
  }
}

export function listOminityDebugEntries(
  limit = 120,
  source?: OminityDebugSource,
): ReadonlyArray<OminityDebugEntry> {
  const store = resolveStore();
  const normalizedLimit = Number.isFinite(limit) && limit > 0
    ? Math.min(Math.floor(limit), MAX_ENTRIES)
    : 120;
  const filtered = typeof source === "string"
    ? store.entries.filter((entry) => entry.source === source)
    : store.entries;

  return filtered.slice(-normalizedLimit).reverse();
}

export function clearOminityDebugEntries(): void {
  const store = resolveStore();
  store.entries = [];
}

export function countOminityDebugEntries(source?: OminityDebugSource): number {
  const store = resolveStore();
  if (!source) {
    return store.entries.length;
  }

  return store.entries.filter((entry) => entry.source === source).length;
}
