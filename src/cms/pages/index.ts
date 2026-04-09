import type { CmsPage, CmsPageComponent } from "../types.js";

export function pageComponents(page: CmsPage): ReadonlyArray<CmsPageComponent> {
  return page.components;
}

export function pageComponentCount(page: CmsPage): number {
  return page.components.length;
}

export function pageHasComponents(page: CmsPage): boolean {
  return page.components.length > 0;
}

export function pageTranslationPath(page: CmsPage, locale: string): string | undefined {
  const translation = page.translations.find((entry) => entry.locale === locale);
  return translation?.path;
}

export function pageCanonicalPath(page: CmsPage): string {
  return page.canonicalPath;
}
