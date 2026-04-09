import { FormsNormalizationError } from "./errors.js";
import type {
  FieldCss,
  FieldOption,
  FieldValidation,
  FormFieldType,
  OminityForm,
  OminityFormField,
} from "./types.js";

const FORM_FIELD_TYPES: ReadonlySet<FormFieldType> = new Set([
  "text",
  "email",
  "phone",
  "textarea",
  "select",
  "checkbox",
  "multicheckbox",
  "hidden",
  "metadata",
  "honeypot",
  "button",
]);

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function asString(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  return input;
}

function asNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === "string" && input.trim().length > 0) {
    const numeric = Number(input);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return null;
}

function asBoolean(input: unknown): boolean | null {
  if (typeof input === "boolean") {
    return input;
  }

  if (typeof input === "number") {
    return input !== 0;
  }

  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function asArray(input: unknown): ReadonlyArray<unknown> {
  return Array.isArray(input) ? input : [];
}

function unwrapSingle(input: unknown, keys: ReadonlyArray<string>): unknown {
  if (!isRecord(input)) {
    return input;
  }

  for (const key of keys) {
    if (key in input) {
      return input[key];
    }
  }

  return input;
}

function unwrapList(input: unknown, keys: ReadonlyArray<string>): ReadonlyArray<unknown> {
  const value = unwrapSingle(input, keys);
  return asArray(value);
}

function normalizeFieldCss(input: unknown): FieldCss {
  if (!isRecord(input)) {
    return {
      classes: null,
      id: null,
      style: null,
    };
  }

  return {
    classes: asString(input.classes),
    id: asString(input.id),
    style: asString(input.style),
  };
}

function normalizeFieldValidation(input: unknown): FieldValidation {
  if (!isRecord(input)) {
    return {
      isRequired: false,
      minLength: null,
      maxLength: null,
      rules: [],
      message: "",
    };
  }

  const rules = asArray(input.rules)
    .flatMap((rule) => {
      if (!isRecord(rule)) {
        return [];
      }

      const normalizedRule = asString(rule.rule);
      if (!normalizedRule) {
        return [];
      }

      const message = asString(rule.message);

      return [{
        rule: normalizedRule,
        ...(typeof message === "string" ? { message } : {}),
      }];
    });

  return {
    isRequired: asBoolean(input.isRequired) ?? false,
    minLength: asNumber(input.minLength),
    maxLength: asNumber(input.maxLength),
    rules,
    message: asString(input.message) ?? "",
  };
}

function normalizeFieldOption(input: unknown): FieldOption | null {
  if (typeof input === "string") {
    return {
      value: input,
      label: input,
    };
  }

  if (!isRecord(input)) {
    return null;
  }

  const value = asString(input.value);
  if (!value) {
    return null;
  }

  const label = asString(input.label) ?? value;
  const icon = asString(input.icon);
  const isDefault = asBoolean(input.isDefault);
  const order = asNumber(input.order);

  return {
    value,
    label,
    ...(typeof icon === "string" ? { icon } : {}),
    ...(typeof isDefault === "boolean" ? { isDefault } : {}),
    ...(typeof order === "number" ? { order } : {}),
  };
}

function normalizeFieldOptions(input: unknown): Array<FieldOption> | Array<string> {
  const options = asArray(input);
  if (options.length === 0) {
    return [];
  }

  if (options.every((entry) => typeof entry === "string")) {
    return options as Array<string>;
  }

  return options
    .map((entry) => normalizeFieldOption(entry))
    .filter((entry): entry is FieldOption => entry !== null);
}

function normalizeFieldType(input: unknown): FormFieldType {
  const value = asString(input);
  if (value && FORM_FIELD_TYPES.has(value as FormFieldType)) {
    return value as FormFieldType;
  }

  return "text";
}

function normalizeField(
  input: unknown,
  index: number,
  fallbackFormId: number,
): OminityFormField {
  if (!isRecord(input)) {
    throw new FormsNormalizationError("Unable to normalize Ominity form field", {
      details: {
        index,
        input,
      },
    });
  }

  const id = asNumber(input.id) ?? index + 1;
  const formId = asNumber(input.formId) ?? fallbackFormId;

  return {
    resource: "form_field",
    id,
    formId,
    type: normalizeFieldType(input.type),
    name: asString(input.name) ?? `field_${id}`,
    label: asString(input.label) ?? "",
    isLabelVisible: asBoolean(input.isLabelVisible) ?? true,
    placeholder: asString(input.placeholder) ?? "",
    helper: asString(input.helper) ?? "",
    defaultValue: asString(input.defaultValue),
    width: asString(input.width),
    isInline: asBoolean(input.isInline) ?? false,
    css: normalizeFieldCss(input.css),
    validation: normalizeFieldValidation(input.validation),
    options: normalizeFieldOptions(input.options),
    order: asNumber(input.order) ?? index,
    updatedAt: asString(input.updatedAt) ?? "",
    createdAt: asString(input.createdAt) ?? "",
  };
}

function normalizeEmbeddedFields(
  form: Record<string, unknown>,
  formId: number,
): OminityFormField[] {
  const embedded = isRecord(form._embedded) ? form._embedded : null;
  const rawFields =
    (embedded?.form_fields ?? embedded?.fields ?? form.form_fields ?? form.fields);

  return asArray(rawFields).map((entry, index) => normalizeField(entry, index, formId));
}

export function normalizeOminityForm(input: unknown): OminityForm {
  const value = unwrapSingle(input, ["form", "data", "item"]);

  if (!isRecord(value)) {
    throw new FormsNormalizationError("Unable to normalize Ominity form", {
      details: {
        input,
      },
    });
  }

  const id = asNumber(value.id) ?? 0;

  return {
    resource: "form",
    id,
    name: asString(value.name) ?? `form_${id}`,
    title: asString(value.title) ?? "",
    description: asString(value.description) ?? "",
    submissions: asNumber(value.submissions) ?? 0,
    publishedAt: asString(value.publishedAt),
    updatedAt: asString(value.updatedAt) ?? "",
    createdAt: asString(value.createdAt) ?? "",
    _embedded: {
      form_fields: normalizeEmbeddedFields(value, id),
    },
  };
}

export function normalizeOminityForms(input: unknown): ReadonlyArray<OminityForm> {
  return unwrapList(input, ["forms", "data", "items"]).map((entry) =>
    normalizeOminityForm(entry));
}

export const defaultFormsNormalizers = {
  form: normalizeOminityForm,
  forms: normalizeOminityForms,
} as const;

