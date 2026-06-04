export type TrackingEventName =
  | "page_view"
  | "session_start"
  | "scroll_depth"
  | "outbound_click"
  | "file_download"
  | "form_submit"
  | string;

export type TrackingEventMetadata = Readonly<Record<string, unknown>>;
export type TrackingEventUtm = Readonly<Record<string, string>>;
export type TrackingRouteParameters = Readonly<Record<string, string | number>>;

export interface TrackingResourceRoute {
  readonly resource?: string;
  readonly name: string;
  readonly locale?: string;
  readonly parameters?: TrackingRouteParameters;
}

export interface TrackingResourceRelation {
  readonly resource: string;
  readonly id?: string | number;
  readonly locale?: string;
  readonly slug?: string;
  readonly sku?: string;
  readonly title?: string;
  readonly type?: string;
  readonly path?: string;
  readonly canonicalPath?: string;
  readonly url?: string;
  readonly route?: TrackingResourceRoute;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TrackEventRequest {
  readonly event: TrackingEventName;
  readonly timestamp?: string | Date;
  readonly title?: string;
  readonly url?: string;
  readonly metadata?: TrackingEventMetadata;
  readonly visitorId?: string;
  readonly userId?: number;
  readonly referrer?: string;
  readonly utm?: TrackingEventUtm;
}
