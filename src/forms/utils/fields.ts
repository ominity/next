import {
  type FieldOption,
  type FileFieldValue,
  type MetadataValue,
  type OminityFormField,
  type PhoneFieldValue,
} from "../types.js";
import { SERVER_ENRICHED_METADATA_KEYS } from "./metadata.js";

export const sortFields = (
  fields: OminityFormField[],
): OminityFormField[] =>
  [...fields].sort((a, b) => {
    if (a.order === b.order) {
      return a.id - b.id;
    }
    return a.order - b.order;
  });

const isOptionObjectArray = (
  options: Array<FieldOption | string>,
): options is FieldOption[] =>
  Boolean(options.length && typeof options[0] === "object");

export const getFieldOptions = (field: OminityFormField): FieldOption[] => {
  if (!Array.isArray(field.options)) {
    return [];
  }

  if (field.type === "metadata") {
    return [];
  }

  if (isOptionObjectArray(field.options as Array<FieldOption | string>)) {
    return [...(field.options as FieldOption[])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
  }

  return (field.options as string[]).map((value) => ({
    value,
    label: value,
  }));
};

export const getMetadataOptions = (field: OminityFormField): string[] => {
  if (!Array.isArray(field.options)) {
    return [];
  }

  if (field.type !== "metadata") {
    return [];
  }

  return (field.options as string[])
    .map((option) => option.toString())
    .filter(
      (option): option is string =>
        !SERVER_ENRICHED_METADATA_KEYS.includes(option as typeof SERVER_ENRICHED_METADATA_KEYS[number]),
    );
};

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  }
  return false;
};

const parseMultipleValues = (value: string | null | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const getDefaultOptionValues = (field: OminityFormField): string[] =>
  getFieldOptions(field)
    .filter((option) => option.isDefault)
    .map((option) => option.value);

const getDefaultSelectValue = (field: OminityFormField): string => {
  if (field.defaultValue) {
    return field.defaultValue;
  }

  const defaultOption =
    getFieldOptions(field).find((option) => option.isDefault) ?? null;

  return defaultOption?.value ?? "";
};

export const getDefaultValue = (
  field: OminityFormField,
  metadata: Record<string, MetadataValue>,
  initialValues?: Record<string, unknown>,
): unknown => {
  if (initialValues && field.name in initialValues) {
    return initialValues[field.name];
  }

  switch (field.type) {
    case "metadata":
      return metadata[field.name] || {};
    case "honeypot":
      return "";
    case "hidden":
    case "html":
      return field.defaultValue ?? "";
    case "checkbox":
      return parseBoolean(field.defaultValue);
    case "multiselect": {
      const defaults = parseMultipleValues(field.defaultValue);
      return defaults.length > 0 ? defaults : getDefaultOptionValues(field);
    }
    case "multicheckbox": {
      const defaults = getDefaultOptionValues(field);
      return defaults.length > 0 ? defaults : parseMultipleValues(field.defaultValue);
    }
    case "select":
    case "radio":
      return getDefaultSelectValue(field);
    case "phone":
    case "file":
      return null;
    default:
      return field.defaultValue ?? "";
  }
};

export const buildDefaultValues = (
  fields: OminityFormField[],
  metadata: Record<string, MetadataValue>,
  initialValues?: Record<string, unknown>,
): Record<string, unknown> => {
  const defaults: Record<string, unknown> = {};
  fields.forEach((field) => {
    defaults[field.name] = getDefaultValue(field, metadata, initialValues);
  });
  return defaults;
};

const normalizeFileValue = (rawValue: unknown): FileFieldValue | null => {
  if (!rawValue || typeof rawValue !== "object") {
    return null;
  }

  const record = rawValue as Record<string, unknown>;
  const key = typeof record.key === "string" ? record.key : "";
  const url = typeof record.url === "string" ? record.url : "";
  const filename = typeof record.filename === "string" ? record.filename : "";
  const mimeType = typeof record.mimeType === "string" ? record.mimeType : "";
  const size = typeof record.size === "number" ? record.size : Number(record.size ?? 0);

  if (!filename) {
    return null;
  }

  return {
    key,
    url,
    filename,
    mimeType,
    size: Number.isFinite(size) ? size : 0,
  };
};

export const normalizeSubmissionData = (
  values: Record<string, unknown>,
  fields: OminityFormField[],
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};

  fields.forEach((field) => {
    const rawValue = values[field.name];

    switch (field.type) {
      case "phone": {
        if (!rawValue) {
          data[field.name] = "";
          break;
        }
        if (typeof rawValue === "string") {
          data[field.name] = rawValue;
          break;
        }
        const phoneValue = rawValue as PhoneFieldValue;
        data[field.name] = phoneValue.e164 || "";
        break;
      }
      case "checkbox":
        data[field.name] = Boolean(rawValue);
        break;
      case "multiselect":
      case "multicheckbox":
        data[field.name] = Array.isArray(rawValue) ? rawValue : [];
        break;
      case "metadata":
        data[field.name] = rawValue || {};
        break;
      case "file":
        data[field.name] = normalizeFileValue(rawValue);
        break;
      default:
        data[field.name] =
          rawValue === undefined || rawValue === null ? "" : rawValue;
    }
  });

  return data;
};
