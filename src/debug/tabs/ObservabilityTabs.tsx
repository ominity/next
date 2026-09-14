import type {
  OminityDebugCacheEntry,
  OminityDebugCacheInfo,
  OminityDebugCommerceInfo,
  OminityDebugComponentRenderInfo,
  OminityDebugConfigHealthInfo,
  OminityDebugFormsInfo,
  OminityDebugRenderingInfo,
  OminityDebugTrackingInfo,
} from "../types.js";
import {
  EmptyState,
  Field,
  JsonPanel,
  Metric,
  Panel,
  displayValue,
  formatDateTime,
  pillStyle,
  sectionTitleStyle,
  type Palette,
  type Tone,
} from "../ui.js";

function statusTone(value: string | undefined): Tone {
  if (value === "enabled" || value === "hit" || value === "revalidated" || value === "registered" || value === "sent") {
    return "success";
  }
  if (value === "disabled" || value === "missing" || value === "errored" || value === "failed") {
    return "danger";
  }
  if (value === "warning" || value === "stale" || value === "skipped" || value === "queued") {
    return "warning";
  }
  if (value === "miss" || value === "bypass" || value === "dropped") {
    return "info";
  }
  return "default";
}

function stringList(value: ReadonlyArray<string> | undefined): string {
  return value && value.length > 0 ? value.join(", ") : "n/a";
}

function ComponentTree(props: {
  readonly components: ReadonlyArray<OminityDebugComponentRenderInfo>;
  readonly palette: Palette;
  readonly depth?: number;
}) {
  return (
    <div style={{ display: "grid", gap: "6px" }}>
      {props.components.map((component, index) => (
        <div
          key={`${component.key}-${component.id ?? index}`}
          style={{
            border: `1px solid ${props.palette.border}`,
            borderRadius: "7px",
            backgroundColor: props.palette.panel,
            padding: "8px",
            marginLeft: `${(props.depth ?? 0) * 10}px`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={pillStyle(props.palette, statusTone(component.status))}>{component.status}</span>
            <strong style={{ color: props.palette.text, fontSize: "12px" }}>{component.key}</strong>
            {component.type && <span style={pillStyle(props.palette)}>{component.type}</span>}
            {typeof component.durationMs === "number" && (
              <span style={pillStyle(props.palette)}>{component.durationMs}ms</span>
            )}
          </div>
          {component.error && (
            <div style={{ color: props.palette.danger, fontSize: "11px", marginTop: "6px" }}>
              {component.error}
            </div>
          )}
          {component.children && component.children.length > 0 && (
            <div style={{ marginTop: "7px" }}>
              <ComponentTree components={component.children} palette={props.palette} depth={(props.depth ?? 0) + 1} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function HealthTab(props: {
  readonly palette: Palette;
  readonly health: OminityDebugConfigHealthInfo | undefined;
}) {
  const checks = props.health?.checks ?? [];
  const warnings = props.health?.unsafeWarnings ?? [];
  const missing = props.health?.missingEnvironment ?? [];

  if (!props.health) {
    return <EmptyState palette={props.palette}>No application configuration health data is available.</EmptyState>;
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
        <Metric palette={props.palette} label="Mode" value={props.health.mode ?? "unknown"} />
        <Metric palette={props.palette} label="Warnings" value={warnings.length} tone={warnings.length > 0 ? "warning" : "success"} />
        <Metric palette={props.palette} label="Missing env" value={missing.length} tone={missing.length > 0 ? "danger" : "success"} />
        <Metric palette={props.palette} label="Draft/preview" value={props.health.draftMode || props.health.previewMode} />
      </div>

      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>Configuration</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginTop: "10px" }}>
          <Field palette={props.palette} label="Environment" value={props.health.environment} />
          <Field palette={props.palette} label="API URL" value={props.health.apiUrl} mono />
          <Field palette={props.palette} label="Channel ID" value={props.health.channelId} mono />
          <Field palette={props.palette} label="Locale strategy" value={props.health.localeSegmentStrategy} mono />
          <Field palette={props.palette} label="Base path" value={props.health.basePath} mono />
          <Field palette={props.palette} label="Trailing slash" value={props.health.trailingSlash} />
          <Field palette={props.palette} label="Canonical redirects" value={props.health.canonicalRedirectPolicy} />
          <Field palette={props.palette} label="Draft mode" value={props.health.draftMode} />
          <Field palette={props.palette} label="Preview mode" value={props.health.previewMode} />
        </div>
      </Panel>

      {(warnings.length > 0 || missing.length > 0) && (
        <Panel palette={props.palette}>
          <h3 style={sectionTitleStyle(props.palette)}>Warnings</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
            {warnings.map((warning) => <span key={warning} style={pillStyle(props.palette, "warning")}>{warning}</span>)}
            {missing.map((env) => <span key={env} style={pillStyle(props.palette, "danger")}>{env}</span>)}
          </div>
        </Panel>
      )}

      {checks.length > 0 && (
        <Panel palette={props.palette}>
          <h3 style={sectionTitleStyle(props.palette)}>Checks</h3>
          <div style={{ display: "grid", gap: "6px", marginTop: "9px" }}>
            {checks.map((check) => (
              <div key={check.label} style={{ display: "flex", gap: "7px", alignItems: "center", color: props.palette.text, fontSize: "12px" }}>
                <span style={pillStyle(props.palette, statusTone(check.severity ?? check.status))}>{check.status}</span>
                <strong>{check.label}</strong>
                {check.message && <span style={{ color: props.palette.faint }}>{check.message}</span>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <JsonPanel title="Health details" value={props.health.details} palette={props.palette} />
    </div>
  );
}

export function RenderingTab(props: {
  readonly palette: Palette;
  readonly rendering: OminityDebugRenderingInfo | undefined;
}) {
  const components = props.rendering?.components ?? [];
  const permissionChecks = props.rendering?.permissionChecks ?? [];

  if (!props.rendering) {
    return <EmptyState palette={props.palette}>Pass `rendering` to inspect route resolution, CMS page metadata, components, and permission checks.</EmptyState>;
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>Route Resolution</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginTop: "10px" }}>
          <Field palette={props.palette} label="Next route" value={props.rendering.nextRoute} mono />
          <Field palette={props.palette} label="Incoming path" value={props.rendering.incomingPath} mono />
          <Field palette={props.palette} label="Resolved CMS path" value={props.rendering.resolvedCmsPath} mono />
          <Field palette={props.palette} label="Canonical path" value={props.rendering.canonicalPath} mono />
          <Field palette={props.palette} label="Redirect" value={props.rendering.shouldRedirect} />
          <Field palette={props.palette} label="Redirect target" value={props.rendering.redirectTarget} mono />
        </div>
      </Panel>

      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>CMS Page</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginTop: "10px" }}>
          <Field palette={props.palette} label="ID" value={props.rendering.cmsPage?.id} mono />
          <Field palette={props.palette} label="Title" value={props.rendering.cmsPage?.title} />
          <Field palette={props.palette} label="Slug" value={props.rendering.cmsPage?.slug} mono />
          <Field palette={props.palette} label="Locale" value={props.rendering.cmsPage?.locale} mono />
          <Field palette={props.palette} label="Status" value={props.rendering.cmsPage?.status} />
          <Field palette={props.palette} label="Translations" value={props.rendering.cmsPage?.translationCount} mono />
        </div>
      </Panel>

      {props.rendering.localeResolution && props.rendering.localeResolution.length > 0 && (
        <Panel palette={props.palette}>
          <h3 style={sectionTitleStyle(props.palette)}>Locale Resolution</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
            {props.rendering.localeResolution.map((step) => (
              <span key={step.label} style={pillStyle(props.palette, step.status === "enabled" ? "success" : "default")}>
                {step.label}: {displayValue(step.value)}
              </span>
            ))}
          </div>
        </Panel>
      )}

      {components.length > 0 && (
        <Panel palette={props.palette}>
          <h3 style={sectionTitleStyle(props.palette)}>Component Tree</h3>
          <div style={{ marginTop: "9px" }}>
            <ComponentTree components={components} palette={props.palette} />
          </div>
        </Panel>
      )}

      {permissionChecks.length > 0 && (
        <Panel palette={props.palette}>
          <h3 style={sectionTitleStyle(props.palette)}>Permission Checks</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
            {permissionChecks.map((check) => (
              <span key={`${check.source ?? "permission"}-${check.permission}`} style={pillStyle(props.palette, check.result ? "success" : "danger")}>
                {check.permission}
              </span>
            ))}
          </div>
        </Panel>
      )}

      <JsonPanel title="Translation paths" value={props.rendering.cmsPage?.translations} palette={props.palette} />
      <JsonPanel title="Rendering details" value={props.rendering.details} palette={props.palette} />
    </div>
  );
}

function CacheEntryList(props: {
  readonly entries: ReadonlyArray<OminityDebugCacheEntry>;
  readonly palette: Palette;
  readonly revalidate?: (entryKey?: string) => void | Promise<void>;
}) {
  return (
    <div style={{ display: "grid", gap: "6px", marginTop: "9px" }}>
      {props.entries.map((entry) => (
        <div key={entry.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "8px", alignItems: "center", border: `1px solid ${props.palette.border}`, borderRadius: "7px", backgroundColor: props.palette.panel, padding: "8px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={pillStyle(props.palette, statusTone(entry.status))}>{entry.status ?? "unknown"}</span>
              {entry.scope && <span style={pillStyle(props.palette)}>{entry.scope}</span>}
              <strong style={{ color: props.palette.text, fontSize: "12px", overflowWrap: "anywhere" }}>{entry.key}</strong>
            </div>
            <div style={{ color: props.palette.faint, fontSize: "11px", marginTop: "4px" }}>
              {entry.resource ?? "resource n/a"} · revalidate {displayValue(entry.revalidateSeconds)} · fetched {formatDateTime(entry.lastFetchedAt)}
            </div>
          </div>
          {props.revalidate && (
            <button type="button" onClick={() => { void props.revalidate?.(entry.key); }} style={pillStyle(props.palette, "info")}>
              Revalidate
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function CacheTab(props: {
  readonly palette: Palette;
  readonly cache: OminityDebugCacheInfo | undefined;
}) {
  const entries = props.cache?.entries ?? [];

  if (!props.cache) {
    return <EmptyState palette={props.palette}>Pass `cache` to inspect route revalidation, cache hits, misses, and resource timestamps.</EmptyState>;
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
        <Metric palette={props.palette} label="Enabled" value={props.cache.enabled} />
        <Metric palette={props.palette} label="Hits" value={props.cache.hits ?? 0} tone="success" />
        <Metric palette={props.palette} label="Misses" value={props.cache.misses ?? 0} tone={(props.cache.misses ?? 0) > 0 ? "warning" : "default"} />
        <Metric palette={props.palette} label="Route revalidate" value={displayValue(props.cache.routeRevalidateSeconds)} />
      </div>

      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>Cache Entries</h3>
        {entries.length === 0 ? (
          <EmptyState palette={props.palette}>No cache entries supplied.</EmptyState>
        ) : (
          <CacheEntryList
            entries={entries}
            palette={props.palette}
            {...(props.cache.actions?.revalidate ? { revalidate: props.cache.actions.revalidate } : {})}
          />
        )}
      </Panel>

      <JsonPanel title="Cache details" value={props.cache.details} palette={props.palette} />
    </div>
  );
}

export function CommerceTab(props: {
  readonly palette: Palette;
  readonly commerce: OminityDebugCommerceInfo | undefined;
}) {
  if (!props.commerce) {
    return <EmptyState palette={props.palette}>Pass `commerce` to inspect visitor, cart, totals, country/currency, promotions, and checkout method resolution.</EmptyState>;
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "8px" }}>
        <Metric palette={props.palette} label="Items" value={props.commerce.cartItemCount ?? 0} />
        <Metric palette={props.palette} label="Subtotal" value={props.commerce.subtotal} />
        <Metric palette={props.palette} label="Shipping" value={props.commerce.shipping} />
        <Metric palette={props.palette} label="Tax" value={props.commerce.tax} />
        <Metric palette={props.palette} label="Total" value={props.commerce.total} />
      </div>
      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>Cart Context</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px", marginTop: "10px" }}>
          <Field palette={props.palette} label="Visitor ID" value={props.commerce.visitorId} mono />
          <Field palette={props.palette} label="Cart ID" value={props.commerce.cartId} mono />
          <Field palette={props.palette} label="Country" value={props.commerce.country} mono />
          <Field palette={props.palette} label="Currency" value={props.commerce.currency} mono />
          <Field palette={props.palette} label="Discount" value={props.commerce.discount} />
          <Field palette={props.palette} label="Promotions" value={stringList(props.commerce.promotionCodes)} mono />
        </div>
      </Panel>
      <JsonPanel title="Shipping methods" value={props.commerce.shippingMethods} palette={props.palette} />
      <JsonPanel title="Payment methods" value={props.commerce.paymentMethods} palette={props.palette} />
      <JsonPanel title="Products" value={props.commerce.products} palette={props.palette} />
      <JsonPanel title="Commerce details" value={props.commerce.details} palette={props.palette} />
    </div>
  );
}

export function FormsTab(props: {
  readonly palette: Palette;
  readonly forms: OminityDebugFormsInfo | undefined;
}) {
  const forms = props.forms?.forms ?? [];

  if (!props.forms) {
    return <EmptyState palette={props.palette}>Pass `forms` to inspect rendered form metadata, reCAPTCHA, validation, submissions, and uploads.</EmptyState>;
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>Forms Runtime</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px", marginTop: "10px" }}>
          <Field palette={props.palette} label="Enabled" value={props.forms.enabled} />
          <Field palette={props.palette} label="Forms" value={forms.length} mono />
          <Field palette={props.palette} label="Submission endpoint" value={props.forms.submissionEndpoint} mono />
          <Field palette={props.palette} label="Upload presign endpoint" value={props.forms.uploadPresignEndpoint} mono />
          <Field palette={props.palette} label="Last submission" value={formatDateTime(props.forms.lastSubmissionAt)} />
        </div>
      </Panel>
      {forms.map((form, index) => (
        <Panel key={`${form.id ?? form.key ?? index}`} palette={props.palette}>
          <h3 style={sectionTitleStyle(props.palette)}>{form.name ?? form.key ?? `Form ${index + 1}`}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px", marginTop: "10px" }}>
            <Field palette={props.palette} label="ID" value={form.id} mono />
            <Field palette={props.palette} label="Key" value={form.key} mono />
            <Field palette={props.palette} label="Endpoint" value={form.endpoint} mono />
            <Field palette={props.palette} label="reCAPTCHA" value={form.recaptchaMode} />
            <Field palette={props.palette} label="reCAPTCHA configured" value={form.recaptchaConfigured} />
            <Field palette={props.palette} label="Validation errors" value={form.validationErrors?.length ?? 0} mono />
            <Field palette={props.palette} label="Submission errors" value={form.submissionErrors?.length ?? 0} mono />
            <Field palette={props.palette} label="Uploads" value={form.uploadCount} mono />
          </div>
          <JsonPanel title="Metadata payload" value={form.metadata} palette={props.palette} />
          <JsonPanel title="Form details" value={form.details} palette={props.palette} />
        </Panel>
      ))}
      <JsonPanel title="Forms details" value={props.forms.details} palette={props.palette} />
    </div>
  );
}

export function TrackingTab(props: {
  readonly palette: Palette;
  readonly tracking: OminityDebugTrackingInfo | undefined;
}) {
  const events = props.tracking?.events ?? [];

  if (!props.tracking) {
    return <EmptyState palette={props.palette}>Pass `tracking` to inspect visitor IDs, page origin metadata, queued/sent events, and proxy request diagnostics.</EmptyState>;
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
        <Metric palette={props.palette} label="Queued" value={props.tracking.queuedCount ?? 0} />
        <Metric palette={props.palette} label="Sent" value={props.tracking.sentCount ?? 0} tone="success" />
        <Metric palette={props.palette} label="Failed" value={props.tracking.failedCount ?? 0} tone={(props.tracking.failedCount ?? 0) > 0 ? "danger" : "default"} />
        <Metric palette={props.palette} label="Events" value={events.length} />
      </div>
      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>Tracking Context</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginTop: "10px" }}>
          <Field palette={props.palette} label="Enabled" value={props.tracking.enabled} />
          <Field palette={props.palette} label="Visitor ID" value={props.tracking.visitorId} mono />
          <Field palette={props.palette} label="Session ID" value={props.tracking.sessionId} mono />
          <Field palette={props.palette} label="Proxy endpoint" value={props.tracking.proxyEndpoint} mono />
          <Field palette={props.palette} label="Resolved client IP" value={props.tracking.resolvedClientIp} mono />
          <Field palette={props.palette} label="Forwarded for" value={props.tracking.forwardedFor} mono />
        </div>
      </Panel>
      {events.length > 0 && (
        <Panel palette={props.palette}>
          <h3 style={sectionTitleStyle(props.palette)}>Events</h3>
          <div style={{ display: "grid", gap: "6px", marginTop: "9px" }}>
            {events.map((event, index) => (
              <div key={`${event.name}-${event.createdAt ?? index}`} style={{ display: "flex", gap: "7px", alignItems: "center", color: props.palette.text, fontSize: "12px" }}>
                <span style={pillStyle(props.palette, statusTone(event.status))}>{event.status ?? "unknown"}</span>
                <strong>{event.name}</strong>
                <span style={{ color: props.palette.faint }}>{formatDateTime(event.createdAt)}</span>
                {event.error && <span style={{ color: props.palette.danger }}>{event.error}</span>}
              </div>
            ))}
          </div>
        </Panel>
      )}
      <JsonPanel title="Page origin" value={props.tracking.pageOrigin} palette={props.palette} />
      <JsonPanel title="Tracking details" value={props.tracking.details} palette={props.palette} />
    </div>
  );
}
