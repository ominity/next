"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";

import type { OminityDebugEntry, OminityDebugListResponse, OminityDebugSource } from "./types.js";

const cardStyle: CSSProperties = {
  border: "1px solid rgb(212 212 216 / 60%)",
  borderRadius: "10px",
  backgroundColor: "rgb(255 255 255 / 95%)",
  color: "rgb(24 24 27)",
  boxShadow: "0 20px 25px -5px rgb(0 0 0 / 15%), 0 8px 10px -6px rgb(0 0 0 / 15%)",
  backdropFilter: "blur(6px)",
};

const codeBlockStyle: CSSProperties = {
  marginTop: "6px",
  overflow: "auto",
  whiteSpace: "pre-wrap",
  borderRadius: "6px",
  padding: "8px",
  border: "1px solid rgb(212 212 216 / 65%)",
  backgroundColor: "rgb(250 250 250)",
};

function prettyJsonOrRaw(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
}

function nextNonWhitespaceChar(input: string, fromIndex: number): string | null {
  for (let index = fromIndex; index < input.length; index += 1) {
    const character = input[index];
    if (typeof character === "string" && character.trim().length > 0) {
      return character;
    }
  }

  return null;
}

function jsonTokenStyle(token: string, source: string, tokenEndIndex: number): CSSProperties {
  if (token.startsWith("\"")) {
    return nextNonWhitespaceChar(source, tokenEndIndex) === ":"
      ? { color: "rgb(3 105 161)" }
      : { color: "rgb(21 128 61)" };
  }

  if (token === "true" || token === "false") {
    return { color: "rgb(109 40 217)" };
  }

  if (token === "null") {
    return { color: "rgb(113 113 122)" };
  }

  return { color: "rgb(180 83 9)" };
}

function renderHighlightedJson(input: string) {
  const tokenPattern = /"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const result = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of input.matchAll(tokenPattern)) {
    const text = match[0];
    const start = match.index ?? 0;

    if (start > cursor) {
      result.push(<span key={`plain-${tokenIndex}`}>{input.slice(cursor, start)}</span>);
      tokenIndex += 1;
    }

    const end = start + text.length;
    result.push(
      <span key={`token-${tokenIndex}`} style={jsonTokenStyle(text, input, end)}>
        {text}
      </span>,
    );
    tokenIndex += 1;
    cursor = end;
  }

  if (cursor < input.length) {
    result.push(<span key={`plain-${tokenIndex}`}>{input.slice(cursor)}</span>);
  }

  return result;
}

function renderCodeBlock(input: string) {
  const display = prettyJsonOrRaw(input);
  return <pre style={codeBlockStyle}>{renderHighlightedJson(display)}</pre>;
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function statusColor(entry: OminityDebugEntry): string {
  if (!entry.ok) {
    return "rgb(220 38 38)";
  }

  if (typeof entry.status !== "number") {
    return "rgb(113 113 122)";
  }

  if (entry.status >= 500) {
    return "rgb(220 38 38)";
  }

  if (entry.status >= 400) {
    return "rgb(217 119 6)";
  }

  if (entry.status >= 300) {
    return "rgb(37 99 235)";
  }

  return "rgb(22 163 74)";
}

function entryMatchesSearch(entry: OminityDebugEntry, searchQuery: string): boolean {
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

export interface OminityDebugBarProps {
  readonly enabled: boolean;
  readonly endpoint?: string;
  readonly title?: string;
  readonly source?: OminityDebugSource | "all";
  readonly limit?: number;
  readonly pollWhenOpenMs?: number;
  readonly pollWhenClosedMs?: number;
  readonly zIndex?: number;
}

export function OminityDebugBar(props: OminityDebugBarProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ReadonlyArray<OminityDebugEntry>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);

  const endpoint = props.endpoint ?? "/api/debug/sdk-requests";
  const title = props.title ?? "API Debug";
  const source = props.source ?? "all";
  const limit = Number.isFinite(props.limit) && (props.limit ?? 0) > 0
    ? Math.floor(props.limit!)
    : 140;
  const pollWhenOpenMs = Number.isFinite(props.pollWhenOpenMs) && (props.pollWhenOpenMs ?? 0) > 0
    ? Math.floor(props.pollWhenOpenMs!)
    : 1500;
  const pollWhenClosedMs = Number.isFinite(props.pollWhenClosedMs) && (props.pollWhenClosedMs ?? 0) > 0
    ? Math.floor(props.pollWhenClosedMs!)
    : 3500;

  const fetchEntries = useCallback(async () => {
    if (!props.enabled) {
      return;
    }

    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set("limit", String(limit));
    if (source !== "all") {
      url.searchParams.set("source", source);
    }

    try {
      setLoading(true);
      const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Debug endpoint returned ${response.status}`);
      }

      const payload = await response.json() as OminityDebugListResponse;
      setEntries(Array.isArray(payload.entries) ? payload.entries : []);
      setTotal(typeof payload.total === "number" ? payload.total : 0);
      setLastError(null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Failed to load debug entries.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, limit, props.enabled, source]);

  useEffect(() => {
    if (!props.enabled) {
      return;
    }

    void fetchEntries();
    const interval = window.setInterval(() => {
      void fetchEntries();
    }, open ? pollWhenOpenMs : pollWhenClosedMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [fetchEntries, open, pollWhenClosedMs, pollWhenOpenMs, props.enabled]);

  const clearEntries = useCallback(async () => {
    try {
      await fetch(endpoint, {
        method: "DELETE",
      });
    } catch {}

    await fetchEntries();
  }, [endpoint, fetchEntries]);

  const visibleEntries = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return entries
      .filter((entry) => !errorsOnly || !entry.ok || (typeof entry.status === "number" && entry.status >= 400))
      .filter((entry) => entryMatchesSearch(entry, normalizedSearch));
  }, [entries, errorsOnly, searchQuery]);

  if (!props.enabled) {
    return null;
  }

  return (
    <div style={{ position: "fixed", bottom: "12px", right: "12px", zIndex: props.zIndex ?? 70, width: "min(96vw,64rem)" }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            border: "1px solid rgb(212 212 216 / 80%)",
            borderRadius: "8px",
            backgroundColor: "rgb(244 244 245)",
            color: "rgb(39 39 42)",
            height: "36px",
            padding: "0 12px",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          {title} ({total})
        </button>
      ) : (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgb(212 212 216 / 80%)", padding: "8px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600 }}>
              {title}
              <span style={{ borderRadius: "5px", backgroundColor: "rgb(244 244 245)", color: "rgb(82 82 91)", padding: "2px 6px", fontSize: "11px" }}>
                {visibleEntries.length}/{total}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setErrorsOnly((value) => !value)}
                style={{
                  border: "1px solid rgb(212 212 216 / 80%)",
                  borderRadius: "7px",
                  backgroundColor: errorsOnly ? "rgb(24 24 27)" : "white",
                  color: errorsOnly ? "white" : "rgb(39 39 42)",
                  fontSize: "11px",
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                Errors
              </button>
              <button type="button" onClick={() => { void fetchEntries(); }} style={{ border: "1px solid rgb(212 212 216 / 80%)", borderRadius: "7px", backgroundColor: "white", fontSize: "11px", padding: "4px 8px", cursor: "pointer" }}>
                {loading ? "Refreshing..." : "Refresh"}
              </button>
              <button type="button" onClick={() => { void clearEntries(); }} style={{ border: "1px solid rgb(212 212 216 / 80%)", borderRadius: "7px", backgroundColor: "white", fontSize: "11px", padding: "4px 8px", cursor: "pointer" }}>
                Clear
              </button>
              <button type="button" onClick={() => setOpen(false)} style={{ border: "1px solid rgb(212 212 216 / 80%)", borderRadius: "7px", backgroundColor: "white", fontSize: "11px", padding: "4px 8px", cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>

          {lastError && (
            <div style={{ borderBottom: "1px solid rgb(212 212 216 / 80%)", padding: "8px 10px", fontSize: "12px", color: "rgb(220 38 38)" }}>{lastError}</div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid rgb(212 212 216 / 80%)", padding: "8px 10px" }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchQuery(event.currentTarget.value)}
              placeholder="Search method, path, status, body..."
              style={{
                border: "1px solid rgb(212 212 216 / 80%)",
                borderRadius: "7px",
                height: "32px",
                width: "100%",
                padding: "0 10px",
                fontSize: "12px",
              }}
            />
            {searchQuery.length > 0 && (
              <button type="button" onClick={() => setSearchQuery("")} style={{ border: "1px solid rgb(212 212 216 / 80%)", borderRadius: "7px", backgroundColor: "white", fontSize: "11px", padding: "4px 8px", cursor: "pointer" }}>
                Reset
              </button>
            )}
          </div>

          <div style={{ maxHeight: "58vh", overflow: "auto" }}>
            {visibleEntries.length === 0 ? (
              <div style={{ padding: "12px 10px", fontSize: "12px", color: "rgb(113 113 122)" }}>
                {entries.length === 0 ? "No API requests captured yet." : "No entries match the current filters."}
              </div>
            ) : (
              visibleEntries.map((entry) => (
                <details key={entry.id} style={{ borderBottom: "1px solid rgb(228 228 231)", padding: "8px 10px", fontSize: "12px" }}>
                  <summary style={{ display: "flex", cursor: "pointer", listStyle: "none", alignItems: "center", gap: "8px" }}>
                    <span style={{ borderRadius: "5px", backgroundColor: "rgb(244 244 245)", padding: "2px 6px", fontSize: "10px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {entry.source}
                    </span>
                    <span style={{ borderRadius: "5px", backgroundColor: "rgb(244 244 245)", padding: "2px 6px", fontSize: "10px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {entry.method}
                    </span>
                    <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {shortUrl(entry.path)}
                    </span>
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: statusColor(entry) }}>
                      {entry.status ?? "ERR"}
                    </span>
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "rgb(113 113 122)" }}>{entry.durationMs}ms</span>
                  </summary>

                  <div style={{ marginTop: "8px", display: "grid", gap: "8px", paddingBottom: "4px", fontSize: "11px" }}>
                    <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "rgb(113 113 122)" }}>{entry.startedAt}</div>
                    <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflowWrap: "anywhere" }}>{entry.url}</div>
                    {entry.error && (
                      <div style={{ borderRadius: "6px", backgroundColor: "rgb(254 242 242)", border: "1px solid rgb(252 165 165)", color: "rgb(153 27 27)", padding: "8px" }}>
                        {entry.error}
                      </div>
                    )}
                    <details style={{ borderRadius: "6px", border: "1px solid rgb(212 212 216 / 80%)", backgroundColor: "rgb(250 250 250)", padding: "8px" }}>
                      <summary style={{ cursor: "pointer" }}>Request Headers</summary>
                      {renderCodeBlock(JSON.stringify(entry.requestHeaders, null, 2))}
                    </details>
                    {entry.requestBody && (
                      <details style={{ borderRadius: "6px", border: "1px solid rgb(212 212 216 / 80%)", backgroundColor: "rgb(250 250 250)", padding: "8px" }}>
                        <summary style={{ cursor: "pointer" }}>Request Body</summary>
                        {renderCodeBlock(entry.requestBody)}
                      </details>
                    )}
                    {entry.responseHeaders && (
                      <details style={{ borderRadius: "6px", border: "1px solid rgb(212 212 216 / 80%)", backgroundColor: "rgb(250 250 250)", padding: "8px" }}>
                        <summary style={{ cursor: "pointer" }}>Response Headers</summary>
                        {renderCodeBlock(JSON.stringify(entry.responseHeaders, null, 2))}
                      </details>
                    )}
                    {entry.responseBody && (
                      <details style={{ borderRadius: "6px", border: "1px solid rgb(212 212 216 / 80%)", backgroundColor: "rgb(250 250 250)", padding: "8px" }}>
                        <summary style={{ cursor: "pointer" }}>Response Body</summary>
                        {renderCodeBlock(entry.responseBody)}
                      </details>
                    )}
                  </div>
                </details>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
