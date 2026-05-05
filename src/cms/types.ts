import type { OminityOptions } from "@ominity/api-typescript";

export type CmsPrimitive = string | number | boolean | null;

export type CmsFieldObject = {
  readonly [key: string]: CmsFieldValue;
};

export type CmsFieldArray = ReadonlyArray<CmsFieldValue>;

export type CmsFieldValue = CmsPrimitive | CmsFieldObject | CmsFieldArray | CmsPageComponent;

export interface CmsPageComponent {
  readonly id: string;
  readonly key: string;
  readonly type: string;
  readonly fields: Readonly<Record<string, CmsFieldValue>>;
  readonly children: ReadonlyArray<CmsPageComponent>;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface CmsPageTranslation {
  readonly locale: string;
  readonly path: string;
  readonly slug: string;
  readonly canonical?: boolean;
}

export interface CmsSeoRobots {
  readonly index?: boolean;
  readonly follow?: boolean;
  readonly noarchive?: boolean;
  readonly nosnippet?: boolean;
  readonly noimageindex?: boolean;
}

export interface CmsSeoOpenGraphImage {
  readonly url: string;
  readonly alt?: string;
}

export interface CmsSeo {
  readonly title?: string;
  readonly description?: string;
  readonly canonicalUrl?: string;
  readonly robots?: CmsSeoRobots;
  readonly openGraph?: {
    readonly title?: string;
    readonly description?: string;
    readonly type?: string;
    readonly images?: ReadonlyArray<CmsSeoOpenGraphImage>;
  };
}

export interface CmsPage {
  readonly id: string;
  readonly locale: string;
  readonly path: string;
  readonly slug: string;
  readonly canonicalPath: string;
  readonly title?: string;
  readonly description?: string;
  readonly status: "published" | "draft" | "unknown";
  readonly components: ReadonlyArray<CmsPageComponent>;
  readonly translations: ReadonlyArray<CmsPageTranslation>;
  readonly seo?: CmsSeo;
}

export interface CmsMenuItem {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly locale?: string;
  readonly target?: string;
  readonly children: ReadonlyArray<CmsMenuItem>;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface CmsMenu {
  readonly id: string;
  readonly key: string;
  readonly locale: string;
  readonly items: ReadonlyArray<CmsMenuItem>;
}

export interface CmsRoute {
  readonly id: string;
  readonly pageId: string;
  readonly locale: string;
  readonly path: string;
  readonly slug: string;
  readonly canonicalPath: string;
  readonly translations: Readonly<Record<string, string>>;
  readonly redirectsToCanonical?: boolean;
}

export interface CmsLocale {
  readonly code: string;
  readonly language: string;
  readonly country?: string;
  readonly label?: string;
  readonly default?: boolean;
}

export interface CmsChannelLanguage {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly direction?: string;
  readonly localeCode?: string;
  readonly localeTerritory?: string;
  readonly active?: boolean;
  readonly default?: boolean;
}

export interface CmsChannelCountry {
  readonly code: string;
  readonly name: string;
  readonly language?: string;
  readonly enabled?: boolean;
  readonly default?: boolean;
}

export interface CmsChannel {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly defaultLanguageCode?: string;
  readonly defaultCountryCode?: string;
  readonly languages: ReadonlyArray<CmsChannelLanguage>;
  readonly countries: ReadonlyArray<CmsChannelCountry>;
}

export interface CmsRenderContext {
  readonly page: CmsPage;
  readonly locale: string;
  readonly path: string;
  readonly preview: boolean;
  readonly requestId?: string;
  readonly debug: boolean;
}

export interface CmsMetadataInput {
  readonly page: CmsPage;
  readonly locale?: string;
  readonly baseUrl?: string | URL;
  readonly includeAlternates?: boolean;
  readonly includeCanonical?: boolean;
  readonly fallbackRobots?: CmsSeoRobots;
  readonly localeToHrefLang?: (locale: string) => string;
}

export interface CmsClientRequestContext {
  readonly locale?: string;
  readonly preview?: boolean;
  readonly channelId?: string;
  readonly requestId?: string;
}

export interface CmsClientQueryParams {
  readonly path?: string;
  readonly locale?: string;
  readonly preview?: boolean;
  readonly key?: string;
  readonly include?: string;
}

export interface CmsClientEndpoints {
  readonly pageByPath: string;
  readonly routes: string;
  readonly menus: string;
  readonly locales: string;
  readonly channelCurrent: string;
}

export interface CmsClientQueryParamNames {
  readonly path: string;
  readonly locale: string;
  readonly preview: string;
  readonly menuKey: string;
  readonly include: string;
}

export interface CmsClientDebugOptions {
  readonly enabled?: boolean;
  readonly logger?: CmsClientLogger;
  readonly namespace?: string;
}

export type CmsClientLogLevel = "debug" | "info" | "warn" | "error";

export interface CmsClientLogEvent {
  readonly scope: string;
  readonly message: string;
  readonly level: CmsClientLogLevel;
  readonly payload?: unknown;
}

export interface CmsClientLogger {
  log(event: CmsClientLogEvent): void;
}

export interface CmsResponseNormalizers {
  readonly page: (input: unknown) => CmsPage;
  readonly routes: (input: unknown) => ReadonlyArray<CmsRoute>;
  readonly menus: (input: unknown) => ReadonlyArray<CmsMenu>;
  readonly locales: (input: unknown) => ReadonlyArray<CmsLocale>;
  readonly channel: (input: unknown) => CmsChannel;
}

export interface CmsClientOptions {
  readonly sdk: OminityOptions;
  readonly endpoints?: Partial<CmsClientEndpoints>;
  readonly queryParamNames?: Partial<CmsClientQueryParamNames>;
  readonly normalizers?: Partial<CmsResponseNormalizers>;
  readonly debug?: CmsClientDebugOptions;
}

export interface CmsGetPageByPathInput extends CmsClientRequestContext {
  readonly path: string;
  readonly include?: string;
}

export interface CmsGetRoutesInput extends CmsClientRequestContext {
  readonly include?: string;
}

export interface CmsGetMenusInput extends CmsClientRequestContext {
  readonly key?: string;
  readonly include?: string;
}

export interface CmsGetLocalesInput extends CmsClientRequestContext {
  readonly include?: string;
}

export interface CmsGetChannelInput extends CmsClientRequestContext {
  readonly include?: string;
}

export interface CmsClient {
  readonly sdkLanguage?: string;
  readonly sdkChannelId?: string;
  getPageByPath(input: CmsGetPageByPathInput): Promise<CmsPage | null>;
  getRoutes(input?: CmsGetRoutesInput): Promise<ReadonlyArray<CmsRoute>>;
  getMenus(input?: CmsGetMenusInput): Promise<ReadonlyArray<CmsMenu>>;
  getLocales(input?: CmsGetLocalesInput): Promise<ReadonlyArray<CmsLocale>>;
  getChannel(input?: CmsGetChannelInput): Promise<CmsChannel | null>;
}
