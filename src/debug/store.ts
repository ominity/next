import type {
  OminityDebugEntry,
  OminityDebugRequestContext,
  OminityDebugRequestGroup,
  OminityDebugRequestKind,
  OminityDebugSource,
} from "./types.js";

interface OminityDebugStoreState {
  entries: OminityDebugEntry[];
}

const STORE_KEY = "__ominityNextDebugStore__";
const MAX_ENTRIES = 300;
const FALLBACK_GROUP_ID = "__ominity-debug-ungrouped__";

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

function entryErrored(entry: OminityDebugEntry): boolean {
  return !entry.ok || (typeof entry.status === "number" && entry.status >= 400);
}

function toTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fallbackRequestContext(entry: OminityDebugEntry): OminityDebugRequestContext {
  return {
    id: FALLBACK_GROUP_ID,
    kind: "unknown",
    label: "Ungrouped SDK calls",
    startedAt: entry.startedAt,
  };
}

function requestKind(value: OminityDebugRequestKind | undefined): OminityDebugRequestKind {
  return value ?? "unknown";
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

export function listOminityDebugRequestGroups(
  limit = 120,
  source?: OminityDebugSource,
): ReadonlyArray<OminityDebugRequestGroup> {
  const entries = listOminityDebugEntries(limit, source).slice().reverse();
  const groups = new Map<string, {
    context: OminityDebugRequestContext;
    entries: OminityDebugEntry[];
  }>();

  for (const entry of entries) {
    const context = entry.request ?? fallbackRequestContext(entry);
    const existing = groups.get(context.id);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }

    groups.set(context.id, {
      context,
      entries: [entry],
    });
  }

  return Array.from(groups.entries()).map(([id, group]) => {
    const groupEntries = group.entries;
    const firstEntry = groupEntries[0]!;
    const lastEntry = groupEntries[groupEntries.length - 1]!;
    const startedAt = group.context.startedAt ?? firstEntry.startedAt;
    const lastActivityAt = lastEntry.startedAt;
    const sources = Array.from(new Set(groupEntries.map((entry) => entry.source))).sort();
    const errorCount = groupEntries.filter(entryErrored).length;
    const statuses = groupEntries
      .map((entry) => entry.status)
      .filter((status): status is number => typeof status === "number");
    const status = statuses.length > 0 ? statuses[statuses.length - 1] : undefined;

    return {
      id,
      ...(group.context.pageId ? { pageId: group.context.pageId } : {}),
      ...(group.context.parentId ? { parentId: group.context.parentId } : {}),
      kind: requestKind(group.context.kind),
      label: group.context.label
        ?? group.context.path
        ?? group.context.route
        ?? group.context.url
        ?? "Ominity request",
      ...(group.context.method ? { method: group.context.method.toUpperCase() } : {}),
      ...(group.context.url ? { url: group.context.url } : {}),
      ...(group.context.path ? { path: group.context.path } : {}),
      ...(group.context.route ? { route: group.context.route } : {}),
      startedAt,
      lastActivityAt,
      durationMs: Math.max(0, toTime(lastActivityAt) - toTime(startedAt)),
      entryCount: groupEntries.length,
      errorCount,
      sources,
      ...(typeof status === "number" ? { status } : {}),
      ok: errorCount === 0,
      ...(group.context.details ? { details: group.context.details } : {}),
    };
  }).sort((left, right) => toTime(right.lastActivityAt) - toTime(left.lastActivityAt));
}
