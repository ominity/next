"use client";

import {
  useCallback,
  useMemo,
  useState,
} from "react";

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
  OminityDebugRenderingInfo,
  OminityDebugRequestGroup,
  OminityDebugTrackingInfo,
  OminityDebugUtilitiesInfo,
} from "../types.js";
import {
  Field,
  JsonPanel,
  Panel,
  buttonStyle,
  formatDateTime,
  mutedTextStyle,
  pillStyle,
  sectionTitleStyle,
  type Palette,
} from "../ui.js";

export interface OminityDebugSnapshotInput {
  readonly generatedAt: string;
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
  readonly requestGroups: ReadonlyArray<OminityDebugRequestGroup>;
  readonly entries: ReadonlyArray<OminityDebugEntry>;
}

function safeSnapshot(input: OminityDebugSnapshotInput): Record<string, unknown> {
  return {
    generatedAt: input.generatedAt,
    integration: input.integration,
    health: input.health,
    channel: input.channel,
    rendering: input.rendering,
    cache: input.cache,
    auth: input.auth === false ? undefined : input.auth,
    customer: input.customer === false ? undefined : input.customer,
    commerce: input.commerce,
    forms: input.forms,
    tracking: input.tracking,
    utilities: input.utilities,
    requestGroups: input.requestGroups,
    entries: input.entries,
  };
}

function snapshotText(input: OminityDebugSnapshotInput): string {
  return JSON.stringify(safeSnapshot(input), null, 2);
}

function bugReportText(input: OminityDebugSnapshotInput): string {
  const errorEntries = input.entries.filter((entry) => !entry.ok || (typeof entry.status === "number" && entry.status >= 400));
  return [
    "# Ominity Dev Tool Snapshot",
    "",
    `Generated: ${input.generatedAt}`,
    `App: ${input.integration?.appName ?? "n/a"}`,
    `Environment: ${input.integration?.environment ?? input.health?.environment ?? "n/a"}`,
    `Route: ${input.rendering?.nextRoute ?? input.integration?.route ?? "n/a"}`,
    `Channel: ${input.channel?.identifier ?? input.channel?.id ?? input.health?.channelId ?? "n/a"}`,
    `Requests: ${input.entries.length}`,
    `Errors: ${errorEntries.length}`,
    "",
    "## Request Groups",
    ...input.requestGroups.map((group) => `- ${group.method ?? ""} ${group.path ?? group.label}: ${group.entryCount} calls, ${group.errorCount} errors`),
    "",
    "## Errors",
    ...(errorEntries.length > 0
      ? errorEntries.map((entry) => `- ${entry.method} ${entry.path}: ${entry.status ?? "ERR"} ${entry.error ?? ""}`.trim())
      : ["- none"]),
  ].join("\n");
}

async function copyText(value: string): Promise<void> {
  if (!navigator.clipboard) {
    throw new Error("Clipboard API is unavailable.");
  }
  await navigator.clipboard.writeText(value);
}

function downloadText(filename: string, value: string): void {
  const url = URL.createObjectURL(new Blob([value], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ToolsTab(props: {
  readonly palette: Palette;
  readonly snapshot: OminityDebugSnapshotInput;
  readonly liveUpdatesPaused: boolean;
  readonly setLiveUpdatesPaused: (value: boolean) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const utilities = props.snapshot.utilities;
  const recordingPaused = utilities?.recordingPaused ?? false;

  const generatedSnapshot = useMemo(() => snapshotText(props.snapshot), [props.snapshot]);
  const generatedBugReport = useMemo(() => bugReportText(props.snapshot), [props.snapshot]);

  const run = useCallback(async (name: string, action: () => void | Promise<void>) => {
    setPending(name);
    setMessage(null);
    try {
      await action();
      setMessage(`${name} complete.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${name} failed.`);
    } finally {
      setPending(null);
    }
  }, []);

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      {message && (
        <Panel palette={props.palette}>
          <span style={{ color: props.palette.text, fontSize: "12px" }}>{message}</span>
        </Panel>
      )}

      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>Dev Tool Snapshot</h3>
        <p style={mutedTextStyle(props.palette)}>
          Export includes the current debug props, grouped requests, and captured SDK calls with sensitive headers already redacted by the fetcher.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
          <button type="button" onClick={() => { downloadText("ominity-debug-snapshot.json", generatedSnapshot); }} style={buttonStyle(props.palette)}>
            Export JSON
          </button>
          <button type="button" onClick={() => { void run("Copy snapshot", () => copyText(generatedSnapshot)); }} style={buttonStyle(props.palette)}>
            {pending === "Copy snapshot" ? "Copying..." : "Copy JSON"}
          </button>
          <button type="button" onClick={() => { void run("Copy bug report", () => copyText(generatedBugReport)); }} style={buttonStyle(props.palette)}>
            {pending === "Copy bug report" ? "Copying..." : "Copy Bug Report"}
          </button>
        </div>
      </Panel>

      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>Recording Controls</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px", marginTop: "10px" }}>
          <Field palette={props.palette} label="Live updates" value={!props.liveUpdatesPaused} />
          <Field palette={props.palette} label="Server recording paused" value={recordingPaused} />
          <Field palette={props.palette} label="Preserve logs" value={utilities?.preserveLogsAcrossNavigation} />
          <Field palette={props.palette} label="Body preview limit" value={utilities?.bodyPreviewLimit} mono />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
          <button
            type="button"
            onClick={() => props.setLiveUpdatesPaused(!props.liveUpdatesPaused)}
            style={buttonStyle(props.palette, props.liveUpdatesPaused)}
          >
            {props.liveUpdatesPaused ? "Resume Live Updates" : "Pause Live Updates"}
          </button>
          <button
            type="button"
            disabled={!utilities?.actions?.pauseRecording || pending !== null}
            onClick={() => utilities?.actions?.pauseRecording && void run("Pause recording", utilities.actions.pauseRecording)}
            style={{ ...buttonStyle(props.palette), opacity: !utilities?.actions?.pauseRecording ? 0.5 : 1 }}
          >
            Pause Recording
          </button>
          <button
            type="button"
            disabled={!utilities?.actions?.resumeRecording || pending !== null}
            onClick={() => utilities?.actions?.resumeRecording && void run("Resume recording", utilities.actions.resumeRecording)}
            style={{ ...buttonStyle(props.palette), opacity: !utilities?.actions?.resumeRecording ? 0.5 : 1 }}
          >
            Resume Recording
          </button>
          <button
            type="button"
            disabled={!utilities?.actions?.clearCaches || pending !== null}
            onClick={() => utilities?.actions?.clearCaches && void run("Clear caches", utilities.actions.clearCaches)}
            style={{ ...buttonStyle(props.palette), opacity: !utilities?.actions?.clearCaches ? 0.5 : 1 }}
          >
            Clear Caches
          </button>
        </div>
      </Panel>

      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>Redaction</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
          {(utilities?.redactHeaders ?? ["authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"]).map((header) => (
            <span key={header} style={pillStyle(props.palette)}>{header}</span>
          ))}
        </div>
      </Panel>

      <JsonPanel title="Utilities details" value={utilities?.details} palette={props.palette} />
      <details style={{ border: `1px solid ${props.palette.border}`, borderRadius: "8px", padding: "9px", backgroundColor: props.palette.panelMuted }}>
        <summary style={{ cursor: "pointer", color: props.palette.text, fontSize: "12px", fontWeight: 650 }}>
          Snapshot preview
        </summary>
        <pre style={{ whiteSpace: "pre-wrap", color: props.palette.code, fontSize: "11px", maxHeight: "18rem", overflow: "auto" }}>
          {generatedSnapshot}
        </pre>
      </details>
    </div>
  );
}
