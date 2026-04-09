import type { CmsPageComponent } from "../cms/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCmsPageComponent(value: unknown): value is CmsPageComponent {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string"
    && typeof value.key === "string"
    && typeof value.type === "string"
    && isRecord(value.fields)
    && Array.isArray(value.children);
}

export function isPrimitiveRenderable(value: unknown): value is string | number | boolean {
  const valueType = typeof value;
  return valueType === "string" || valueType === "number" || valueType === "boolean";
}

export function flattenRenderResult(value: unknown): ReadonlyArray<unknown> {
  if (typeof value === "undefined" || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return [value];
  }

  const flattened: unknown[] = [];
  for (const item of value) {
    flattened.push(...flattenRenderResult(item));
  }

  return flattened;
}

export function collectNestedComponents(value: unknown): ReadonlyArray<CmsPageComponent> {
  const collected: CmsPageComponent[] = [];

  const visit = (candidate: unknown): void => {
    if (isCmsPageComponent(candidate)) {
      collected.push(candidate);
      return;
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item);
      }
      return;
    }

    if (typeof candidate !== "object" || candidate === null) {
      return;
    }

    for (const entry of Object.values(candidate)) {
      visit(entry);
    }
  };

  visit(value);
  return collected;
}

