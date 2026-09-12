import type { ChangeEvent } from "react";

import type {
  OminityDebugEntry,
  OminityDebugRequestGroup,
} from "../types.js";
import {
  EmptyState,
  Field,
  JsonPanel,
  MONO_FONT,
  Metric,
  Panel,
  buttonStyle,
  formatDateTime,
  inputStyle,
  pillStyle,
  renderCodeBlock,
  type Palette,
} from "../ui.js";
import {
  requestGroupLabel,
  requestGroupTone,
  selectedRequestGroupId,
  shortUrl,
  statusColor,
  type RequestGroupSelection,
  type RequestStatusFilter,
} from "../request-utils.js";

function requestErrorCount(entries: ReadonlyArray<OminityDebugEntry>): number {
  return entries.filter((entry) => !entry.ok || (typeof entry.status === "number" && entry.status >= 400)).length;
}

export function RequestsTab(props: {
  readonly palette: Palette;
  readonly entries: ReadonlyArray<OminityDebugEntry>;
  readonly visibleEntries: ReadonlyArray<OminityDebugEntry>;
  readonly requestGroups: ReadonlyArray<OminityDebugRequestGroup>;
  readonly selectedRequestId: RequestGroupSelection;
  readonly setSelectedRequestId: (value: RequestGroupSelection) => void;
  readonly sourceFilter: string;
  readonly setSourceFilter: (value: string) => void;
  readonly statusFilter: RequestStatusFilter;
  readonly setStatusFilter: (value: RequestStatusFilter) => void;
  readonly searchQuery: string;
  readonly setSearchQuery: (value: string) => void;
  readonly sources: ReadonlyArray<string>;
  readonly clearEntries: () => void;
  readonly fetchEntries: () => void;
  readonly loading: boolean;
}) {
  const selectedGroupId = selectedRequestGroupId(props.selectedRequestId, props.requestGroups);
  const selectedGroup = selectedGroupId
    ? props.requestGroups.find((group) => group.id === selectedGroupId)
    : null;

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <Panel palette={props.palette}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(14rem, 1fr) repeat(4, auto)", gap: "8px", alignItems: "center" }}>
          <select
            value={props.selectedRequestId}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => props.setSelectedRequestId(event.currentTarget.value ?? "latest")}
            style={inputStyle(props.palette)}
          >
            <option value="latest">Latest request</option>
            <option value="all">All captured requests</option>
            {props.requestGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {requestGroupLabel(group)} · {group.entryCount} call{group.entryCount === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          <Metric palette={props.palette} label="Calls" value={selectedGroup?.entryCount ?? props.entries.length} />
          <Metric palette={props.palette} label="Errors" value={selectedGroup?.errorCount ?? requestErrorCount(props.entries)} tone={(selectedGroup?.errorCount ?? 0) > 0 ? "danger" : "success"} />
          <Metric palette={props.palette} label="Duration" value={selectedGroup ? `${selectedGroup.durationMs}ms` : "mixed"} />
          <Metric palette={props.palette} label="Sources" value={selectedGroup ? selectedGroup.sources.join(", ") : props.sources.join(", ")} />
        </div>
        {selectedGroup && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
            <span style={pillStyle(props.palette, requestGroupTone(selectedGroup))}>{selectedGroup.kind}</span>
            {selectedGroup.pageId && <span style={pillStyle(props.palette)}>page {selectedGroup.pageId}</span>}
            {selectedGroup.parentId && <span style={pillStyle(props.palette)}>after {selectedGroup.parentId}</span>}
            <span style={pillStyle(props.palette)}>{formatDateTime(selectedGroup.startedAt)}</span>
            {selectedGroup.path && <span style={pillStyle(props.palette)}>{selectedGroup.path}</span>}
          </div>
        )}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(12rem, 1fr) 8rem 9rem auto auto", gap: "8px", alignItems: "center" }}>
        <input
          type="text"
          value={props.searchQuery}
          onChange={(event: ChangeEvent<HTMLInputElement>) => props.setSearchQuery(event.currentTarget.value ?? "")}
          placeholder="Search method, path, status, headers, body..."
          style={inputStyle(props.palette)}
        />
        <select
          value={props.sourceFilter}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => props.setSourceFilter(event.currentTarget.value ?? "all")}
          style={inputStyle(props.palette)}
        >
          <option value="all">All sources</option>
          {props.sources.map((source) => <option key={source} value={source}>{source}</option>)}
        </select>
        <select
          value={props.statusFilter}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => props.setStatusFilter((event.currentTarget.value ?? "all") as RequestStatusFilter)}
          style={inputStyle(props.palette)}
        >
          <option value="all">All statuses</option>
          <option value="ok">2xx</option>
          <option value="redirect">3xx</option>
          <option value="client-error">4xx</option>
          <option value="server-error">5xx</option>
          <option value="failed">Failed</option>
        </select>
        <button type="button" onClick={props.fetchEntries} style={buttonStyle(props.palette)}>
          {props.loading ? "Refreshing..." : "Refresh"}
        </button>
        <button type="button" onClick={props.clearEntries} style={buttonStyle(props.palette)}>
          Clear
        </button>
      </div>

      {props.requestGroups.length > 0 && (
        <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "1px" }}>
          {props.requestGroups.slice(0, 12).map((group, index) => (
            <button
              key={group.id}
              type="button"
              onClick={() => props.setSelectedRequestId(group.id)}
              style={{
                ...buttonStyle(props.palette, selectedGroupId === group.id),
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                maxWidth: "18rem",
              }}
              title={requestGroupLabel(group)}
            >
              <span>{index === 0 ? "Current" : `Previous ${index}`}</span>
              <span style={{ fontFamily: MONO_FONT, overflow: "hidden", textOverflow: "ellipsis" }}>
                {group.path ?? group.label}
              </span>
              <span>{group.entryCount}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ maxHeight: "52vh", overflow: "auto", border: `1px solid ${props.palette.border}`, borderRadius: "8px", backgroundColor: props.palette.panelMuted }}>
        {props.visibleEntries.length === 0 ? (
          <EmptyState palette={props.palette}>
            {props.entries.length === 0 ? "No SDK or Ominity API requests captured yet." : "No requests match the active filters."}
          </EmptyState>
        ) : (
          props.visibleEntries.map((entry) => (
            <details key={entry.id} style={{ borderBottom: `1px solid ${props.palette.border}`, padding: "9px 10px", fontSize: "12px" }}>
              <summary style={{ display: "flex", cursor: "pointer", listStyle: "none", alignItems: "center", gap: "8px", color: props.palette.text }}>
                <span style={pillStyle(props.palette)}>{entry.source}</span>
                <span style={pillStyle(props.palette)}>{entry.method}</span>
                <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: MONO_FONT }}>
                  {shortUrl(entry.path)}
                </span>
                <span style={{ fontFamily: MONO_FONT, color: statusColor(entry, props.palette) }}>
                  {entry.status ?? "ERR"}
                </span>
                <span style={{ fontFamily: MONO_FONT, color: props.palette.faint }}>{entry.durationMs}ms</span>
              </summary>

              <div style={{ marginTop: "9px", display: "grid", gap: "8px", paddingBottom: "4px", fontSize: "11px", color: props.palette.text }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                  <Field palette={props.palette} label="Started" value={formatDateTime(entry.startedAt)} />
                  <Field palette={props.palette} label="Duration" value={`${entry.durationMs}ms`} mono />
                  <Field palette={props.palette} label="Status" value={entry.status ?? entry.error ?? "Network error"} mono />
                </div>
                <div style={{ fontFamily: MONO_FONT, overflowWrap: "anywhere", color: props.palette.muted }}>{entry.url}</div>
                {entry.error && (
                  <div style={{ borderRadius: "6px", backgroundColor: props.palette.dangerSoft, border: `1px solid ${props.palette.danger}`, color: props.palette.danger, padding: "8px" }}>
                    {entry.error}
                  </div>
                )}
                <JsonPanel title="Request headers" value={entry.requestHeaders} palette={props.palette} />
                {entry.requestBody && (
                  <details style={{ borderRadius: "8px", border: `1px solid ${props.palette.border}`, backgroundColor: props.palette.panelMuted, padding: "9px" }}>
                    <summary style={{ cursor: "pointer", color: props.palette.text, fontSize: "12px", fontWeight: 650 }}>Request body</summary>
                    {renderCodeBlock(entry.requestBody, props.palette)}
                  </details>
                )}
                <JsonPanel title="Response headers" value={entry.responseHeaders} palette={props.palette} />
                {entry.responseBody && (
                  <details style={{ borderRadius: "8px", border: `1px solid ${props.palette.border}`, backgroundColor: props.palette.panelMuted, padding: "9px" }}>
                    <summary style={{ cursor: "pointer", color: props.palette.text, fontSize: "12px", fontWeight: 650 }}>Response body</summary>
                    {renderCodeBlock(entry.responseBody, props.palette)}
                  </details>
                )}
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
