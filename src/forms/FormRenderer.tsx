"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  Controller,
  type FieldErrors,
  type RegisterOptions,
  useForm,
} from "react-hook-form";
import {
  type FileFieldValue,
  type FormAdapters,
  type FormButtonAdapterProps,
  type FormCheckboxAdapterProps,
  type FormFieldContentAdapterProps,
  type FormFieldDescriptionAdapterProps,
  type FormFieldErrorAdapterProps,
  type FormFieldGroupAdapterProps,
  type FormFieldLabelAdapterProps,
  type FormFieldLegendAdapterProps,
  type FormFieldRootAdapterProps,
  type FormFieldSetAdapterProps,
  type FormFileInputAdapterProps,
  type FormHtmlBlockAdapterProps,
  type FormInputAdapterProps,
  type FormMultiSelectAdapterProps,
  type FormPhoneInputAdapterProps,
  type FormRadioGroupAdapterProps,
  type FormRadioItemAdapterProps,
  type FormRendererProps,
  type FormSelectAdapterProps,
  type FormTextareaAdapterProps,
  type FormTheme,
  type InlineBreakpoint,
  type MetadataValue,
  type OminityFormField,
  type PhoneFieldValue,
  type ThemeSlot,
} from "./types.js";
import {
  buildDefaultValues,
  getFieldOptions,
  getMetadataOptions,
  normalizeSubmissionData,
  sortFields,
} from "./utils/fields.js";
import {
  mergeClasses,
  mergeThemes,
  resolveSlotClasses,
} from "./utils/classNames.js";
import { tailwindDefaultTheme } from "./themes/tailwindDefault.js";
import { unstyledTheme } from "./themes/unstyled.js";
import {
  buildMetadataPayload,
  collectClientMetadata,
  fetchClientIp,
  needsClientIp,
} from "./utils/metadata.js";
import { useRecaptcha } from "./recaptcha/useRecaptcha.js";
import {
  isRecaptchaField,
  resolveFormRecaptchaConfig,
} from "./recaptcha/config.js";
import type { SubmitResult, SubmissionPayload } from "./types.js";
import { resolveGridColumns } from "./utils/layout.js";
import FormRow from "./components/FormRow.js";
import PhoneInput, { type PhoneInputProps } from "./phone/PhoneInput.js";

type FormValues = Record<string, unknown>;

const STATEFUL_FIELDS: ReadonlySet<string> = new Set([
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
]);

const RENDERABLE_FIELDS: ReadonlySet<string> = new Set([
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
  "button",
  "html",
]);

const TEXT_LIKE_FIELDS: ReadonlySet<string> = new Set([
  "text",
  "email",
  "password",
  "url",
  "number",
  "date",
  "time",
  "datetime",
  "color",
]);

const INLINE_BREAKPOINT_MAP: Record<
  Exclude<InlineBreakpoint, number>,
  number
> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

const resolveInlineBreakpoint = (
  breakpoint?: InlineBreakpoint,
): number => {
  if (typeof breakpoint === "number" && breakpoint > 0) {
    return breakpoint;
  }
  if (breakpoint && typeof breakpoint === "string") {
    return INLINE_BREAKPOINT_MAP[breakpoint] ?? INLINE_BREAKPOINT_MAP.md;
  }
  return INLINE_BREAKPOINT_MAP.md;
};

const getFieldId = (field: OminityFormField): string =>
  field.css?.id || `ominity-field-${field.id}`;

const getRegisterRules = (
  field: OminityFormField,
): RegisterOptions<FormValues> => {
  const message =
    field.validation?.message || `${field.label || field.name} is invalid`;
  const rules: RegisterOptions<FormValues> = {};

  if (field.validation?.isRequired) {
    rules.required = message;
  }

  if (typeof field.validation?.minLength === "number") {
    rules.minLength = {
      value: field.validation.minLength,
      message: message || `Minimum ${field.validation.minLength} characters`,
    };
  }

  if (typeof field.validation?.maxLength === "number") {
    rules.maxLength = {
      value: field.validation.maxLength,
      message: message || `Maximum ${field.validation.maxLength} characters`,
    };
  }

  if (field.type === "email") {
    rules.pattern = {
      value: EMAIL_PATTERN,
      message: "Enter a valid email address.",
    };
  }

  return rules;
};

const resolveTheme = (
  styled: boolean | undefined,
  override?: Partial<FormTheme>,
): FormTheme => {
  const base = styled ? tailwindDefaultTheme : unstyledTheme;
  return mergeThemes(base, override);
};

const getErrorMessage = (
  errors: FieldErrors<FormValues>,
  field: OminityFormField,
): string | null => {
  const error = errors[field.name];
  if (!error) {
    return null;
  }
  if (typeof error.message === "string") {
    return error.message;
  }
  return field.validation?.message || "Invalid value.";
};

type InlineFieldRow = {
  id: string;
  inline: true;
  fields: OminityFormField[];
  columnTemplate: string;
};

type StackedFieldRow = {
  id: string;
  inline: false;
  fields: OminityFormField[];
};

type FieldRow = InlineFieldRow | StackedFieldRow;

const DefaultField: NonNullable<FormAdapters["Field"]> = ({
  children,
  className,
  style,
  ...dataProps
}: FormFieldRootAdapterProps) => (
  <div className={className} style={style} data-slot="field" {...dataProps}>
    {children}
  </div>
);

const DefaultFieldContent: NonNullable<FormAdapters["FieldContent"]> = ({
  children,
  className,
}: FormFieldContentAdapterProps) => (
  <div className={className} data-slot="field.content">
    {children}
  </div>
);

const DefaultFieldLabel: NonNullable<FormAdapters["FieldLabel"]> = ({
  children,
  className,
  id,
  htmlFor,
  ...props
}: FormFieldLabelAdapterProps) => {
  if (htmlFor) {
    return (
      <label id={id} htmlFor={htmlFor} className={className} data-slot="field.label" {...props}>
        {children}
      </label>
    );
  }

  return (
    <div id={id} className={className} data-slot="field.label" {...props}>
      {children}
    </div>
  );
};

const DefaultFieldDescription: NonNullable<FormAdapters["FieldDescription"]> = ({
  children,
  className,
  id,
}: FormFieldDescriptionAdapterProps) => {
  if (!children) {
    return null;
  }

  return (
    <p id={id} className={className} data-slot="field.description">
      {children}
    </p>
  );
};

const DefaultFieldError: NonNullable<FormAdapters["FieldError"]> = ({
  children,
  className,
  id,
}: FormFieldErrorAdapterProps) => {
  if (!children) {
    return null;
  }

  return (
    <p id={id} className={className} data-slot="field.error">
      {children}
    </p>
  );
};

const DefaultFieldSet: NonNullable<FormAdapters["FieldSet"]> = ({
  children,
  className,
}: FormFieldSetAdapterProps) => (
  <fieldset className={className} data-slot="field.set">
    {children}
  </fieldset>
);

const DefaultFieldLegend: NonNullable<FormAdapters["FieldLegend"]> = ({
  children,
  className,
  id,
}: FormFieldLegendAdapterProps) => (
  <legend id={id} className={className} data-slot="field.legend">
    {children}
  </legend>
);

const DefaultFieldGroup: NonNullable<FormAdapters["FieldGroup"]> = ({
  children,
  className,
}: FormFieldGroupAdapterProps) => (
  <div className={className} data-slot="field.group">
    {children}
  </div>
);

const DefaultInput = ({ invalid: _invalid, ...props }: FormInputAdapterProps) => (
  <input {...props} />
);

const DefaultTextarea = ({ invalid: _invalid, ...props }: FormTextareaAdapterProps) => (
  <textarea {...props} />
);

const DefaultSelect = ({
  id,
  name,
  value,
  placeholder,
  options,
  disabled,
  describedBy,
  onValueChange,
}: FormSelectAdapterProps) => (
  <select
    id={id}
    name={name}
    value={value}
    disabled={disabled}
    aria-describedby={describedBy}
    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
      onValueChange(event.target.value)
    }
  >
    {placeholder ? <option value="">{placeholder}</option> : null}
    {options.map((option) => (
      <option key={`${name}-${option.value}`} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

const DefaultMultiSelect = ({
  id,
  name,
  value,
  options,
  disabled,
  describedBy,
  onValueChange,
}: FormMultiSelectAdapterProps) => (
  <select
    id={id}
    name={name}
    multiple
    value={value}
    disabled={disabled}
    aria-describedby={describedBy}
    onChange={(event: ChangeEvent<HTMLSelectElement>) => {
      const values = Array.from(
        event.target.selectedOptions,
        (option: HTMLOptionElement) => option.value,
      );
      onValueChange(values);
    }}
  >
    {options.map((option) => (
      <option key={`${name}-${option.value}`} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

const DefaultCheckbox = ({
  id,
  name,
  checked,
  disabled,
  describedBy,
  onCheckedChange,
}: FormCheckboxAdapterProps) => (
  <input
    id={id}
    name={name}
    type="checkbox"
    checked={checked}
    disabled={disabled}
    aria-describedby={describedBy}
    onChange={(event: ChangeEvent<HTMLInputElement>) =>
      onCheckedChange(event.target.checked)
    }
  />
);

const DefaultButton = (props: FormButtonAdapterProps) => <button {...props} />;

const DefaultPhoneInput = (props: FormPhoneInputAdapterProps) => {
  const normalizedProps: PhoneInputProps = {
    value: props.value,
    onChange: props.onChange,
    countries: props.countries,
    defaultCountry: props.defaultCountry,
    placeholder: props.placeholder,
    disabled: props.disabled,
    slotClasses: props.slotClasses ?? {
      control: "",
      countryButton: "",
      dropdown: "",
      searchInput: "",
      option: "",
      numberInput: "",
    },
  };

  return <PhoneInput {...normalizedProps} />;
};

const DefaultFileInput = ({
  id,
  name,
  disabled,
  describedBy,
  onChange,
}: FormFileInputAdapterProps) => (
  <input
    id={id}
    name={name}
    type="file"
    disabled={disabled}
    aria-describedby={describedBy}
    onChange={(event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      if (!file) {
        onChange(null);
        return;
      }

      onChange({
        key: "",
        url: "",
        filename: file.name,
        mimeType: file.type,
        size: file.size,
      });
    }}
  />
);

const DefaultHtmlBlock = ({ html, className }: FormHtmlBlockAdapterProps) => (
  <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
);

const getTextInputType = (field: OminityFormField): string => {
  switch (field.type) {
    case "email":
    case "password":
    case "url":
    case "number":
    case "date":
    case "time":
    case "color":
      return field.type;
    case "datetime":
      return "datetime-local";
    default:
      return "text";
  }
};

const getSelectValidation = (field: OminityFormField) => {
  if (!field.validation?.isRequired) {
    return undefined;
  }

  return (value: unknown) => {
    if (typeof value === "string" && value.trim().length > 0) {
      return true;
    }

    return field.validation?.message || `${field.label || field.name} is required.`;
  };
};

const getMultiValueValidation = (field: OminityFormField) => {
  if (!field.validation?.isRequired) {
    return undefined;
  }

  return (value: unknown) => {
    if (Array.isArray(value) && value.length > 0) {
      return true;
    }

    return field.validation?.message || `${field.label || field.name} is required.`;
  };
};

const getCheckboxValidation = (field: OminityFormField) => {
  if (!field.validation?.isRequired) {
    return undefined;
  }

  return (value: unknown) => {
    if (Boolean(value)) {
      return true;
    }

    return field.validation?.message || `${field.label || field.name} is required.`;
  };
};

const getPhoneValidation = (field: OminityFormField) => {
  return (rawValue: unknown) => {
    const phoneValue = rawValue as PhoneFieldValue | null;
    if (!field.validation?.isRequired && !phoneValue?.nationalNumber) {
      return true;
    }
    if (phoneValue?.e164) {
      return true;
    }
    return field.validation?.message || "Enter a valid phone number.";
  };
};

const getFileValidation = (field: OminityFormField) => {
  return (rawValue: unknown) => {
    const fileValue = rawValue as FileFieldValue | null;
    if (!field.validation?.isRequired && !fileValue?.filename) {
      return true;
    }
    if (fileValue?.filename && (fileValue.key || fileValue.url)) {
      return true;
    }
    return field.validation?.message || `${field.label || field.name} is required.`;
  };
};

const getControllerRules = (
  validate?: (value: unknown) => string | true,
): RegisterOptions<FormValues> => {
  if (!validate) {
    return {};
  }

  return { validate };
};

const renderFieldDescription = (
  FieldDescriptionComponent: NonNullable<FormAdapters["FieldDescription"]>,
  text: string | undefined,
  className: string,
  id?: string,
) => {
  if (!text) {
    return null;
  }

  return (
    <FieldDescriptionComponent id={id} className={className}>
      {text}
    </FieldDescriptionComponent>
  );
};

const renderFieldError = (
  FieldErrorComponent: NonNullable<FormAdapters["FieldError"]>,
  message: string | null,
  className: string,
  id?: string,
) => {
  if (!message) {
    return null;
  }

  return (
    <FieldErrorComponent id={id} className={className} errors={[{ message }]}>
      {message}
    </FieldErrorComponent>
  );
};

const FormRenderer = <T,>({
  form,
  submitUrl = "/api/forms/submit",
  userId = null,
  recaptcha,
  styled,
  themeOverride,
  pt,
  metadataOverrides,
  initialValues,
  countriesOverride,
  defaultPhoneCountry,
  locale,
  submitDisabled = false,
  validationOnly = false,
  renderBeforeFields,
  renderAfterFields,
  onSubmitValid,
  onSubmitSuccess,
  onSubmitError,
  adapters,
  inlineBreakpoint = "md",
  fileUploadUrl,
}: FormRendererProps<T>) => {
  const allFields = useMemo(() => {
    const incoming = form?._embedded?.form_fields ?? [];
    return sortFields(incoming);
  }, [form]);

  const resolvedRecaptcha = useMemo(
    () => resolveFormRecaptchaConfig(form, recaptcha),
    [form, recaptcha],
  );

  const recaptchaField = useMemo(
    () => allFields.find((field) => isRecaptchaField(field)) ?? null,
    [allFields],
  );

  const hasRecaptchaProtection = Boolean(recaptcha || recaptchaField);
  const shouldRenderInlineRecaptcha = Boolean(
    recaptchaField && resolvedRecaptcha?.version === "v2-checkbox",
  );

  const statefulFields = useMemo(
    () => allFields.filter((field) => STATEFUL_FIELDS.has(field.type)),
    [allFields],
  );

  const displayFields = useMemo(
    () =>
      allFields.filter(
        (field) =>
          RENDERABLE_FIELDS.has(field.type) ||
          (isRecaptchaField(field) && shouldRenderInlineRecaptcha),
      ),
    [allFields, shouldRenderInlineRecaptcha],
  );

  const metadataFields = useMemo(
    () => statefulFields.filter((field) => field.type === "metadata"),
    [statefulFields],
  );

  const initialMetadata = useMemo(() => {
    if (!metadataFields.length) {
      return {};
    }
    const clientMetadata = collectClientMetadata(locale);
    const metadataMap: Record<string, MetadataValue> = {};
    metadataFields.forEach((field) => {
      metadataMap[field.name] = buildMetadataPayload(
        field,
        metadataOverrides,
        clientMetadata,
      );
    });
    return metadataMap;
  }, [locale, metadataFields, metadataOverrides]);

  const [metadataValues, setMetadataValues] =
    useState<Record<string, MetadataValue>>(initialMetadata);

  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [recaptchaError, setRecaptchaError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBelowInlineBreakpoint, setIsBelowInlineBreakpoint] =
    useState(false);

  const resolvedInlineBreakpoint = useMemo(
    () => resolveInlineBreakpoint(inlineBreakpoint),
    [inlineBreakpoint],
  );

  useEffect(() => {
    setMetadataValues(initialMetadata);
  }, [initialMetadata]);

  useEffect(() => {
    if (!metadataFields.length) {
      return;
    }

    let isMounted = true;
    const clientMetadata = collectClientMetadata(locale);

    const updateMetadata = (ipAddress?: string | null) => {
      if (!isMounted) {
        return;
      }
      const nextClientMetadata = {
        ...clientMetadata,
        ip_address: ipAddress ?? clientMetadata.ip_address ?? null,
      };
      const metadataMap: Record<string, MetadataValue> = {};
      metadataFields.forEach((field) => {
        metadataMap[field.name] = buildMetadataPayload(
          field,
          metadataOverrides,
          nextClientMetadata,
        );
      });
      setMetadataValues(metadataMap);
    };

    if (needsClientIp(metadataFields) && !clientMetadata.ip_address) {
      fetchClientIp()
        .then((ip) => updateMetadata(ip))
        .catch(() => updateMetadata(null));
    } else {
      updateMetadata(clientMetadata.ip_address ?? null);
    }

    return () => {
      isMounted = false;
    };
  }, [locale, metadataFields, metadataOverrides]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(
      `(max-width: ${Math.max(resolvedInlineBreakpoint - 0.02, 0)}px)`,
    );

    const updateMatch = () => setIsBelowInlineBreakpoint(mediaQuery.matches);
    updateMatch();

    const handleChange = (event: MediaQueryListEvent) => {
      setIsBelowInlineBreakpoint(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [resolvedInlineBreakpoint]);

  const hasInlineFields = useMemo(
    () => displayFields.some((field) => field.isInline),
    [displayFields],
  );

  const inlineLayoutEnabled = hasInlineFields && !isBelowInlineBreakpoint;

  const rows = useMemo<FieldRow[]>(() => {
    if (!displayFields.length) {
      return [];
    }

    const result: FieldRow[] = [];
    let inlineBuffer: OminityFormField[] = [];

    const flushInlineBuffer = () => {
      if (!inlineBuffer.length) {
        return;
      }
      result.push({
        id: `inline-${inlineBuffer.map((bufferField) => bufferField.id).join("-")}`,
        inline: true,
        fields: inlineBuffer,
        columnTemplate: resolveGridColumns(inlineBuffer),
      });
      inlineBuffer = [];
    };

    displayFields.forEach((field) => {
      if (field.isInline) {
        inlineBuffer.push(field);
        return;
      }
      flushInlineBuffer();
      result.push({
        id: `field-${field.id}`,
        inline: false,
        fields: [field],
      });
    });

    flushInlineBuffer();
    return result;
  }, [displayFields]);

  const theme = useMemo(
    () => resolveTheme(styled, themeOverride),
    [styled, themeOverride],
  );

  const defaultValues = useMemo(
    () => buildDefaultValues(statefulFields, metadataValues, initialValues),
    [statefulFields, metadataValues, initialValues],
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  useEffect(() => {
    metadataFields.forEach((field) => {
      setValue(field.name, metadataValues[field.name], {
        shouldDirty: false,
        shouldTouch: false,
      });
    });
  }, [metadataFields, metadataValues, setValue]);

  const recaptchaControl = useRecaptcha(resolvedRecaptcha);

  useEffect(() => {
    if (recaptchaControl.token) {
      setRecaptchaError(null);
    }
  }, [recaptchaControl.token]);

  const getSlotClass = (slot: ThemeSlot, field?: OminityFormField): string =>
    resolveSlotClasses({
      slot,
      theme,
      pt,
      fieldCss: field?.css?.classes ?? null,
    });

  const honeypotFields = useMemo(
    () => statefulFields.filter((field) => field.type === "honeypot"),
    [statefulFields],
  );
  const honeypotFieldNames = useMemo(
    () => honeypotFields.map((field) => field.name),
    [honeypotFields],
  );

  const normalizeData = (values: FormValues): Record<string, unknown> =>
    normalizeSubmissionData(values, statefulFields);

  const getRecaptchaFailureMessage = (): string =>
    recaptchaControl.error ??
    recaptchaField?.validation?.message ??
    "Complete the security check.";

  const FieldComponent = adapters?.Field ?? DefaultField;
  const FieldContentComponent = adapters?.FieldContent ?? DefaultFieldContent;
  const FieldLabelComponent = adapters?.FieldLabel ?? DefaultFieldLabel;
  const FieldDescriptionComponent = adapters?.FieldDescription ?? DefaultFieldDescription;
  const FieldErrorComponent = adapters?.FieldError ?? DefaultFieldError;
  const FieldSetComponent = adapters?.FieldSet ?? DefaultFieldSet;
  const FieldLegendComponent = adapters?.FieldLegend ?? DefaultFieldLegend;
  const FieldGroupComponent = adapters?.FieldGroup ?? DefaultFieldGroup;
  const InputComponent = adapters?.Input ?? DefaultInput;
  const TextareaComponent = adapters?.Textarea ?? DefaultTextarea;
  const SelectComponent = adapters?.Select ?? DefaultSelect;
  const MultiSelectComponent = adapters?.MultiSelect ?? DefaultMultiSelect;
  const CheckboxComponent = adapters?.Checkbox ?? DefaultCheckbox;
  const ButtonComponent = adapters?.Button ?? DefaultButton;
  const PhoneInputComponent = adapters?.PhoneInput ?? DefaultPhoneInput;
  const FileInputComponent = adapters?.FileInput ?? DefaultFileInput;
  const HtmlBlockComponent = adapters?.HtmlBlock ?? DefaultHtmlBlock;

  const onSubmit = handleSubmit(async (values) => {
    setSubmissionError(null);
    setRecaptchaError(null);

    try {
      await onSubmitValid?.(values);
    } catch (error) {
      setSubmissionError("Unable to process form.");
      onSubmitError?.({
        ok: false,
        status: 0,
        data: null,
        error,
      });
      return;
    }

    if (validationOnly || submitDisabled) {
      return;
    }

    setIsSubmitting(true);

    const honeypotTriggered = honeypotFieldNames.some((name) => {
      const honeypotValue = values[name];
      return typeof honeypotValue === "string" && honeypotValue.trim();
    });
    if (honeypotTriggered) {
      setSubmissionError("Submission blocked.");
      setIsSubmitting(false);
      return;
    }

    if (hasRecaptchaProtection && !resolvedRecaptcha) {
      setSubmissionError("Security check is unavailable.");
      setIsSubmitting(false);
      return;
    }

    let recaptchaToken: string | null = null;
    if (resolvedRecaptcha) {
      try {
        recaptchaToken = await recaptchaControl.execute();
      } catch {
        recaptchaToken = null;
      }
      if (!recaptchaToken) {
        const message = getRecaptchaFailureMessage();
        if (resolvedRecaptcha.version === "v2-checkbox") {
          setRecaptchaError(message);
        } else {
          setSubmissionError(message);
        }
        setIsSubmitting(false);
        return;
      }
    }

    const payload: SubmissionPayload = {
      formId: form.id,
      userId: userId ?? null,
      data: normalizeData(values),
      recaptchaToken,
      honeypotFields: honeypotFieldNames,
    };

    try {
      const response = await fetch(submitUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responseBody = (await response
        .json()
        .catch(() => ({}))) as Record<string, unknown>;
      const result: SubmitResult<T> = {
        ok: response.ok,
        status: response.status,
        data: (responseBody as T) ?? null,
      };

      if (!response.ok) {
        setSubmissionError("Something went wrong. Please try again.");
        onSubmitError?.(result as SubmitResult<never>);
        return;
      }

      reset(buildDefaultValues(statefulFields, metadataValues, initialValues));
      onSubmitSuccess?.(result);
    } catch (error) {
      setSubmissionError("Unable to submit form.");
      onSubmitError?.({
        ok: false,
        status: 0,
        data: null,
        error,
      });
    } finally {
      recaptchaControl.reset();
      setIsSubmitting(false);
    }
  });

  const renderField = (
    field: OminityFormField,
    inlineRowActive: boolean,
  ) => {
    const inputId = getFieldId(field);
    const helperId = field.helper ? `${inputId}-helper` : undefined;
    const errorMessage = getErrorMessage(errors, field);
    const errorId = errorMessage ? `${inputId}-error` : undefined;
    const labelId = field.label ? `${inputId}-label` : undefined;

    const labelClass = mergeClasses(
      getSlotClass("field.label", field),
      !field.isLabelVisible ? getSlotClass("field.labelHidden", field) : "",
    );

    const wrapperStyle = inlineRowActive ? { width: "100%" } : undefined;

    const describedBy =
      [helperId, errorId].filter(Boolean).join(" ") || undefined;

    const fieldRootProps: FormFieldRootAdapterProps = {
      className: getSlotClass("field.wrapper", field),
      style: wrapperStyle,
      orientation: "vertical",
      "data-field-type": field.type,
      "data-inline": field.isInline ? "true" : undefined,
      "data-invalid": errorMessage ? "true" : undefined,
      "data-disabled": submitDisabled || isSubmitting ? "true" : undefined,
    };

    if (field.type === "metadata") {
      const registers = getMetadataOptions(field).map((option) => {
        const name = `${field.name}.${option}`;
        return {
          name,
          registerReturn: register(name),
        };
      });

      return (
        <div key={field.id} style={{ display: "none" }} aria-hidden="true" data-field-name={field.name}>
          {registers.map(({ name, registerReturn }) => (
            <input key={name} type="hidden" {...registerReturn} />
          ))}
        </div>
      );
    }

    if (field.type === "hidden") {
      return (
        <input key={field.id} type="hidden" {...register(field.name)} />
      );
    }

    if (field.type === "honeypot") {
      return (
        <div key={field.id} style={{ display: "none" }} aria-hidden="true">
          <label htmlFor={inputId}>{field.label || "Leave this field empty"}</label>
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            tabIndex={-1}
            {...register(field.name)}
          />
        </div>
      );
    }

    if (field.type === "button") {
      return (
        <FieldComponent key={field.id} {...fieldRootProps}>
          <ButtonComponent
            type={(field.defaultValue as "button" | "reset" | "submit") || "submit"}
            className={getSlotClass("field.button", field)}
            disabled={submitDisabled || isSubmitting}
          >
            {field.label}
          </ButtonComponent>
          {renderFieldDescription(
            FieldDescriptionComponent,
            field.helper,
            getSlotClass("field.helper", field),
            helperId,
          )}
        </FieldComponent>
      );
    }

    if (TEXT_LIKE_FIELDS.has(field.type)) {
      return (
        <FieldComponent key={field.id} {...fieldRootProps}>
          {field.label ? (
            <FieldLabelComponent
              id={labelId}
              htmlFor={inputId}
              className={labelClass}
              data-hidden={field.isLabelVisible ? undefined : "true"}
            >
              {field.label}
            </FieldLabelComponent>
          ) : null}
          <FieldContentComponent>
            <InputComponent
              id={inputId}
              type={getTextInputType(field)}
              placeholder={field.placeholder || undefined}
              className={getSlotClass("field.input", field)}
              aria-describedby={describedBy}
              aria-invalid={errorMessage ? true : undefined}
              invalid={Boolean(errorMessage)}
              disabled={submitDisabled || isSubmitting}
              {...register(field.name, getRegisterRules(field))}
            />
            {renderFieldDescription(
              FieldDescriptionComponent,
              field.helper,
              getSlotClass("field.helper", field),
              helperId,
            )}
            {renderFieldError(
              FieldErrorComponent,
              errorMessage,
              getSlotClass("field.error", field),
              errorId,
            )}
          </FieldContentComponent>
        </FieldComponent>
      );
    }

    if (field.type === "textarea") {
      return (
        <FieldComponent key={field.id} {...fieldRootProps}>
          {field.label ? (
            <FieldLabelComponent
              id={labelId}
              htmlFor={inputId}
              className={labelClass}
              data-hidden={field.isLabelVisible ? undefined : "true"}
            >
              {field.label}
            </FieldLabelComponent>
          ) : null}
          <FieldContentComponent>
            <TextareaComponent
              id={inputId}
              placeholder={field.placeholder || undefined}
              className={getSlotClass("field.textarea", field)}
              aria-describedby={describedBy}
              aria-invalid={errorMessage ? true : undefined}
              invalid={Boolean(errorMessage)}
              disabled={submitDisabled || isSubmitting}
              {...register(field.name, getRegisterRules(field))}
            />
            {renderFieldDescription(
              FieldDescriptionComponent,
              field.helper,
              getSlotClass("field.helper", field),
              helperId,
            )}
            {renderFieldError(
              FieldErrorComponent,
              errorMessage,
              getSlotClass("field.error", field),
              errorId,
            )}
          </FieldContentComponent>
        </FieldComponent>
      );
    }

    if (field.type === "select") {
      return (
        <Controller
          key={field.id}
          control={control}
          name={field.name}
          rules={getControllerRules(getSelectValidation(field))}
          render={({ field: controllerField }) => (
            <FieldComponent {...fieldRootProps}>
              {field.label ? (
                <FieldLabelComponent
                  id={labelId}
                  htmlFor={inputId}
                  className={labelClass}
                  data-hidden={field.isLabelVisible ? undefined : "true"}
                >
                  {field.label}
                </FieldLabelComponent>
              ) : null}
              <FieldContentComponent>
                <SelectComponent
                  id={inputId}
                  name={field.name}
                  value={typeof controllerField.value === "string" ? controllerField.value : ""}
                  placeholder={field.placeholder || undefined}
                  options={getFieldOptions(field)}
                  disabled={submitDisabled || isSubmitting}
                  invalid={Boolean(errorMessage)}
                  describedBy={describedBy}
                  onValueChange={(value) => controllerField.onChange(value)}
                />
                {renderFieldDescription(
                  FieldDescriptionComponent,
                  field.helper,
                  getSlotClass("field.helper", field),
                  helperId,
                )}
                {renderFieldError(
                  FieldErrorComponent,
                  errorMessage,
                  getSlotClass("field.error", field),
                  errorId,
                )}
              </FieldContentComponent>
            </FieldComponent>
          )}
        />
      );
    }

    if (field.type === "multiselect") {
      return (
        <Controller
          key={field.id}
          control={control}
          name={field.name}
          rules={getControllerRules(getMultiValueValidation(field))}
          render={({ field: controllerField }) => (
            <FieldComponent {...fieldRootProps}>
              {field.label ? (
                <FieldLabelComponent
                  id={labelId}
                  htmlFor={inputId}
                  className={labelClass}
                  data-hidden={field.isLabelVisible ? undefined : "true"}
                >
                  {field.label}
                </FieldLabelComponent>
              ) : null}
              <FieldContentComponent>
                <MultiSelectComponent
                  id={inputId}
                  name={field.name}
                  value={Array.isArray(controllerField.value) ? (controllerField.value as string[]) : []}
                  placeholder={field.placeholder || undefined}
                  options={getFieldOptions(field)}
                  disabled={submitDisabled || isSubmitting}
                  invalid={Boolean(errorMessage)}
                  describedBy={describedBy}
                  onValueChange={(value) => controllerField.onChange(value)}
                />
                {renderFieldDescription(
                  FieldDescriptionComponent,
                  field.helper,
                  getSlotClass("field.helper", field),
                  helperId,
                )}
                {renderFieldError(
                  FieldErrorComponent,
                  errorMessage,
                  getSlotClass("field.error", field),
                  errorId,
                )}
              </FieldContentComponent>
            </FieldComponent>
          )}
        />
      );
    }

    if (field.type === "checkbox") {
      return (
        <Controller
          key={field.id}
          control={control}
          name={field.name}
          rules={getControllerRules(getCheckboxValidation(field))}
          render={({ field: controllerField }) => (
            <FieldComponent
              {...fieldRootProps}
              orientation="horizontal"
            >
              <CheckboxComponent
                id={inputId}
                name={field.name}
                checked={Boolean(controllerField.value)}
                disabled={submitDisabled || isSubmitting}
                invalid={Boolean(errorMessage)}
                describedBy={describedBy}
                onCheckedChange={(checked) => controllerField.onChange(checked)}
              />
              <FieldContentComponent>
                {field.label ? (
                  <FieldLabelComponent
                    id={labelId}
                    htmlFor={inputId}
                    className={labelClass}
                    data-hidden={field.isLabelVisible ? undefined : "true"}
                  >
                    {field.label}
                  </FieldLabelComponent>
                ) : null}
                {renderFieldDescription(
                  FieldDescriptionComponent,
                  field.helper,
                  getSlotClass("field.helper", field),
                  helperId,
                )}
                {renderFieldError(
                  FieldErrorComponent,
                  errorMessage,
                  getSlotClass("field.error", field),
                  errorId,
                )}
              </FieldContentComponent>
            </FieldComponent>
          )}
        />
      );
    }

    if (field.type === "multicheckbox") {
      return (
        <Controller
          key={field.id}
          control={control}
          name={field.name}
          rules={getControllerRules(getMultiValueValidation(field))}
          render={({ field: controllerField }) => {
            const selectedValues = Array.isArray(controllerField.value)
              ? (controllerField.value as string[])
              : [];
            const options = getFieldOptions(field);

            return (
              <FieldSetComponent className={getSlotClass("field.wrapper", field)}>
                {field.label ? (
                  <FieldLegendComponent id={labelId} className={labelClass}>
                    {field.label}
                  </FieldLegendComponent>
                ) : null}
                <FieldGroupComponent className={getSlotClass("field.optionWrapper", field)}>
                  {options.map((option) => {
                    const optionId = `${field.id}-${option.value}`;
                    const checked = selectedValues.includes(option.value);
                    return (
                      <FieldComponent
                        key={optionId}
                        className={getSlotClass("field.optionWrapper", field)}
                        orientation="horizontal"
                        data-field-type={field.type}
                        data-inline={field.isInline ? "true" : undefined}
                        data-invalid={errorMessage ? "true" : undefined}
                        data-disabled={submitDisabled || isSubmitting ? "true" : undefined}
                      >
                        <CheckboxComponent
                          id={optionId}
                          name={field.name}
                          checked={checked}
                          disabled={submitDisabled || isSubmitting}
                          invalid={Boolean(errorMessage)}
                          onCheckedChange={(nextChecked) => {
                            if (nextChecked) {
                              controllerField.onChange([...selectedValues, option.value]);
                              return;
                            }
                            controllerField.onChange(
                              selectedValues.filter((value) => value !== option.value),
                            );
                          }}
                        />
                        <FieldContentComponent>
                          <FieldLabelComponent htmlFor={optionId} className={getSlotClass("field.optionLabel", field)}>
                            {option.label}
                          </FieldLabelComponent>
                        </FieldContentComponent>
                      </FieldComponent>
                    );
                  })}
                </FieldGroupComponent>
                {renderFieldDescription(
                  FieldDescriptionComponent,
                  field.helper,
                  getSlotClass("field.helper", field),
                  helperId,
                )}
                {renderFieldError(
                  FieldErrorComponent,
                  errorMessage,
                  getSlotClass("field.error", field),
                  errorId,
                )}
              </FieldSetComponent>
            );
          }}
        />
      );
    }

    if (field.type === "radio") {
      return (
        <Controller
          key={field.id}
          control={control}
          name={field.name}
          rules={getControllerRules(getSelectValidation(field))}
          render={({ field: controllerField }) => {
            const options = getFieldOptions(field);
            const RadioGroupComponent = adapters?.RadioGroup;

            return (
              <FieldSetComponent className={getSlotClass("field.wrapper", field)}>
                {field.label ? (
                  <FieldLegendComponent id={labelId} className={labelClass}>
                    {field.label}
                  </FieldLegendComponent>
                ) : null}
                {RadioGroupComponent ? (
                  <RadioGroupComponent
                    id={inputId}
                    name={field.name}
                    value={typeof controllerField.value === "string" ? controllerField.value : ""}
                    options={options}
                    disabled={submitDisabled || isSubmitting}
                    invalid={Boolean(errorMessage)}
                    describedBy={describedBy}
                    onValueChange={(value) => controllerField.onChange(value)}
                  />
                ) : (
                  <FieldGroupComponent className={getSlotClass("field.optionWrapper", field)}>
                    {options.map((option) => {
                      const optionId = `${field.id}-${option.value}`;
                      const checked = controllerField.value === option.value;
                      return (
                        <FieldComponent
                          key={optionId}
                          className={getSlotClass("field.optionWrapper", field)}
                          orientation="horizontal"
                          data-field-type={field.type}
                          data-inline={field.isInline ? "true" : undefined}
                          data-invalid={errorMessage ? "true" : undefined}
                          data-disabled={submitDisabled || isSubmitting ? "true" : undefined}
                        >
                          <input
                            id={optionId}
                            type="radio"
                            name={field.name}
                            value={option.value}
                            checked={checked}
                            disabled={submitDisabled || isSubmitting}
                            aria-describedby={describedBy}
                            onChange={() => controllerField.onChange(option.value)}
                          />
                          <FieldContentComponent>
                            <FieldLabelComponent htmlFor={optionId} className={getSlotClass("field.optionLabel", field)}>
                              {option.label}
                            </FieldLabelComponent>
                          </FieldContentComponent>
                        </FieldComponent>
                      );
                    })}
                  </FieldGroupComponent>
                )}
                {renderFieldDescription(
                  FieldDescriptionComponent,
                  field.helper,
                  getSlotClass("field.helper", field),
                  helperId,
                )}
                {renderFieldError(
                  FieldErrorComponent,
                  errorMessage,
                  getSlotClass("field.error", field),
                  errorId,
                )}
              </FieldSetComponent>
            );
          }}
        />
      );
    }

    if (field.type === "phone") {
      return (
        <Controller
          key={field.id}
          control={control}
          name={field.name}
          rules={getControllerRules(getPhoneValidation(field))}
          render={({ field: controllerField }) => (
            <FieldComponent {...fieldRootProps}>
              {field.label ? (
                <FieldLabelComponent
                  id={labelId}
                  htmlFor={inputId}
                  className={labelClass}
                  data-hidden={field.isLabelVisible ? undefined : "true"}
                >
                  {field.label}
                </FieldLabelComponent>
              ) : null}
              <FieldContentComponent>
                <PhoneInputComponent
                  value={(controllerField.value as PhoneFieldValue | null) ?? null}
                  onChange={controllerField.onChange}
                  countries={countriesOverride}
                  defaultCountry={defaultPhoneCountry}
                  placeholder={field.placeholder || "Phone number"}
                  disabled={submitDisabled || isSubmitting}
                  slotClasses={{
                    control: mergeClasses(
                      getSlotClass("field.input", field),
                      getSlotClass("field.phoneWrapper", field),
                    ),
                    countryButton: getSlotClass("field.phoneCountryButton", field),
                    dropdown: getSlotClass("field.phoneDropdown", field),
                    searchInput: mergeClasses(
                      getSlotClass("field.input", field),
                      getSlotClass("field.phoneSearch", field),
                    ),
                    option: getSlotClass("field.phoneOption", field),
                    numberInput: getSlotClass("field.phoneNumberInput", field),
                  }}
                />
                {renderFieldDescription(
                  FieldDescriptionComponent,
                  field.helper,
                  getSlotClass("field.helper", field),
                  helperId,
                )}
                {renderFieldError(
                  FieldErrorComponent,
                  errorMessage,
                  getSlotClass("field.error", field),
                  errorId,
                )}
              </FieldContentComponent>
            </FieldComponent>
          )}
        />
      );
    }

    if (field.type === "file") {
      return (
        <Controller
          key={field.id}
          control={control}
          name={field.name}
          rules={getControllerRules(getFileValidation(field))}
          render={({ field: controllerField }) => (
            <FieldComponent {...fieldRootProps}>
              {field.label ? (
                <FieldLabelComponent
                  id={labelId}
                  htmlFor={inputId}
                  className={labelClass}
                  data-hidden={field.isLabelVisible ? undefined : "true"}
                >
                  {field.label}
                </FieldLabelComponent>
              ) : null}
              <FieldContentComponent>
                <FileInputComponent
                  id={inputId}
                  name={field.name}
                  field={field}
                  value={(controllerField.value as FileFieldValue | null) ?? null}
                  disabled={submitDisabled || isSubmitting}
                  invalid={Boolean(errorMessage)}
                  onChange={controllerField.onChange}
                  {...(describedBy ? { describedBy } : {})}
                  {...(fileUploadUrl ? { uploadUrl: fileUploadUrl } : {})}
                />
                {renderFieldDescription(
                  FieldDescriptionComponent,
                  field.helper,
                  getSlotClass("field.helper", field),
                  helperId,
                )}
                {renderFieldError(
                  FieldErrorComponent,
                  errorMessage,
                  getSlotClass("field.error", field),
                  errorId,
                )}
              </FieldContentComponent>
            </FieldComponent>
          )}
        />
      );
    }

    if (field.type === "html") {
      return (
        <HtmlBlockComponent
          key={field.id}
          field={field}
          html={field.defaultValue ?? ""}
          className={getSlotClass("field.wrapper", field)}
        />
      );
    }

    if (field.type === "recaptcha") {
      if (!resolvedRecaptcha || resolvedRecaptcha.version !== "v2-checkbox") {
        return null;
      }

      return (
        <FieldComponent key={field.id} {...fieldRootProps}>
          {field.label ? (
            <FieldLabelComponent
              id={labelId}
              className={labelClass}
              data-hidden={field.isLabelVisible ? undefined : "true"}
            >
              {field.label}
            </FieldLabelComponent>
          ) : null}
          <FieldContentComponent>
            <div
              id={inputId}
              ref={recaptchaControl.containerRef}
              className={getSlotClass("field.recaptcha", field)}
              aria-describedby={describedBy}
              aria-labelledby={labelId}
              data-slot="field.recaptcha"
              data-recaptcha-version={resolvedRecaptcha.version}
              data-recaptcha-provider={resolvedRecaptcha.provider}
            />
            {renderFieldDescription(
              FieldDescriptionComponent,
              field.helper,
              getSlotClass("field.helper", field),
              helperId,
            )}
            {renderFieldError(
              FieldErrorComponent,
              recaptchaError ?? recaptchaControl.error,
              getSlotClass("field.error", field),
              errorId,
            )}
          </FieldContentComponent>
        </FieldComponent>
      );
    }

    return null;
  };

  const shouldRenderDetachedRecaptcha = Boolean(
    resolvedRecaptcha &&
      (resolvedRecaptcha.version === "v2-invisible" ||
        (resolvedRecaptcha.version === "v2-checkbox" && !recaptchaField)),
  );

  return (
    <form
      className={getSlotClass("form")}
      onSubmit={onSubmit}
      noValidate
      data-slot="form"
    >
      {renderBeforeFields}
      {rows.map((row) => (
        <FormRow
          key={row.id}
          inline={row.inline}
          isStacked={!inlineLayoutEnabled}
          columnTemplate={row.inline ? row.columnTemplate : undefined}
        >
          {row.fields.map((field) =>
            renderField(field, row.inline && inlineLayoutEnabled),
          )}
        </FormRow>
      ))}
      {renderAfterFields}
      {shouldRenderDetachedRecaptcha && resolvedRecaptcha ? (
        <div
          ref={recaptchaControl.containerRef}
          data-recaptcha-version={resolvedRecaptcha.version}
          data-recaptcha-provider={resolvedRecaptcha.provider}
          data-recaptcha-detached="true"
        />
      ) : null}
      {renderFieldError(
        FieldErrorComponent,
        submissionError,
        getSlotClass("field.error"),
      )}
    </form>
  );
};

export default FormRenderer;
