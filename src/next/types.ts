export interface NextMetadataRobots {
  readonly index?: boolean;
  readonly follow?: boolean;
  readonly noarchive?: boolean;
  readonly nosnippet?: boolean;
  readonly noimageindex?: boolean;
}

export interface NextMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly alternates?: {
    readonly canonical?: string;
    readonly languages?: Readonly<Record<string, string>>;
  };
  readonly robots?: NextMetadataRobots;
  readonly openGraph?: {
    readonly title?: string;
    readonly description?: string;
    readonly type?: string;
    readonly url?: string;
    readonly locale?: string;
    readonly images?: ReadonlyArray<{
      readonly url: string;
      readonly alt?: string;
    }>;
  };
}

export interface NextSitemapEntry {
  readonly url: string;
  readonly lastModified?: Date | string;
  readonly changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  readonly priority?: number;
  readonly alternates?: {
    readonly languages?: Readonly<Record<string, string>>;
  };
}

