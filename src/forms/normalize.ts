import { FormsNormalizationError } from "./errors.js";
import type {
  FieldCss,
  FieldOption,
  FieldOptionsValue,
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
  "password",
  "select",
  "multiselect",
  "checkbox",
  "multicheckbox",
  "radio",
  "color",
  "url",
  "number",
  "date",
  "time",
  "datetime",
  "file",
  "hidden",
  "metadata",
  "honeypot",
  "recaptcha",
  "button",
  "html",
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

function normalizeFieldOptions(input: unknown): FieldOptionsValue {
  const options = asArray(input);
  if (options.length > 0 || Array.isArray(input)) {
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

  if (isRecord(input)) {
    return { ...input };
  }

  return [];
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
  const fieldsSource = embedded?.form_fields;
  const fields = asArray(fieldsSource);

  return fields.map((field, index) => normalizeField(field, index, formId));
}

function resolveFormSource(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new FormsNormalizationError("Unable to normalize Ominity form", {
      details: { input },
    });
  }

  const wrappedData = isRecord(input.data) ? input.data : null;
  if (wrappedData) {
    return wrappedData;
  }

  return input;
}

function resolveFormsSource(input: unknown): ReadonlyArray<unknown> {
  if (Array.isArray(input)) {
    return input;
  }

  if (!isRecord(input)) {
    return [];
  }

  if (Array.isArray(input.items)) {
    return input.items;
  }

  if (Array.isArray(input.data)) {
    return input.data;
  }

  const embedded = isRecord(input._embedded) ? input._embedded : null;
  if (embedded && Array.isArray(embedded.forms)) {
    return embedded.forms;
  }

  return [];
}

export function normalizeOminityForm(input: unknown): OminityForm {
  const source = resolveFormSource(input);

  const id = asNumber(source.id) ?? 0;

  return {
    resource: "form",
    id,
    name: asString(source.name) ?? "",
    title: asString(source.title) ?? "",
    description: asString(source.description) ?? "",
    submissions: asNumber(source.submissions) ?? 0,
    publishedAt: asString(source.publishedAt),
    updatedAt: asString(source.updatedAt) ?? "",
    createdAt: asString(source.createdAt) ?? "",
    _embedded: {
      form_fields: normalizeEmbeddedFields(source, id),
    },
  };
}

export function normalizeOminityForms(input: unknown): OminityForm[] {
  const forms = resolveFormsSource(input);
  return forms.map((form) => normalizeOminityForm(form));
}

export const defaultFormsNormalizers = {
  form: normalizeOminityForm,
  forms: normalizeOminityForms,
};
