import {
  type FormTheme,
  type PassthroughClasses,
  type SlotClassValue,
  type ThemeSlot,
} from "../types.js";

const flattenValue = (value: SlotClassValue): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenValue(entry));
  }

  if (typeof value === "string") {
    return value.split(" ").filter(Boolean);
  }

  return [];
};

export const mergeClasses = (...values: SlotClassValue[]): string =>
  values.flatMap((value) => flattenValue(value)).join(" ").trim();

export const mergeThemes = (
  baseTheme: FormTheme,
  override?: Partial<FormTheme>,
): FormTheme => {
  if (!override) {
    return baseTheme;
  }

  const result: Record<string, string> = { ...baseTheme };
  Object.keys(override).forEach((slot) => {
    const key = slot as ThemeSlot;
    const overrideValue = override[key];
    if (typeof overrideValue === "string") {
      result[key] = overrideValue;
    }
  });

  return result as FormTheme;
};

interface SlotResolutionParams {
  slot: ThemeSlot;
  theme: FormTheme;
  pt?: PassthroughClasses | undefined;
  fieldCss?: string | null | undefined;
}

export const resolveSlotClasses = ({
  slot,
  theme,
  pt,
  fieldCss,
}: SlotResolutionParams): string =>
  mergeClasses(
    theme[slot],
    pt?.[slot],
    slot.startsWith("field.") ? fieldCss : undefined,
  );
