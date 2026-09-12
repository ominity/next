"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import {
  entryMatchesRequestGroup,
  entryMatchesSearch,
  entryMatchesStatus,
  requestStats,
  type RequestGroupSelection,
  type RequestStatusFilter,
} from "./request-utils.js";
import { AuthTab } from "./tabs/AuthTab.js";
import { ChannelTab } from "./tabs/ChannelTab.js";
import { GeneralTab } from "./tabs/GeneralTab.js";
import {
  CacheTab,
  CommerceTab,
  FormsTab,
  HealthTab,
  RenderingTab,
  TrackingTab,
} from "./tabs/ObservabilityTabs.js";
import { RequestsTab } from "./tabs/RequestsTab.js";
import { ToolsTab, type OminityDebugSnapshotInput } from "./tabs/ToolsTab.js";
import type {
  OminityDebugAuthInfo,
  OminityDebugCacheInfo,
  OminityDebugChannelInfo,
  OminityDebugCommerceInfo,
  OminityDebugConfigHealthInfo,
  OminityDebugCustomerInfo,
  OminityDebugEntry,
  OminityDebugFormsInfo,
  OminityDebugIntegrationInfo,
  OminityDebugListResponse,
  OminityDebugRenderingInfo,
  OminityDebugRequestGroup,
  OminityDebugSource,
  OminityDebugTheme,
  OminityDebugTrackingInfo,
  OminityDebugUtilitiesInfo,
} from "./types.js";
import {
  BODY_FONT,
  buttonStyle,
  inputStyle,
  pillStyle,
  resolvePalette,
  useSystemDarkMode,
} from "./ui.js";

export type OminityDebugBarTab =
  | "general"
  | "health"
  | "channel"
  | "rendering"
  | "cache"
  | "auth"
  | "commerce"
  | "forms"
  | "tracking"
  | "requests"
  | "tools";

export interface OminityDebugBarProps {
  readonly enabled: boolean;
  readonly endpoint?: string;
  readonly title?: string;
  readonly source?: OminityDebugSource | "all";
  readonly limit?: number;
  readonly pollWhenOpenMs?: number;
  readonly pollWhenClosedMs?: number;
  readonly zIndex?: number;
  readonly initialOpen?: boolean;
  readonly initialTab?: OminityDebugBarTab;
  readonly theme?: OminityDebugTheme;
  readonly integration?: OminityDebugIntegrationInfo;
  readonly health?: OminityDebugConfigHealthInfo;
  readonly channel?: OminityDebugChannelInfo;
  readonly rendering?: OminityDebugRenderingInfo;
  readonly cache?: OminityDebugCacheInfo;
  readonly auth?: OminityDebugAuthInfo | false;
  readonly customer?: OminityDebugCustomerInfo | false;
  readonly commerce?: OminityDebugCommerceInfo;
  readonly forms?: OminityDebugFormsInfo;
  readonly tracking?: OminityDebugTrackingInfo;
  readonly utilities?: OminityDebugUtilitiesInfo;
}

export function OminityDebugBar(props: OminityDebugBarProps) {
  const [open, setOpen] = useState(props.initialOpen ?? false);
  const [activeTab, setActiveTab] = useState<OminityDebugBarTab>(props.initialTab ?? "general");
  const [theme, setTheme] = useState<OminityDebugTheme>(props.theme ?? "system");
  const [entries, setEntries] = useState<ReadonlyArray<OminityDebugEntry>>([]);
  const [requestGroups, setRequestGroups] = useState<ReadonlyArray<OminityDebugRequestGroup>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<RequestGroupSelection>("latest");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>("all");
  const [lastError, setLastError] = useState<string | null>(null);
  const [liveUpdatesPaused, setLiveUpdatesPaused] = useState(false);
  const systemDark = useSystemDarkMode();
  const palette = resolvePalette(theme, systemDark);

  const endpoint = props.endpoint ?? "/api/debug/sdk-requests";
  const title = props.title ?? "Ominity Debug";
  const source = props.source ?? "all";
  const limit = Number.isFinite(props.limit) && (props.limit ?? 0) > 0
    ? Math.floor(props.limit!)
    : 180;
  const pollWhenOpenMs = Number.isFinite(props.pollWhenOpenMs) && (props.pollWhenOpenMs ?? 0) > 0
    ? Math.floor(props.pollWhenOpenMs!)
    : 1500;
  const pollWhenClosedMs = Number.isFinite(props.pollWhenClosedMs) && (props.pollWhenClosedMs ?? 0) > 0
    ? Math.floor(props.pollWhenClosedMs!)
    : 3500;

  useEffect(() => {
    if (props.theme) {
      setTheme(props.theme);
    }
  }, [props.theme]);

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
      setRequestGroups(Array.isArray(payload.requestGroups) ? payload.requestGroups : []);
      setTotal(typeof payload.total === "number" ? payload.total : 0);
      setLastError(null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Failed to load debug entries.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, limit, props.enabled, source]);

  useEffect(() => {
    if (!props.enabled || liveUpdatesPaused) {
      return;
    }

    void fetchEntries();
    const interval = window.setInterval(() => {
      void fetchEntries();
    }, open ? pollWhenOpenMs : pollWhenClosedMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [fetchEntries, liveUpdatesPaused, open, pollWhenClosedMs, pollWhenOpenMs, props.enabled]);

  const clearEntries = useCallback(async () => {
    try {
      await fetch(endpoint, {
        method: "DELETE",
      });
    } catch {
      // The next fetch surfaces endpoint availability; clearing is best effort.
    }

    await fetchEntries();
  }, [endpoint, fetchEntries]);

  const sources = useMemo(() => Array.from(new Set(entries.map((entry) => entry.source))).sort(), [entries]);

  const visibleEntries = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return entries
      .filter((entry) => entryMatchesRequestGroup(entry, selectedRequestId, requestGroups))
      .filter((entry) => sourceFilter === "all" || entry.source === sourceFilter)
      .filter((entry) => entryMatchesStatus(entry, statusFilter))
      .filter((entry) => entryMatchesSearch(entry, normalizedSearch));
  }, [entries, requestGroups, searchQuery, selectedRequestId, sourceFilter, statusFilter]);

  const stats = useMemo(() => requestStats(entries, visibleEntries.length), [entries, visibleEntries.length]);

  const snapshot = useMemo<OminityDebugSnapshotInput>(() => ({
    generatedAt: new Date().toISOString(),
    ...(props.integration ? { integration: props.integration } : {}),
    ...(props.health ? { health: props.health } : {}),
    ...(props.channel ? { channel: props.channel } : {}),
    ...(props.rendering ? { rendering: props.rendering } : {}),
    ...(props.cache ? { cache: props.cache } : {}),
    ...(typeof props.auth !== "undefined" ? { auth: props.auth } : {}),
    ...(typeof props.customer !== "undefined" ? { customer: props.customer } : {}),
    ...(props.commerce ? { commerce: props.commerce } : {}),
    ...(props.forms ? { forms: props.forms } : {}),
    ...(props.tracking ? { tracking: props.tracking } : {}),
    ...(props.utilities ? { utilities: props.utilities } : {}),
    requestGroups,
    entries,
  }), [
    entries,
    props.auth,
    props.cache,
    props.channel,
    props.commerce,
    props.customer,
    props.forms,
    props.health,
    props.integration,
    props.rendering,
    props.tracking,
    props.utilities,
    requestGroups,
  ]);

  if (!props.enabled) {
    return null;
  }

  const tabItems: ReadonlyArray<{ readonly key: OminityDebugBarTab; readonly label: string; readonly count?: number }> = [
    { key: "general", label: "General" },
    { key: "health", label: "Health" },
    { key: "channel", label: "Channel" },
    { key: "rendering", label: "Rendering" },
    { key: "cache", label: "Cache" },
    { key: "auth", label: "Auth" },
    { key: "commerce", label: "Commerce" },
    { key: "forms", label: "Forms" },
    { key: "tracking", label: "Tracking" },
    { key: "requests", label: "Requests", count: visibleEntries.length },
    { key: "tools", label: "Tools" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        bottom: "12px",
        right: "12px",
        zIndex: props.zIndex ?? 70,
        width: open ? "min(96vw, 74rem)" : "auto",
        fontFamily: BODY_FONT,
      }}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "7px",
            border: `1px solid ${palette.border}`,
            borderRadius: "8px",
            backgroundColor: palette.panel,
            color: palette.text,
            height: "38px",
            padding: "0 12px",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: palette.shadow,
            backdropFilter: "blur(8px)",
          }}
        >
          <span>{title}</span>
          <span style={pillStyle(palette, stats.errors > 0 ? "danger" : "default")}>{total}</span>
        </button>
      ) : (
        <div
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: "8px",
            backgroundColor: palette.panel,
            color: palette.text,
            boxShadow: palette.shadow,
            backdropFilter: "blur(8px)",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${palette.border}`, padding: "9px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 800, color: palette.text, whiteSpace: "nowrap" }}>{title}</div>
              <span style={pillStyle(palette, stats.errors > 0 ? "danger" : "success")}>
                {stats.errors} errors
              </span>
              <span style={pillStyle(palette)}>{stats.total} calls</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <select value={theme} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTheme((event.currentTarget.value ?? "system") as OminityDebugTheme)} style={{ ...inputStyle(palette), height: "30px", fontSize: "11px" }}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
              <button type="button" onClick={() => { void fetchEntries(); }} style={buttonStyle(palette)}>
                {loading ? "Refreshing..." : "Refresh"}
              </button>
              <button type="button" onClick={() => setOpen(false)} style={buttonStyle(palette)}>
                Close
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "4px", borderBottom: `1px solid ${palette.border}`, padding: "7px 8px", backgroundColor: palette.panelMuted, overflowX: "auto" }}>
            {tabItems.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={buttonStyle(palette, activeTab === tab.key)}
              >
                {tab.label}{typeof tab.count === "number" ? ` ${tab.count}` : ""}
              </button>
            ))}
          </div>

          <div style={{ padding: "10px", maxHeight: "70vh", overflow: "auto" }}>
            {activeTab === "general" && (
              <GeneralTab
                palette={palette}
                integration={props.integration}
                stats={stats}
                endpoint={endpoint}
                source={source}
                limit={limit}
                lastError={lastError}
              />
            )}
            {activeTab === "health" && <HealthTab palette={palette} health={props.health} />}
            {activeTab === "channel" && <ChannelTab palette={palette} channel={props.channel} />}
            {activeTab === "rendering" && <RenderingTab palette={palette} rendering={props.rendering} />}
            {activeTab === "cache" && <CacheTab palette={palette} cache={props.cache} />}
            {activeTab === "auth" && <AuthTab palette={palette} auth={props.auth} customer={props.customer} />}
            {activeTab === "commerce" && <CommerceTab palette={palette} commerce={props.commerce} />}
            {activeTab === "forms" && <FormsTab palette={palette} forms={props.forms} />}
            {activeTab === "tracking" && <TrackingTab palette={palette} tracking={props.tracking} />}
            {activeTab === "requests" && (
              <RequestsTab
                palette={palette}
                entries={entries}
                visibleEntries={visibleEntries}
                requestGroups={requestGroups}
                selectedRequestId={selectedRequestId}
                setSelectedRequestId={setSelectedRequestId}
                sourceFilter={sourceFilter}
                setSourceFilter={setSourceFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                sources={sources}
                clearEntries={() => { void clearEntries(); }}
                fetchEntries={() => { void fetchEntries(); }}
                loading={loading}
              />
            )}
            {activeTab === "tools" && (
              <ToolsTab
                palette={palette}
                snapshot={snapshot}
                liveUpdatesPaused={liveUpdatesPaused}
                setLiveUpdatesPaused={setLiveUpdatesPaused}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
