import type { OminityDebugEntry, OminityDebugRequestGroup } from "./types.js";
import type { Palette, Tone } from "./ui.js";

export type RequestStatusFilter = "all" | "ok" | "redirect" | "client-error" | "server-error" | "failed";
export type RequestGroupSelection = "all" | "latest" | string;

export interface RequestStats {
  readonly total: number;
  readonly visible: number;
  readonly errors: number;
  readonly ok: number;
  readonly averageMs: number;
  readonly slowestMs: number;
  readonly latestAt: string | null;
  readonly sources: ReadonlyArray<string>;
}

export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function statusColor(entry: OminityDebugEntry, palette: Palette): string {
  if (!entry.ok) {
    return palette.danger;
  }

  if (typeof entry.status !== "number") {
    return palette.faint;
  }

  if (entry.status >= 500) {
    return palette.danger;
  }

  if (entry.status >= 400) {
    return palette.warning;
  }

  if (entry.status >= 300) {
    return palette.info;
  }

  return palette.success;
}

export function entryMatchesSearch(entry: OminityDebugEntry, searchQuery: string): boolean {
  if (searchQuery.length === 0) {
    return true;
  }

  const haystack = [
    entry.source,
    entry.method,
    entry.url,
    entry.path,
    typeof entry.status === "number" ? String(entry.status) : "",
    entry.error ?? "",
    entry.requestBody ?? "",
    entry.responseBody ?? "",
    JSON.stringify(entry.requestHeaders),
    JSON.stringify(entry.responseHeaders ?? {}),
  ].join("\n").toLowerCase();

  return haystack.includes(searchQuery);
}

export function entryMatchesStatus(
  entry: OminityDebugEntry,
  status: RequestStatusFilter,
): boolean {
  if (status === "all") return true;
  if (status === "failed") return !entry.ok || typeof entry.status !== "number";
  if (typeof entry.status !== "number") return false;
  if (status === "ok") return entry.ok && entry.status >= 200 && entry.status < 300;
  if (status === "redirect") return entry.status >= 300 && entry.status < 400;
  if (status === "client-error") return entry.status >= 400 && entry.status < 500;
  return entry.status >= 500;
}

export function requestStats(
  entries: ReadonlyArray<OminityDebugEntry>,
  visible: number,
): RequestStats {
  const total = entries.length;
  const errors = entries.filter((entry) => !entry.ok || (typeof entry.status === "number" && entry.status >= 400)).length;
  const ok = entries.filter((entry) => entry.ok && typeof entry.status === "number" && entry.status < 400).length;
  const totalMs = entries.reduce((sum, entry) => sum + entry.durationMs, 0);
  const slowestMs = entries.reduce((max, entry) => Math.max(max, entry.durationMs), 0);
  const latestAt = entries[0]?.startedAt ?? null;
  const sources = Array.from(new Set(entries.map((entry) => entry.source))).sort();

  return {
    total,
    visible,
    errors,
    ok,
    averageMs: total > 0 ? Math.round(totalMs / total) : 0,
    slowestMs,
    latestAt,
    sources,
  };
}

function fallbackRequestGroupId(entry: OminityDebugEntry): string {
  return entry.request?.id ?? "__ominity-debug-ungrouped__";
}

export function selectedRequestGroupId(
  selection: RequestGroupSelection,
  groups: ReadonlyArray<OminityDebugRequestGroup>,
): string | null {
  if (selection === "all") {
    return null;
  }

  if (selection === "latest") {
    return groups[0]?.id ?? null;
  }

  return selection;
}

export function entryMatchesRequestGroup(
  entry: OminityDebugEntry,
  selection: RequestGroupSelection,
  groups: ReadonlyArray<OminityDebugRequestGroup>,
): boolean {
  const selectedId = selectedRequestGroupId(selection, groups);
  return selectedId === null || fallbackRequestGroupId(entry) === selectedId;
}

export function requestGroupLabel(group: OminityDebugRequestGroup): string {
  const method = group.method ? `${group.method} ` : "";
  const path = group.path ?? group.route ?? "";
  const label = group.label || path || group.id;
  return `${method}${label}`;
}

export function requestGroupTone(group: OminityDebugRequestGroup): Tone {
  if (!group.ok || group.errorCount > 0) return "danger";
  if (typeof group.status === "number" && group.status >= 300) return "info";
  return "success";
}
