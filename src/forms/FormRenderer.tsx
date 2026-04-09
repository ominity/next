"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Controller,
  type FieldErrors,
  type RegisterOptions,
  useForm,
} from "react-hook-form";
import {
  type FormRendererProps,
  type FormTheme,
  type MetadataValue,
  type OminityFormField,
  type PhoneFieldValue,
  type ThemeSlot,
  type InlineBreakpoint,
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
import type { SubmitResult, SubmissionPayload } from "./types.js";
import {
  FieldError,
  TextField,
  TextareaField,
  SelectField,
  CheckboxField,
  MultiCheckboxField,
  PhoneField,
  ButtonField,
  HiddenField,
  HoneypotField,
  MetadataField,
  FormRow,
} from "./components.js";
import { resolveGridColumns } from "./utils/layout.js";

type FormValues = Record<string, unknown>;

const SUPPORTED_FIELDS: Set<string> = new Set([
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
  renderBeforeFields,
  renderAfterFields,
  onSubmitSuccess,
  onSubmitError,
  components,
  inlineBreakpoint = "md",
}: FormRendererProps<T>) => {
  const fields = useMemo(() => {
    const incoming = form?._embedded?.form_fields ?? [];
    return sortFields(incoming).filter((field) =>
      SUPPORTED_FIELDS.has(field.type),
    );
  }, [form]);

  const metadataFields = useMemo(
    () => fields.filter((field) => field.type === "metadata"),
    [fields],
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
    () => fields.some((field) => field.isInline),
    [fields],
  );

  const inlineLayoutEnabled = hasInlineFields && !isBelowInlineBreakpoint;

  const rows = useMemo<FieldRow[]>(() => {
    if (!fields.length) {
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

    fields.forEach((field) => {
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
  }, [fields]);

  const theme = useMemo(
    () => resolveTheme(styled, themeOverride),
    [styled, themeOverride],
  );

  const defaultValues = useMemo(
    () => buildDefaultValues(fields, metadataValues, initialValues),
    [fields, metadataValues, initialValues],
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

  const recaptchaControl = useRecaptcha(recaptcha);

  const getSlotClass = (slot: ThemeSlot, field?: OminityFormField): string =>
    resolveSlotClasses({
      slot,
      theme,
      pt,
      fieldCss: field?.css?.classes ?? null,
    });

  const honeypotFields = useMemo(
    () => fields.filter((field) => field.type === "honeypot"),
    [fields],
  );
  const honeypotFieldNames = useMemo(
    () => honeypotFields.map((field) => field.name),
    [honeypotFields],
  );

  const normalizeData = (values: FormValues): Record<string, unknown> =>
    normalizeSubmissionData(values, fields);

  const onSubmit = handleSubmit(async (values) => {
    if (submitDisabled) {
      return;
    }

    setSubmissionError(null);
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

    let recaptchaToken: string | null = null;
    if (recaptcha) {
      recaptchaToken = await recaptchaControl.execute();
      if (!recaptchaToken) {
        setSubmissionError("Complete the security check.");
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
      const responseBody = await response
        .json()
        .catch(() => ({})) as Record<string, unknown>;
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

      reset(buildDefaultValues(fields, metadataValues, initialValues));
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

    const labelClass = mergeClasses(
      getSlotClass("field.label", field),
      !field.isLabelVisible ? getSlotClass("field.labelHidden", field) : "",
    );

    const wrapperStyle = inlineRowActive ? { width: "100%" } : undefined;

    const describedBy =
      [helperId, errorId].filter(Boolean).join(" ") || undefined;

    switch (field.type) {
      case "metadata": {
        const registers = getMetadataOptions(field).map((option) => {
          const name = `${field.name}.${option}`;
          return {
            name,
            registerReturn: register(name),
          };
        });
        return (
          <MetadataField key={field.id} field={field} registers={registers} />
        );
      }
      case "hidden":
        return (
          <HiddenField
            key={field.id}
            registerReturn={register(field.name)}
          />
        );
      case "honeypot":
        return (
          <HoneypotField
            key={field.id}
            field={field}
            inputId={inputId}
            registerReturn={register(field.name)}
          />
        );
      case "button":
        return (
          <ButtonField
            key={field.id}
            field={field}
            helperId={helperId}
            helperText={field.helper}
            wrapperClass={getSlotClass("field.wrapper", field)}
            wrapperStyle={wrapperStyle}
            buttonClass={getSlotClass("field.button", field)}
            helperClass={getSlotClass("field.helper", field)}
            disabled={submitDisabled || isSubmitting}
            components={components}
          />
        );
      case "text":
      case "email": {
        return (
          <TextField
            key={field.id}
            field={field}
            type={field.type === "email" ? "email" : "text"}
            inputId={inputId}
            placeholder={field.placeholder || undefined}
            registerReturn={register(field.name, getRegisterRules(field))}
            wrapperClass={getSlotClass("field.wrapper", field)}
            wrapperStyle={wrapperStyle}
            labelClass={labelClass}
            inputClass={getSlotClass("field.input", field)}
            helperClass={getSlotClass("field.helper", field)}
            errorClass={getSlotClass("field.error", field)}
            helperId={helperId}
            errorId={errorId}
            helperText={field.helper}
            errorMessage={errorMessage}
            describedBy={describedBy}
            components={components}
          />
        );
      }
      case "textarea":
        return (
          <TextareaField
            key={field.id}
            field={field}
            inputId={inputId}
            placeholder={field.placeholder || undefined}
            registerReturn={register(field.name, getRegisterRules(field))}
            wrapperClass={getSlotClass("field.wrapper", field)}
            wrapperStyle={wrapperStyle}
            labelClass={labelClass}
            textareaClass={getSlotClass("field.textarea", field)}
            helperClass={getSlotClass("field.helper", field)}
            errorClass={getSlotClass("field.error", field)}
            helperId={helperId}
            errorId={errorId}
            helperText={field.helper}
            errorMessage={errorMessage}
            describedBy={describedBy}
            components={components}
          />
        );
      case "select":
        return (
          <SelectField
            key={field.id}
            field={field}
            inputId={inputId}
            placeholder={field.placeholder || undefined}
            options={getFieldOptions(field)}
            registerReturn={register(field.name, getRegisterRules(field))}
            wrapperClass={getSlotClass("field.wrapper", field)}
            wrapperStyle={wrapperStyle}
            labelClass={labelClass}
            selectClass={getSlotClass("field.select", field)}
            helperClass={getSlotClass("field.helper", field)}
            errorClass={getSlotClass("field.error", field)}
            helperId={helperId}
            errorId={errorId}
            helperText={field.helper}
            errorMessage={errorMessage}
            describedBy={describedBy}
            components={components}
          />
        );
      case "checkbox":
        return (
          <CheckboxField
            key={field.id}
            field={field}
            inputId={inputId}
            registerReturn={register(field.name, getRegisterRules(field))}
            wrapperClass={getSlotClass("field.wrapper", field)}
            wrapperStyle={wrapperStyle}
            labelClass={labelClass}
            checkboxClass={getSlotClass("field.checkbox", field)}
            helperClass={getSlotClass("field.helper", field)}
            errorClass={getSlotClass("field.error", field)}
            helperId={helperId}
            errorId={errorId}
            helperText={field.helper}
            errorMessage={errorMessage}
            describedBy={describedBy}
            components={components}
          />
        );
      case "multicheckbox":
        return (
          <Controller
            key={field.id}
            control={control}
            name={field.name}
            defaultValue={[]}
            render={({ field: controllerField }) => (
              <MultiCheckboxField
                field={field}
                options={getFieldOptions(field)}
                selectedValues={
                  Array.isArray(controllerField.value)
                    ? (controllerField.value as string[])
                    : []
                }
                onChange={controllerField.onChange}
                wrapperClass={getSlotClass("field.wrapper", field)}
                wrapperStyle={wrapperStyle}
                labelClass={labelClass}
                optionClass={mergeClasses(
                  getSlotClass("field.optionWrapper", field),
                  getSlotClass("field.optionLabel", field),
                )}
                optionInputClass={mergeClasses(
                  getSlotClass("field.optionInput", field),
                  getSlotClass("field.multicheckbox", field),
                )}
                helperClass={getSlotClass("field.helper", field)}
                errorClass={getSlotClass("field.error", field)}
                helperId={helperId}
                errorId={errorId}
                helperText={field.helper}
                errorMessage={errorMessage}
                components={components}
              />
            )}
          />
        );
      case "phone":
        return (
          <Controller
            key={field.id}
            control={control}
            name={field.name}
            rules={{
              validate: (rawValue: unknown) => {
                const phoneValue = rawValue as PhoneFieldValue | null;
                if (
                  !field.validation?.isRequired &&
                  !phoneValue?.nationalNumber
                ) {
                  return true;
                }
                if (phoneValue?.e164) {
                  return true;
                }
                return field.validation?.message || "Enter a valid phone number.";
              },
            }}
            render={({ field: controllerField }) => (
              <PhoneField
                field={field}
                value={(controllerField.value as PhoneFieldValue) || null}
                onChange={controllerField.onChange}
                countries={countriesOverride}
                defaultCountry={defaultPhoneCountry}
                placeholder={field.placeholder || "Phone number"}
                disabled={submitDisabled || isSubmitting}
                wrapperClass={getSlotClass("field.wrapper", field)}
                wrapperStyle={wrapperStyle}
                labelClass={labelClass}
                helperClass={getSlotClass("field.helper", field)}
                errorClass={getSlotClass("field.error", field)}
                helperId={helperId}
                errorId={errorId}
                helperText={field.helper}
                errorMessage={errorMessage}
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
                components={components}
              />
            )}
          />
        );
      default:
        return null;
    }
  };

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
      {recaptcha && recaptcha.version !== "v3" && (
        <div
          ref={recaptchaControl.containerRef}
          data-recaptcha-version={recaptcha.version}
        />
      )}
      <FieldError
        className={getSlotClass("field.error")}
        message={submissionError}
      />
    </form>
  );
};

export default FormRenderer;
