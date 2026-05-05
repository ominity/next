export type OminityDebugSource = "sdk" | "cms" | (string & {});

export interface OminityDebugEntry {
  readonly id: string;
  readonly source: OminityDebugSource;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly ok: boolean;
  readonly status?: number;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly responseHeaders?: Readonly<Record<string, string>>;
  readonly requestBody?: string;
  readonly responseBody?: string;
  readonly error?: string;
}

export interface OminityDebugListResponse {
  readonly enabled: boolean;
  readonly source: OminityDebugSource | "all";
  readonly limit: number;
  readonly total: number;
  readonly now: string;
  readonly entries: ReadonlyArray<OminityDebugEntry>;
}
