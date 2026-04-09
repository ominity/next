import { type ComponentType, type ReactNode } from "react";

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "select"
  | "checkbox"
  | "multicheckbox"
  | "hidden"
  | "metadata"
  | "honeypot"
  | "button";

export type MetadataFieldOption =
  | "page_url"
  | "page_title"
  | "referrer"
  | "user_agent"
  | "locale"
  | "ip_address";

export interface FieldValidationRule {
  rule: string;
  message?: string;
}

export interface FieldValidation {
  isRequired: boolean;
  minLength: number | null;
  maxLength: number | null;
  rules: FieldValidationRule[];
  message: string;
}

export interface FieldCss {
  classes: string | null;
  id: string | null;
  style: string | null;
}

export interface FieldOption {
  value: string;
  label: string;
  icon?: string | null;
  isDefault?: boolean;
  order?: number;
}

export interface OminityFormField {
  resource: "form_field";
  id: number;
  formId: number;
  type: FormFieldType;
  name: string;
  label: string;
  isLabelVisible: boolean;
  placeholder: string;
  helper: string;
  defaultValue: string | null;
  width: string | null;
  isInline: boolean;
  css: FieldCss;
  validation: FieldValidation;
  options: Array<FieldOption> | Array<string>;
  order: number;
  updatedAt: string;
  createdAt: string;
}

export interface OminityForm {
  resource: "form";
  id: number;
  name: string;
  title: string;
  description: string;
  submissions: number;
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
  _embedded: {
    form_fields: OminityFormField[];
  };
}

export type ThemeSlot =
  | "form"
  | "field.wrapper"
  | "field.label"
  | "field.labelHidden"
  | "field.input"
  | "field.textarea"
  | "field.select"
  | "field.checkbox"
  | "field.multicheckbox"
  | "field.button"
  | "field.helper"
  | "field.error"
  | "field.optionWrapper"
  | "field.optionLabel"
  | "field.optionInput"
  | "field.phoneWrapper"
  | "field.phoneCountryButton"
  | "field.phoneDropdown"
  | "field.phoneSearch"
  | "field.phoneOption"
  | "field.phoneNumberInput";

export type SlotClassValue = string | null | undefined | SlotClassValue[];

export type FormTheme = Record<ThemeSlot, string>;

export type PassthroughClasses = Partial<Record<ThemeSlot, SlotClassValue>>;

export interface PhoneCountry {
  code: string;
  name: string;
  dialCode: string;
  flag?: string;
}

export interface PhoneFieldValue {
  countryCode: string;
  dialCode: string;
  nationalNumber: string;
  e164: string | null;
}

export type MetadataValue = Partial<Record<MetadataFieldOption, string | null>>;

export interface RecaptchaBaseConfig {
  siteKey: string;
  badge?: "bottomright" | "bottomleft" | "inline";
}

export interface RecaptchaV3Config extends RecaptchaBaseConfig {
  version: "v3";
  action?: string;
}

export interface RecaptchaV2CheckboxConfig extends RecaptchaBaseConfig {
  version: "v2-checkbox";
  theme?: "light" | "dark";
  size?: "compact" | "normal";
  tabIndex?: number;
}

export interface RecaptchaV2InvisibleConfig extends RecaptchaBaseConfig {
  version: "v2-invisible";
  action?: string;
}

export type RecaptchaConfig =
  | RecaptchaV3Config
  | RecaptchaV2CheckboxConfig
  | RecaptchaV2InvisibleConfig;

export interface SubmissionPayload {
  formId: number;
  userId: number | null;
  data: Record<string, unknown>;
  recaptchaToken: string | null;
  honeypotFields?: string[];
}

export interface SubmitResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: unknown;
}

type GenericComponent = ComponentType<Record<string, unknown>>;

export interface FormComponents {
  Input?: GenericComponent;
  Textarea?: GenericComponent;
  Select?: GenericComponent;
  Checkbox?: GenericComponent;
  Button?: GenericComponent;
  PhoneInput?: GenericComponent;
}

export type InlineBreakpoint = number | "sm" | "md" | "lg" | "xl" | "2xl";

export interface FormRendererProps<T = unknown> {
  form: OminityForm;
  submitUrl?: string;
  userId?: number | null;
  recaptcha?: RecaptchaConfig;
  styled?: boolean;
  themeOverride?: Partial<FormTheme>;
  pt?: PassthroughClasses;
  metadataOverrides?: MetadataValue;
  initialValues?: Record<string, unknown>;
  countriesOverride?: PhoneCountry[];
  defaultPhoneCountry?: string;
  locale?: string;
  submitDisabled?: boolean;
  renderBeforeFields?: ReactNode;
  renderAfterFields?: ReactNode;
  onSubmitSuccess?: (result: SubmitResult<T>) => void;
  onSubmitError?: (result: SubmitResult<never>) => void;
  components?: FormComponents;
  inlineBreakpoint?: InlineBreakpoint;
}

export interface CreateSubmitHandlerConfig {
  ominityApiKey: string;
  ominityBaseUrl?: string;
  recaptchaSecret?: string;
  recaptchaVerificationUrl?: string;
  fetchImpl?: typeof fetch;
  forwardSubmission?: (params: {
    payload: SubmissionPayload;
    request: Request;
    baseUrl: string;
    ominityApiKey: string;
    fetchImpl: typeof fetch;
  }) => Promise<
    | Response
    | {
      status: number;
      body?: unknown;
      headers?: Readonly<Record<string, string>>;
    }
    | unknown
  >;
  enrichMetadata?: (params: {
    request: Request;
    payload: SubmissionPayload;
  }) => Promise<MetadataValue | null | undefined> | MetadataValue | null | undefined;
  onBeforeForward?: (
    payload: SubmissionPayload,
    request: Request,
  ) => Promise<SubmissionPayload | void> | SubmissionPayload | void;
}
