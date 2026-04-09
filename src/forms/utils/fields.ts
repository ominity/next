import {
  type FieldOption,
  type MetadataValue,
  type OminityFormField,
  type PhoneFieldValue,
} from "../types.js";

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

  return (field.options as string[]).map((option) => option.toString());
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
      return field.defaultValue ?? "";
    case "checkbox":
      return parseBoolean(field.defaultValue);
    case "multicheckbox": {
      const defaults = getFieldOptions(field)
        .filter((option) => option.isDefault)
        .map((option) => option.value);
      return defaults;
    }
    case "select": {
      if (field.defaultValue) {
        return field.defaultValue;
      }
      const defaultOption =
        getFieldOptions(field).find((option) => option.isDefault) ?? null;
      return defaultOption?.value ?? "";
    }
    case "phone":
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
      case "multicheckbox":
        data[field.name] = Array.isArray(rawValue) ? rawValue : [];
        break;
      case "metadata":
        data[field.name] = rawValue || {};
        break;
      default:
        data[field.name] =
          rawValue === undefined || rawValue === null ? "" : rawValue;
    }
  });

  return data;
};
