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
