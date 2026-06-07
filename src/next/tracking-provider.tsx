"use client";

import { usePathname, useSearchParams } from "next/navigation.js";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";

import {
  buildTrackingPageMetadata,
  ensureVisitorIdCookie,
  type BuildTrackingPageMetadataOptions,
  type VisitorIdCookieOptions,
} from "./tracking.js";
import type {
  TrackEventRequest,
  TrackingEventMetadata,
  TrackingEventUtm,
} from "./tracking-types.js";

const DEFAULT_TRACKING_ENDPOINT = "/api/omt";
const DEFAULT_QUEUE_KEY = "__ominity_tracking_queue_v1";
const DEFAULT_SESSION_KEY = "__ominity_tracking_session_v1";
const DEFAULT_SCROLL_DEPTH_THRESHOLDS = [25, 50, 75, 100];
const DEFAULT_MAX_QUEUE_SIZE = 50;

const DOWNLOAD_FILE_PATTERN =
  /\.(csv|doc|docx|ics|jpg|jpeg|json|mp3|mp4|pdf|png|ppt|pptx|svg|txt|webp|xls|xlsx|zip)(\?.*)?$/i;
const TRACKING_QUERY_PARAM_KEYS = new Set([
  "_ga",
  "_gac",
  "_gcl_au",
  "_gl",
  "_gs",
  "_up",
  "dclid",
  "fbclid",
  "gad_source",
  "gbraid",
  "gclid",
  "igshid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "srsltid",
  "ttclid",
  "twclid",
  "vero_conv",
  "vero_id",
  "wbraid",
]);
const TRACKING_QUERY_PARAM_PREFIXES = ["utm_", "_ga_", "_gac_", "_gcl_", "gad_"];

type QueueEntry = TrackEventRequest;
type QueueOptions = {
  endpoint: string;
  headers?: Readonly<Record<string, string>>;
  queueKey: string;
  maxQueueSize: number;
};
type TrackEventInput = {
  event: string;
  title?: string | undefined;
  url?: string | undefined;
  metadata?: TrackingEventMetadata | undefined;
  referrer?: string | undefined;
  utm?: TrackingEventUtm | undefined;
};

export interface TrackingProviderEventNames {
  readonly pageView?: string;
  readonly sessionStart?: string;
  readonly scrollDepth?: string;
  readonly outboundClick?: string;
  readonly fileDownload?: string;
  readonly formSubmit?: string;
}

export interface TrackingProviderProps {
  readonly children?: ReactNode;
  readonly enabled?: boolean;
  readonly endpoint?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly userId?: number;
  readonly sampleRate?: number;
  readonly visitorCookieOptions?: VisitorIdCookieOptions;
  readonly trackPageViews?: boolean;
  readonly trackSessions?: boolean;
  readonly trackScrollDepth?: boolean;
  readonly scrollDepthThresholds?: ReadonlyArray<number>;
  readonly trackOutboundClicks?: boolean;
  readonly trackFileDownloads?: boolean;
  readonly trackFormSubmissions?: boolean;
  readonly trackCustomClicks?: boolean;
  readonly flushQueueOnMount?: boolean;
  readonly queueKey?: string;
  readonly sessionKey?: string;
  readonly maxQueueSize?: number;
  readonly eventNames?: TrackingProviderEventNames;
  readonly extraMetadata?:
    | TrackingEventMetadata
    | (() => TrackingEventMetadata | null | undefined);
}

export interface TrackingPageMetadataProps extends BuildTrackingPageMetadataOptions {}

interface TrackingPageMetadataRegistry {
  readonly setPageMetadata: (key: symbol, metadata: TrackingEventMetadata | null) => void;
  readonly clearPageMetadata: (key: symbol) => void;
}

const TrackingPageMetadataContext = createContext<TrackingPageMetadataRegistry | null>(null);

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function createDocumentCookieStore() {
  return {
    get(name: string) {
      const entries = document.cookie.split(";").map((entry) => entry.trim());
      for (const entry of entries) {
        if (!entry) {
          continue;
        }

        const separatorIndex = entry.indexOf("=");
        const key = separatorIndex >= 0 ? entry.slice(0, separatorIndex) : entry;
        if (key !== name) {
          continue;
        }

        const rawValue = separatorIndex >= 0 ? entry.slice(separatorIndex + 1) : "";
        return {
          value: decodeURIComponent(rawValue),
        };
      }

      return undefined;
    },
    set(name: string, value: string, options?: {
      path?: string;
      maxAge?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "lax" | "strict" | "none";
    }) {
      const parts = [`${name}=${encodeURIComponent(value)}`];

      parts.push(`Path=${options?.path ?? "/"}`);

      if (typeof options?.maxAge === "number") {
        parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
      }

      if (options?.secure !== false) {
        parts.push("Secure");
      }

      if (options?.sameSite) {
        const sameSite = options.sameSite;
        parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
      }

      document.cookie = parts.join("; ");
    },
  };
}

function normalizeThresholds(
  thresholds: ReadonlyArray<number> | undefined,
): ReadonlyArray<number> {
  const source = thresholds && thresholds.length > 0
    ? thresholds
    : DEFAULT_SCROLL_DEPTH_THRESHOLDS;

  const normalized = Array.from(new Set(
    source
      .map((value) => Math.min(100, Math.max(1, Math.floor(value))))
      .filter((value) => Number.isFinite(value)),
  ));

  normalized.sort((left, right) => left - right);
  return normalized;
}

function shouldStripTrackingQueryParam(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (TRACKING_QUERY_PARAM_KEYS.has(normalized)) {
    return true;
  }

  return TRACKING_QUERY_PARAM_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function stripTrackingQueryParams(params: URLSearchParams): void {
  for (const key of Array.from(new Set(params.keys()))) {
    if (!shouldStripTrackingQueryParam(key)) {
      continue;
    }

    params.delete(key);
  }
}

function readQueue(queueKey: string): QueueEntry[] {
  try {
    const raw = window.localStorage.getItem(queueKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as QueueEntry[] : [];
  } catch {
    return [];
  }
}

function writeQueue(queueKey: string, entries: ReadonlyArray<QueueEntry>): void {
  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(queueKey);
      return;
    }

    window.localStorage.setItem(queueKey, JSON.stringify(entries));
  } catch {
    // Ignore storage write failures.
  }
}

function enqueueEvent(
  queueKey: string,
  maxQueueSize: number,
  payload: QueueEntry,
): void {
  const existing = readQueue(queueKey);
  const nextQueue = [...existing, payload].slice(-Math.max(1, maxQueueSize));
  writeQueue(queueKey, nextQueue);
}

async function sendTrackingRequest(
  payload: TrackEventRequest,
  options: QueueOptions & { preferBeacon?: boolean },
): Promise<boolean> {
  const body = JSON.stringify(payload);

  if (options.preferBeacon && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(options.endpoint, blob)) {
        return true;
      }
    } catch {
      // Fall through to fetch.
    }
  }

  try {
    const response = await fetch(options.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      body,
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function dispatchTrackingEvent(
  payload: TrackEventRequest,
  options: QueueOptions & { preferBeacon?: boolean; queueOnFailure?: boolean },
): Promise<boolean> {
  const success = await sendTrackingRequest(payload, options);
  if (!success && options.queueOnFailure !== false) {
    enqueueEvent(options.queueKey, options.maxQueueSize, payload);
  }

  return success;
}

async function flushTrackingQueue(options: QueueOptions): Promise<void> {
  const queue = readQueue(options.queueKey);
  if (queue.length === 0) {
    return;
  }

  const pending: QueueEntry[] = [];

  for (const payload of queue) {
    const success = await sendTrackingRequest(payload, options);
    if (!success) {
      pending.push(payload);
    }
  }

  writeQueue(options.queueKey, pending);
}

function buildUtmFromLocation(location: Location): TrackingEventUtm | undefined {
  const params = new URLSearchParams(location.search);
  const utm: Record<string, string> = {};

  const knownKeys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
  ];

  for (const key of knownKeys) {
    const value = asNonEmptyString(params.get(key));
    if (value) {
      utm[key] = value;
    }
  }

  return Object.keys(utm).length > 0 ? utm : undefined;
}

function isExternalUrl(candidate: URL): boolean {
  return candidate.origin !== window.location.origin;
}

function isDownloadUrl(element: HTMLAnchorElement, candidate: URL): boolean {
  if (element.hasAttribute("download")) {
    return true;
  }

  return DOWNLOAD_FILE_PATTERN.test(candidate.href);
}

function getElementText(element: Element): string | undefined {
  const ariaLabel = asNonEmptyString(element.getAttribute("aria-label"));
  if (ariaLabel) {
    return ariaLabel;
  }

  return asNonEmptyString(element.textContent);
}

function parseDatasetMetadata(element: HTMLElement): TrackingEventMetadata | undefined {
  const rawMetadata = asNonEmptyString(element.dataset.ominityMetadata);
  if (!rawMetadata) {
    return;
  }

  try {
    const parsed = JSON.parse(rawMetadata);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as TrackingEventMetadata;
    }
  } catch {
    // Ignore invalid JSON.
  }

  return;
}

function buildBaseMetadata(
  pageKey: string,
  previousUrl: string | null,
): TrackingEventMetadata {
  const locale = asNonEmptyString(document.documentElement.lang)
    ?? asNonEmptyString(navigator.language);
  const timezone = asNonEmptyString(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const currentUrl = resolveNormalizedCurrentUrl();
  const baseMetadata: Record<string, unknown> = {
    page_key: pageKey,
    pathname: currentUrl.pathname,
    search: currentUrl.search || undefined,
    hash: window.location.hash || undefined,
    previous_url: previousUrl ?? undefined,
    locale,
    timezone,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    screen_width: window.screen.width,
    screen_height: window.screen.height,
  };

  return baseMetadata;
}

function resolveExtraMetadata(
  input: TrackingProviderProps["extraMetadata"],
): TrackingEventMetadata | null | undefined {
  if (!input) {
    return;
  }

  try {
    return typeof input === "function" ? input() : input;
  } catch {
    return;
  }
}

function resolveRegisteredPageMetadata(
  entries: ReadonlyMap<symbol, TrackingEventMetadata>,
): TrackingEventMetadata | null {
  let current: TrackingEventMetadata | null = null;

  for (const value of entries.values()) {
    current = value;
  }

  return current;
}

export function TrackingPageMetadata(props: TrackingPageMetadataProps) {
  const registry = useContext(TrackingPageMetadataContext);
  const keyRef = useRef<symbol | null>(null);

  if (keyRef.current === null) {
    keyRef.current = Symbol("tracking-page-metadata");
  }

  const metadata = buildTrackingPageMetadata(props) ?? null;

  useLayoutEffect(() => {
    if (!registry || keyRef.current === null) {
      return;
    }

    registry.setPageMetadata(keyRef.current, metadata);

    return () => {
      registry.clearPageMetadata(keyRef.current!);
    };
  }, [metadata, registry]);

  return null;
}

function resolveSearch(searchParams: ReturnType<typeof useSearchParams>): string {
  const value = searchParams?.toString();
  if (!value) {
    return "";
  }

  const params = new URLSearchParams(value);
  stripTrackingQueryParams(params);

  const normalized = params.toString();
  return normalized ? `?${normalized}` : "";
}

function normalizeSampleRate(sampleRate: number | undefined): number {
  if (typeof sampleRate !== "number" || !Number.isFinite(sampleRate)) {
    return 1;
  }

  return Math.min(1, Math.max(0, sampleRate));
}

function readClosestTrackableElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest("[data-ominity-event], a[href], form, button");
}

function resolveCurrentUrl(): string {
  return resolveNormalizedCurrentUrl().toString();
}

function resolveNormalizedCurrentUrl(): URL {
  const url = new URL(window.location.href);
  stripTrackingQueryParams(url.searchParams);

  return url;
}

function normalizeUrlValue(value: string | null | undefined): string | undefined {
  const normalizedValue = asNonEmptyString(value);
  if (!normalizedValue) {
    return;
  }

  try {
    const url = new URL(normalizedValue, window.location.href);
    stripTrackingQueryParams(url.searchParams);
    return url.toString();
  } catch {
    return normalizedValue;
  }
}

export function TrackingProvider(props: TrackingProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const visitorIdRef = useRef<string | null>(null);
  const lastPageKeyRef = useRef<string | null>(null);
  const lastTrackedUrlRef = useRef<string | null>(null);
  const sampledInRef = useRef<boolean | null>(null);
  const trackedScrollDepthsRef = useRef<Set<number>>(new Set());
  const pageMetadataEntriesRef = useRef<Map<symbol, TrackingEventMetadata>>(new Map());
  const pageMetadataRegistryRef = useRef<TrackingPageMetadataRegistry>({
    setPageMetadata(key, metadata) {
      if (metadata && Object.keys(metadata).length > 0) {
        pageMetadataEntriesRef.current.delete(key);
        pageMetadataEntriesRef.current.set(key, metadata);
        return;
      }

      pageMetadataEntriesRef.current.delete(key);
    },
    clearPageMetadata(key) {
      pageMetadataEntriesRef.current.delete(key);
    },
  });

  const enabled = props.enabled !== false;
  const pageKey = `${pathname ?? ""}${resolveSearch(searchParams)}`;
  const endpoint = asNonEmptyString(props.endpoint) ?? DEFAULT_TRACKING_ENDPOINT;
  const queueKey = asNonEmptyString(props.queueKey) ?? DEFAULT_QUEUE_KEY;
  const sessionKey = asNonEmptyString(props.sessionKey) ?? DEFAULT_SESSION_KEY;
  const maxQueueSize = typeof props.maxQueueSize === "number" && Number.isFinite(props.maxQueueSize)
    ? Math.max(1, Math.floor(props.maxQueueSize))
    : DEFAULT_MAX_QUEUE_SIZE;
  const scrollDepthThresholds = normalizeThresholds(props.scrollDepthThresholds);
  const queueOptions: QueueOptions = {
    endpoint,
    ...(props.headers ? { headers: props.headers } : {}),
    queueKey,
    maxQueueSize,
  };

  function ensureSampledIn(): boolean {
    if (sampledInRef.current !== null) {
      return sampledInRef.current;
    }

    sampledInRef.current = Math.random() <= normalizeSampleRate(props.sampleRate);
    return sampledInRef.current;
  }

  function ensureVisitorId(): string {
    if (visitorIdRef.current) {
      return visitorIdRef.current;
    }

    const cookieStore = createDocumentCookieStore();
    visitorIdRef.current = ensureVisitorIdCookie(cookieStore, props.visitorCookieOptions);
    return visitorIdRef.current;
  }

  async function track(
    payload: TrackEventInput,
    options?: { preferBeacon?: boolean; queueOnFailure?: boolean },
  ): Promise<boolean> {
    if (!enabled || !ensureSampledIn()) {
      return false;
    }

    const visitorId = ensureVisitorId();
    const extraMetadata = resolveExtraMetadata(props.extraMetadata);
    const pageMetadata = resolveRegisteredPageMetadata(pageMetadataEntriesRef.current);
    const metadata = {
      ...buildBaseMetadata(pageKey, lastTrackedUrlRef.current),
      ...(extraMetadata ?? {}),
      ...(pageMetadata ?? {}),
      ...asRecord(payload.metadata),
    };
    const referrer = normalizeUrlValue(payload.referrer ?? document.referrer ?? undefined);
    const utm = payload.utm ?? buildUtmFromLocation(window.location);

    const trackEventRequest: TrackEventRequest = {
      event: payload.event,
      visitorId,
      timestamp: new Date().toISOString(),
      metadata,
      ...(typeof props.userId === "number" ? { userId: props.userId } : {}),
      ...(payload.url ? { url: normalizeUrlValue(payload.url) ?? payload.url } : { url: resolveCurrentUrl() }),
      ...(payload.title ? { title: payload.title } : { title: document.title }),
      ...(referrer ? { referrer } : {}),
      ...(utm ? { utm } : {}),
    };

    return dispatchTrackingEvent(trackEventRequest, {
      ...queueOptions,
      ...(options?.preferBeacon ? { preferBeacon: true } : {}),
      ...(options?.queueOnFailure === false ? { queueOnFailure: false } : {}),
    });
  }

  useEffect(() => {
    if (!enabled || !ensureSampledIn()) {
      return;
    }

    ensureVisitorId();

    if (props.flushQueueOnMount !== false) {
      void flushTrackingQueue(queueOptions);
    }

    const handleOnline = () => {
      void flushTrackingQueue(queueOptions);
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [enabled, maxQueueSize, props.flushQueueOnMount, props.headers, props.sampleRate, props.visitorCookieOptions, queueKey, endpoint]);

  useEffect(() => {
    if (!enabled || props.trackSessions === false || !ensureSampledIn()) {
      return;
    }

    try {
      if (window.sessionStorage.getItem(sessionKey) === "1") {
        return;
      }

      window.sessionStorage.setItem(sessionKey, "1");
    } catch {
      // Ignore session storage failures and still attempt to track.
    }

    void track({
      event: props.eventNames?.sessionStart ?? "session_start",
      title: document.title,
      metadata: {
        session_key: sessionKey,
      },
    });
  }, [enabled, pageKey, props.eventNames?.sessionStart, props.sampleRate, props.trackSessions, sessionKey]);

  useEffect(() => {
    if (!enabled || props.trackPageViews === false || !ensureSampledIn()) {
      return;
    }

    if (lastPageKeyRef.current === pageKey) {
      return;
    }

    const previousUrl = lastTrackedUrlRef.current;
    trackedScrollDepthsRef.current.clear();
    lastPageKeyRef.current = pageKey;

    void track({
      event: props.eventNames?.pageView ?? "page_view",
      title: document.title,
      metadata: {
        previous_url: normalizeUrlValue(previousUrl ?? document.referrer ?? undefined),
      },
    });

    lastTrackedUrlRef.current = resolveCurrentUrl();
  }, [enabled, pageKey, props.eventNames?.pageView, props.sampleRate, props.trackPageViews]);

  useEffect(() => {
    if (!enabled || props.trackScrollDepth === false || !ensureSampledIn()) {
      return;
    }

    const handleScroll = () => {
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      const currentPercent = documentHeight <= 0
        ? 100
        : Math.min(100, Math.max(0, Math.round((window.scrollY / documentHeight) * 100)));

      for (const threshold of scrollDepthThresholds) {
        if (currentPercent < threshold || trackedScrollDepthsRef.current.has(threshold)) {
          continue;
        }

        trackedScrollDepthsRef.current.add(threshold);
        void track({
          event: props.eventNames?.scrollDepth ?? "scroll_depth",
          metadata: {
            depth_percent: threshold,
          },
        });
      }
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [enabled, pageKey, props.eventNames?.scrollDepth, props.sampleRate, props.trackScrollDepth, scrollDepthThresholds]);

  useEffect(() => {
    if (!enabled || !ensureSampledIn()) {
      return;
    }

    if (
      props.trackCustomClicks === false
      && props.trackOutboundClicks === false
      && props.trackFileDownloads === false
    ) {
      return;
    }

    const handleClick = (event: Event) => {
      const element = readClosestTrackableElement(event.target);
      if (!element) {
        return;
      }

      const customTarget = element.closest("[data-ominity-event]");
      if (customTarget instanceof HTMLElement && props.trackCustomClicks !== false) {
        const eventName = asNonEmptyString(customTarget.dataset.ominityEvent);
        if (eventName) {
          void track({
            event: eventName,
            title: asNonEmptyString(customTarget.dataset.ominityTitle) ?? getElementText(customTarget),
            metadata: {
              element_id: customTarget.id || undefined,
              element_name: customTarget.getAttribute("name") || undefined,
              element_text: getElementText(customTarget),
              ...asRecord(parseDatasetMetadata(customTarget)),
            },
          });
          return;
        }
      }

      const anchor = element.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      let candidate: URL;
      try {
        candidate = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (props.trackFileDownloads !== false && isDownloadUrl(anchor, candidate)) {
        void track({
          event: props.eventNames?.fileDownload ?? "file_download",
          title: getElementText(anchor),
          url: candidate.toString(),
          metadata: {
            href: candidate.toString(),
            target: anchor.target || undefined,
          },
        }, { preferBeacon: true });
        return;
      }

      if (props.trackOutboundClicks !== false && isExternalUrl(candidate)) {
        void track({
          event: props.eventNames?.outboundClick ?? "outbound_click",
          title: getElementText(anchor),
          url: candidate.toString(),
          metadata: {
            href: candidate.toString(),
            target: anchor.target || undefined,
          },
        }, { preferBeacon: true });
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [
    enabled,
    props.eventNames?.fileDownload,
    props.eventNames?.outboundClick,
    props.sampleRate,
    props.trackCustomClicks,
    props.trackFileDownloads,
    props.trackOutboundClicks,
  ]);

  useEffect(() => {
    if (!enabled || props.trackFormSubmissions === false || !ensureSampledIn()) {
      return;
    }

    const handleSubmit = (event: Event) => {
      const form = event.target instanceof HTMLFormElement
        ? event.target
        : null;
      if (!form) {
        return;
      }

      void track({
        event: props.eventNames?.formSubmit ?? "form_submit",
        title:
          asNonEmptyString(form.getAttribute("name"))
          ?? asNonEmptyString(form.id)
          ?? document.title,
        metadata: {
          form_id: form.id || undefined,
          form_name: form.getAttribute("name") || undefined,
          form_action: form.action || window.location.href,
          form_method: (form.method || "get").toUpperCase(),
        },
      }, { preferBeacon: true });
    };

    document.addEventListener("submit", handleSubmit, true);
    return () => {
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, [enabled, props.eventNames?.formSubmit, props.sampleRate, props.trackFormSubmissions]);

  return (
    <TrackingPageMetadataContext.Provider value={pageMetadataRegistryRef.current}>
      {props.children}
    </TrackingPageMetadataContext.Provider>
  );
}
