export type OminityDebugSource = "sdk" | "cms" | "auth" | "commerce" | "forms" | (string & {});

export type OminityDebugRequestKind = "page" | "route" | "action" | "async" | "unknown";

export interface OminityDebugRequestContext {
  readonly id: string;
  readonly pageId?: string;
  readonly parentId?: string;
  readonly kind?: OminityDebugRequestKind;
  readonly label?: string;
  readonly method?: string;
  readonly url?: string;
  readonly path?: string;
  readonly route?: string;
  readonly startedAt?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugEntry {
  readonly id: string;
  readonly source: OminityDebugSource;
  readonly request?: OminityDebugRequestContext;
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

export interface OminityDebugRequestGroup {
  readonly id: string;
  readonly pageId?: string;
  readonly parentId?: string;
  readonly kind: OminityDebugRequestKind;
  readonly label: string;
  readonly method?: string;
  readonly url?: string;
  readonly path?: string;
  readonly route?: string;
  readonly startedAt: string;
  readonly lastActivityAt: string;
  readonly durationMs: number;
  readonly entryCount: number;
  readonly errorCount: number;
  readonly sources: ReadonlyArray<OminityDebugSource>;
  readonly status?: number;
  readonly ok: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugListResponse {
  readonly enabled: boolean;
  readonly source: OminityDebugSource | "all";
  readonly limit: number;
  readonly total: number;
  readonly now: string;
  readonly requestGroups: ReadonlyArray<OminityDebugRequestGroup>;
  readonly entries: ReadonlyArray<OminityDebugEntry>;
}

export type OminityDebugTheme = "light" | "dark" | "system";

export type OminityDebugStatus = "enabled" | "disabled" | "unknown";

export interface OminityDebugFlag {
  readonly label: string;
  readonly value: string | number | boolean | null | undefined;
  readonly status?: OminityDebugStatus;
}

export interface OminityDebugIntegrationInfo {
  readonly appName?: string;
  readonly environment?: string;
  readonly packageName?: string;
  readonly packageVersion?: string;
  readonly nextVersion?: string;
  readonly sdkVersion?: string;
  readonly apiUrl?: string;
  readonly basePath?: string;
  readonly route?: string;
  readonly locale?: string;
  readonly runtime?: string;
  readonly mockData?: boolean;
  readonly debugLogs?: boolean;
  readonly debugBar?: boolean;
  readonly flags?: ReadonlyArray<OminityDebugFlag>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type OminityDebugHealthSeverity = "info" | "warning" | "error";

export interface OminityDebugHealthCheck {
  readonly label: string;
  readonly status: OminityDebugStatus;
  readonly severity?: OminityDebugHealthSeverity;
  readonly message?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugConfigHealthInfo {
  readonly mode?: "mock" | "live" | "hybrid" | "unknown";
  readonly environment?: string;
  readonly apiUrl?: string;
  readonly channelId?: string;
  readonly localeSegmentStrategy?: string;
  readonly basePath?: string;
  readonly trailingSlash?: boolean;
  readonly canonicalRedirectPolicy?: string;
  readonly draftMode?: boolean;
  readonly previewMode?: boolean;
  readonly unsafeWarnings?: ReadonlyArray<string>;
  readonly missingEnvironment?: ReadonlyArray<string>;
  readonly checks?: ReadonlyArray<OminityDebugHealthCheck>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugComponentRenderInfo {
  readonly key: string;
  readonly id?: string | number;
  readonly type?: string;
  readonly status: "registered" | "missing" | "skipped" | "errored";
  readonly durationMs?: number;
  readonly error?: string;
  readonly children?: ReadonlyArray<OminityDebugComponentRenderInfo>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugPermissionCheck {
  readonly permission: string;
  readonly result: boolean;
  readonly source?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugRenderingInfo {
  readonly nextRoute?: string;
  readonly incomingPath?: string;
  readonly resolvedCmsPath?: string;
  readonly canonicalPath?: string;
  readonly shouldRedirect?: boolean;
  readonly redirectTarget?: string;
  readonly localeResolution?: ReadonlyArray<OminityDebugFlag>;
  readonly cmsPage?: {
    readonly id?: string | number;
    readonly title?: string;
    readonly slug?: string;
    readonly locale?: string;
    readonly status?: string;
    readonly translationCount?: number;
    readonly translations?: Readonly<Record<string, string>>;
  };
  readonly components?: ReadonlyArray<OminityDebugComponentRenderInfo>;
  readonly permissionChecks?: ReadonlyArray<OminityDebugPermissionCheck>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugCacheEntry {
  readonly key: string;
  readonly resource?: string;
  readonly status?: "hit" | "miss" | "stale" | "revalidated" | "bypass" | "unknown";
  readonly scope?: "memory" | "next" | "browser" | "sdk" | "custom";
  readonly revalidateSeconds?: number | false;
  readonly ageMs?: number;
  readonly lastFetchedAt?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugCacheActions {
  readonly clear?: () => void | Promise<void>;
  readonly revalidate?: (entryKey?: string) => void | Promise<void>;
}

export interface OminityDebugCacheInfo {
  readonly enabled?: boolean;
  readonly draftMode?: boolean;
  readonly routeRevalidateSeconds?: number | false;
  readonly hits?: number;
  readonly misses?: number;
  readonly entries?: ReadonlyArray<OminityDebugCacheEntry>;
  readonly actions?: OminityDebugCacheActions;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugLocaleInfo {
  readonly code: string;
  readonly language?: string;
  readonly country?: string;
  readonly label?: string;
  readonly default?: boolean;
  readonly active?: boolean;
}

export interface OminityDebugChannelInfo {
  readonly id?: string | number;
  readonly identifier?: string;
  readonly name?: string;
  readonly source?: "detected" | "configured" | "mock" | "unknown";
  readonly active?: boolean;
  readonly defaultLocale?: string;
  readonly defaultLanguageCode?: string;
  readonly defaultCountryCode?: string;
  readonly defaultCurrencyCode?: string;
  readonly locales?: ReadonlyArray<OminityDebugLocaleInfo>;
  readonly languages?: ReadonlyArray<string | OminityDebugLocaleInfo>;
  readonly countries?: ReadonlyArray<string | {
    readonly code: string;
    readonly name?: string;
    readonly currency?: string;
    readonly default?: boolean;
    readonly active?: boolean;
  }>;
  readonly currencies?: ReadonlyArray<string | {
    readonly code: string;
    readonly name?: string;
    readonly symbol?: string;
    readonly default?: boolean;
    readonly active?: boolean;
  }>;
  readonly countryCurrencyMap?: Readonly<Record<string, string>>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugAuthUser {
  readonly id?: string | number;
  readonly userId?: string | number;
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly name?: string;
  readonly roles?: ReadonlyArray<string>;
  readonly permissions?: ReadonlyArray<string>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugAuthSession {
  readonly userId?: string | number;
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly expiresAt?: string;
  readonly isMfaEnabled?: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugMfaMethod {
  readonly method: string;
  readonly isEnabled?: boolean;
  readonly verifiedAt?: string | null;
  readonly lastUsedAt?: string | null;
  readonly lastSentAt?: string | null;
}

export interface OminityDebugLoginActivity {
  readonly id?: string | number;
  readonly ipAddress?: string;
  readonly location?: string | null;
  readonly device?: string | null;
  readonly browser?: string | null;
  readonly userAgent?: string;
  readonly createdAt?: string;
}

export interface OminityDebugSignInInput {
  readonly email: string;
  readonly password: string;
}

export interface OminityDebugSpoofUserInput {
  readonly userId?: string;
  readonly email?: string;
  readonly customerId?: string;
}

export interface OminityDebugAuthActions {
  readonly refresh?: () => void | Promise<void>;
  readonly signOut?: () => void | Promise<void>;
  readonly signIn?: (input: OminityDebugSignInInput) => void | Promise<void>;
  readonly spoofUser?: (input: OminityDebugSpoofUserInput) => void | Promise<void>;
}

export interface OminityDebugAuthInfo {
  readonly enabled?: boolean;
  readonly ready?: boolean;
  readonly authenticated?: boolean;
  readonly user?: OminityDebugAuthUser | null;
  readonly session?: OminityDebugAuthSession | null;
  readonly mfaVerified?: boolean;
  readonly mfaMethods?: ReadonlyArray<OminityDebugMfaMethod>;
  readonly loginActivity?: ReadonlyArray<OminityDebugLoginActivity>;
  readonly savedAddressCount?: number;
  readonly actions?: OminityDebugAuthActions;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugCommerceInfo {
  readonly enabled?: boolean;
  readonly visitorId?: string;
  readonly cartId?: string | number | null;
  readonly currency?: string;
  readonly country?: string;
  readonly cartItemCount?: number;
  readonly subtotal?: string | number;
  readonly shipping?: string | number;
  readonly discount?: string | number;
  readonly tax?: string | number;
  readonly total?: string | number;
  readonly promotionCodes?: ReadonlyArray<string>;
  readonly shippingMethods?: ReadonlyArray<{ readonly id?: string | number; readonly name?: string; readonly price?: string | number; readonly selected?: boolean }>;
  readonly paymentMethods?: ReadonlyArray<{ readonly id?: string | number; readonly name?: string; readonly selected?: boolean }>;
  readonly products?: ReadonlyArray<{ readonly id?: string | number; readonly sku?: string; readonly slug?: string; readonly name?: string }>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugFormInfo {
  readonly id?: string | number;
  readonly key?: string;
  readonly name?: string;
  readonly endpoint?: string;
  readonly recaptchaMode?: "none" | "v2-checkbox" | "v3-score" | "enterprise" | "unknown";
  readonly recaptchaConfigured?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly validationErrors?: ReadonlyArray<string>;
  readonly submissionErrors?: ReadonlyArray<string>;
  readonly uploadCount?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugFormsInfo {
  readonly enabled?: boolean;
  readonly forms?: ReadonlyArray<OminityDebugFormInfo>;
  readonly lastSubmissionAt?: string;
  readonly submissionEndpoint?: string;
  readonly uploadPresignEndpoint?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugTrackingEvent {
  readonly name: string;
  readonly status?: "queued" | "sent" | "failed" | "dropped";
  readonly createdAt?: string;
  readonly error?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugTrackingInfo {
  readonly enabled?: boolean;
  readonly visitorId?: string;
  readonly sessionId?: string;
  readonly proxyEndpoint?: string;
  readonly pageOrigin?: Readonly<Record<string, unknown>>;
  readonly resolvedClientIp?: string;
  readonly forwardedFor?: string;
  readonly queuedCount?: number;
  readonly sentCount?: number;
  readonly failedCount?: number;
  readonly events?: ReadonlyArray<OminityDebugTrackingEvent>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugUtilitiesActions {
  readonly pauseRecording?: () => void | Promise<void>;
  readonly resumeRecording?: () => void | Promise<void>;
  readonly clearCaches?: () => void | Promise<void>;
}

export interface OminityDebugUtilitiesInfo {
  readonly preserveLogsAcrossNavigation?: boolean;
  readonly recordingPaused?: boolean;
  readonly bodyPreviewLimit?: number;
  readonly redactHeaders?: ReadonlyArray<string>;
  readonly actions?: OminityDebugUtilitiesActions;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugSnapshot {
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

export type OminityDebugCapability = keyof OminityDebugSnapshot;

export interface OminityDebugCustomerMembership {
  readonly customerId?: string | number;
  readonly userId?: string | number;
  readonly roleId?: string | number;
  readonly roleKey?: string;
  readonly roleName?: string;
  readonly name?: string;
  readonly email?: string;
  readonly permissions?: ReadonlyArray<string>;
  readonly customer?: {
    readonly id?: string | number;
    readonly identifier?: string;
    readonly name?: string;
  };
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OminityDebugCustomerActions {
  readonly refresh?: () => void | Promise<void>;
  readonly switchCustomer?: (customerId: string | number) => void | Promise<void>;
}

export interface OminityDebugCustomerInfo {
  readonly enabled?: boolean;
  readonly ready?: boolean;
  readonly loading?: boolean;
  readonly activeCustomerId?: string | number | null;
  readonly activeMembership?: OminityDebugCustomerMembership | null;
  readonly memberships?: ReadonlyArray<OminityDebugCustomerMembership>;
  readonly memberCount?: number;
  readonly invitationCount?: number;
  readonly roles?: ReadonlyArray<{ readonly id?: string | number; readonly key?: string; readonly name?: string }>;
  readonly permissionCatalog?: ReadonlyArray<string> | Readonly<Record<string, unknown>>;
  readonly pendingMutations?: ReadonlyArray<string>;
  readonly actions?: OminityDebugCustomerActions;
  readonly details?: Readonly<Record<string, unknown>>;
}
