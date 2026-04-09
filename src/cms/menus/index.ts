import type { CmsMenu, CmsMenuItem } from "../types.js";

export function menuItemPath(item: CmsMenuItem): string {
  return item.path;
}

export function flattenMenu(menu: CmsMenu): ReadonlyArray<CmsMenuItem> {
  const result: CmsMenuItem[] = [];

  const visit = (item: CmsMenuItem): void => {
    result.push(item);
    for (const child of item.children) {
      visit(child);
    }
  };

  for (const item of menu.items) {
    visit(item);
  }

  return result;
}

export function findMenuItem(menu: CmsMenu, predicate: (item: CmsMenuItem) => boolean): CmsMenuItem | undefined {
  return flattenMenu(menu).find(predicate);
}
