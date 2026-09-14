import type {
  OminityDebugIntegrationInfo,
  OminityDebugSource,
} from "../types.js";
import {
  Field,
  JsonPanel,
  Metric,
  Panel,
  displayValue,
  formatDateTime,
  pillStyle,
  sectionTitleStyle,
  type Palette,
} from "../ui.js";
import type { RequestStats } from "../request-utils.js";

export function GeneralTab(props: {
  readonly palette: Palette;
  readonly integration: OminityDebugIntegrationInfo | undefined;
  readonly stats: RequestStats;
  readonly endpoint: string;
  readonly source: OminityDebugSource | "all";
  readonly limit: number;
  readonly lastError: string | null;
}) {
  const flags = props.integration?.flags ?? [];

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
        <Metric palette={props.palette} label="Captured" value={props.stats.total} />
        <Metric palette={props.palette} label="Request errors" value={props.stats.errors} tone={props.stats.errors > 0 ? "danger" : "success"} />
        <Metric palette={props.palette} label="Average" value={`${props.stats.averageMs}ms`} />
        <Metric palette={props.palette} label="Slowest" value={`${props.stats.slowestMs}ms`} tone={props.stats.slowestMs > 1000 ? "warning" : "default"} />
      </div>

      {props.lastError && (
        <Panel palette={props.palette} style={{ borderColor: props.palette.danger, backgroundColor: props.palette.dangerSoft, color: props.palette.danger, fontSize: "12px" }}>
          {props.lastError}
        </Panel>
      )}

      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>Integration</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginTop: "10px" }}>
          <Field palette={props.palette} label="App" value={props.integration?.appName} />
          <Field palette={props.palette} label="Environment" value={props.integration?.environment} />
          <Field palette={props.palette} label="Runtime" value={props.integration?.runtime} />
          <Field palette={props.palette} label="Package" value={props.integration?.packageName ?? "@ominity/next"} mono />
          <Field palette={props.palette} label="Package version" value={props.integration?.packageVersion} mono />
          <Field palette={props.palette} label="SDK version" value={props.integration?.sdkVersion} mono />
          <Field palette={props.palette} label="Next version" value={props.integration?.nextVersion} mono />
          <Field palette={props.palette} label="Route" value={props.integration?.route} mono />
          <Field palette={props.palette} label="Locale" value={props.integration?.locale} mono />
          <Field palette={props.palette} label="API URL" value={props.integration?.apiUrl} mono />
          <Field palette={props.palette} label="Base path" value={props.integration?.basePath} mono />
          <Field palette={props.palette} label="Mock data" value={props.integration?.mockData} />
          <Field palette={props.palette} label="Debug logs" value={props.integration?.debugLogs} />
          <Field
            palette={props.palette}
            label="Dev Tool"
            value={props.integration?.devTool ?? props.integration?.debugBar ?? true}
          />
          <Field palette={props.palette} label="Dev Tool endpoint" value={props.endpoint} mono />
          <Field palette={props.palette} label="Request source" value={props.source} mono />
          <Field palette={props.palette} label="Request limit" value={props.limit} mono />
          <Field palette={props.palette} label="Latest request" value={formatDateTime(props.stats.latestAt)} />
        </div>
      </Panel>

      {flags.length > 0 && (
        <Panel palette={props.palette}>
          <h3 style={sectionTitleStyle(props.palette)}>Feature Flags</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
            {flags.map((flag) => (
              <span key={flag.label} style={pillStyle(
                props.palette,
                flag.status === "enabled"
                  ? "success"
                  : flag.status === "disabled"
                    ? "danger"
                    : "default",
              )}>
                {flag.label}: {displayValue(flag.value)}
              </span>
            ))}
          </div>
        </Panel>
      )}

      <JsonPanel title="Integration details" value={props.integration?.details} palette={props.palette} />
    </div>
  );
}
