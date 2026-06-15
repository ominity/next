import {
  type CSSProperties,
  type ReactNode,
} from "react";

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "password"
  | "select"
  | "multiselect"
  | "checkbox"
  | "multicheckbox"
  | "radio"
  | "color"
  | "url"
  | "number"
  | "date"
  | "time"
  | "datetime"
  | "file"
  | "hidden"
  | "metadata"
  | "honeypot"
  | "recaptcha"
  | "button"
  | "html";

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

export type FieldOptionsValue =
  | Array<FieldOption>
  | Array<string>
  | Record<string, unknown>;

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
  options: FieldOptionsValue;
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
  | "field.recaptcha"
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

export interface FileFieldValue {
  key: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface PendingFileUploadRequest {
  filename: string;
  mimeType: string;
  size: number;
}

export interface PendingFileUploadResponse {
  key: string;
  url: string;
  headers: Record<string, string>;
  publicUrl: string;
}

export type MetadataValue = Partial<Record<MetadataFieldOption, string | null>>;

export interface RecaptchaFieldValue {
  token: string;
  ip_address?: string | null;
  user_agent?: string | null;
  score?: number | null;
  action?: string | null;
  hostname?: string | null;
  provider?: RecaptchaProvider;
  version?: RecaptchaVersion;
  verified_at?: string | null;
}

export type RecaptchaProvider = "classic" | "enterprise";
export type RecaptchaVersion = "v3" | "v2-checkbox" | "v2-invisible";

export interface RecaptchaBaseConfig {
  siteKey: string;
  provider?: RecaptchaProvider;
  scriptUrl?: string;
  clientApiNamespace?: string;
  badge?: "bottomright" | "bottomleft" | "inline";
}

export interface RecaptchaV3Config extends RecaptchaBaseConfig {
  version: RecaptchaVersion & "v3";
  action?: string;
}

export interface RecaptchaV2CheckboxConfig extends RecaptchaBaseConfig {
  version: RecaptchaVersion & "v2-checkbox";
  theme?: "light" | "dark";
  size?: "compact" | "normal";
  tabIndex?: number;
}

export interface RecaptchaV2InvisibleConfig extends RecaptchaBaseConfig {
  version: RecaptchaVersion & "v2-invisible";
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

export interface FormFieldRootAdapterProps {
  children?: ReactNode | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  orientation?: "vertical" | "horizontal" | "responsive" | undefined;
  "data-field-type"?: string | undefined;
  "data-inline"?: string | undefined;
  "data-invalid"?: string | undefined;
  "data-disabled"?: string | undefined;
}

export interface FormFieldContentAdapterProps {
  children?: ReactNode | undefined;
  className?: string | undefined;
}

export interface FormFieldLabelAdapterProps {
  children?: ReactNode | undefined;
  className?: string | undefined;
  id?: string | undefined;
  htmlFor?: string | undefined;
  "data-hidden"?: string | undefined;
}

export interface FormFieldDescriptionAdapterProps {
  children?: ReactNode | undefined;
  className?: string | undefined;
  id?: string | undefined;
}

export interface FormFieldErrorAdapterProps {
  children?: ReactNode | undefined;
  className?: string | undefined;
  id?: string | undefined;
  errors?: Array<{ message?: string | undefined }> | undefined;
}

export interface FormFieldSetAdapterProps {
  children?: ReactNode | undefined;
  className?: string | undefined;
}

export interface FormFieldLegendAdapterProps {
  children?: ReactNode | undefined;
  className?: string | undefined;
  id?: string | undefined;
}

export interface FormFieldGroupAdapterProps {
  children?: ReactNode | undefined;
  className?: string | undefined;
}

export interface FormInputAdapterProps {
  id?: string | undefined;
  name?: string | undefined;
  type?: string | undefined;
  value?: string | number | readonly string[] | undefined;
  defaultValue?: string | number | readonly string[] | undefined;
  placeholder?: string | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
  autoComplete?: string | undefined;
  inputMode?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | undefined;
  invalid?: boolean | undefined;
  onChange?: (...args: unknown[]) => void;
  onBlur?: (...args: unknown[]) => void;
  ref?: ((instance: unknown) => void) | undefined;
}

export interface FormTextareaAdapterProps {
  id?: string | undefined;
  name?: string | undefined;
  value?: string | undefined;
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
  rows?: number | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | undefined;
  invalid?: boolean | undefined;
  onChange?: (...args: unknown[]) => void;
  onBlur?: (...args: unknown[]) => void;
  ref?: ((instance: unknown) => void) | undefined;
}

export interface FormSelectAdapterProps {
  id: string;
  name: string;
  value: string;
  placeholder?: string | undefined;
  options: FieldOption[];
  disabled?: boolean | undefined;
  invalid?: boolean | undefined;
  describedBy?: string | undefined;
  onValueChange: (value: string) => void;
}

export interface FormMultiSelectAdapterProps {
  id: string;
  name: string;
  value: string[];
  placeholder?: string | undefined;
  options: FieldOption[];
  disabled?: boolean | undefined;
  invalid?: boolean | undefined;
  describedBy?: string | undefined;
  onValueChange: (value: string[]) => void;
}

export interface FormCheckboxAdapterProps {
  id: string;
  name: string;
  checked: boolean;
  disabled?: boolean | undefined;
  invalid?: boolean | undefined;
  describedBy?: string | undefined;
  onCheckedChange: (checked: boolean) => void;
}

export interface FormRadioGroupAdapterProps {
  id: string;
  name: string;
  value: string;
  options: FieldOption[];
  disabled?: boolean | undefined;
  invalid?: boolean | undefined;
  describedBy?: string | undefined;
  onValueChange: (value: string) => void;
}

export interface FormRadioItemAdapterProps {
  id: string;
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean | undefined;
  invalid?: boolean | undefined;
  onCheckedChange: (checked: boolean) => void;
  children?: ReactNode | undefined;
}

export interface FormButtonAdapterProps {
  children?: ReactNode | undefined;
  className?: string | undefined;
  type?: "button" | "submit" | "reset" | undefined;
  disabled?: boolean | undefined;
  onClick?: (...args: unknown[]) => void;
}

export interface FormPhoneInputAdapterProps {
  value: PhoneFieldValue | null;
  onChange: (value: PhoneFieldValue | null) => void;
  countries?: PhoneCountry[] | undefined;
  defaultCountry?: string | undefined;
  placeholder?: string | undefined;
  searchPlaceholder?: string | undefined;
  noMatchesLabel?: string | undefined;
  disabled?: boolean | undefined;
  slotClasses?: {
    control: string;
    countryButton: string;
    dropdown: string;
    searchInput: string;
    option: string;
    numberInput: string;
  };
}

export interface FormFileInputAdapterProps {
  id: string;
  name: string;
  field: OminityFormField;
  value: FileFieldValue | null;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  uploadUrl?: string;
  onChange: (value: FileFieldValue | null) => void;
}

export interface FormHtmlBlockAdapterProps {
  field: OminityFormField;
  html: string;
  className?: string | undefined;
}

type AdapterComponent<TProps> = (props: TProps) => globalThis.JSX.Element | null;

export interface FormAdapters {
  Field?: AdapterComponent<FormFieldRootAdapterProps>;
  FieldContent?: AdapterComponent<FormFieldContentAdapterProps>;
  FieldLabel?: AdapterComponent<FormFieldLabelAdapterProps>;
  FieldDescription?: AdapterComponent<FormFieldDescriptionAdapterProps>;
  FieldError?: AdapterComponent<FormFieldErrorAdapterProps>;
  FieldSet?: AdapterComponent<FormFieldSetAdapterProps>;
  FieldLegend?: AdapterComponent<FormFieldLegendAdapterProps>;
  FieldGroup?: AdapterComponent<FormFieldGroupAdapterProps>;
  Input?: AdapterComponent<FormInputAdapterProps>;
  Textarea?: AdapterComponent<FormTextareaAdapterProps>;
  Select?: AdapterComponent<FormSelectAdapterProps>;
  MultiSelect?: AdapterComponent<FormMultiSelectAdapterProps>;
  Checkbox?: AdapterComponent<FormCheckboxAdapterProps>;
  RadioGroup?: AdapterComponent<FormRadioGroupAdapterProps>;
  RadioItem?: AdapterComponent<FormRadioItemAdapterProps>;
  Button?: AdapterComponent<FormButtonAdapterProps>;
  PhoneInput?: AdapterComponent<FormPhoneInputAdapterProps>;
  FileInput?: AdapterComponent<FormFileInputAdapterProps>;
  HtmlBlock?: AdapterComponent<FormHtmlBlockAdapterProps>;
}

export type FormComponents = FormAdapters;

export type InlineBreakpoint = number | "sm" | "md" | "lg" | "xl" | "2xl";

export interface FormMessageTemplateParams {
  field?: string;
  min?: number;
  max?: number;
}

export interface FormValidationMessages {
  invalid: string;
  required: string;
  minLength: string;
  maxLength: string;
  email: string;
  phone: string;
  recaptcha: string;
}

export interface FormStatusMessages {
  processError: string;
  submissionBlocked: string;
  securityUnavailable: string;
  submitFailed: string;
  submitUnavailable: string;
}

export interface FormAccessibilityMessages {
  honeypotLabel: string;
}

export interface FormMessages {
  validation: FormValidationMessages;
  status: FormStatusMessages;
  accessibility: FormAccessibilityMessages;
}

export interface FormMessageOverrides {
  validation?: Partial<FormValidationMessages>;
  status?: Partial<FormStatusMessages>;
  accessibility?: Partial<FormAccessibilityMessages>;
}

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
  validationOnly?: boolean;
  renderBeforeFields?: ReactNode;
  renderAfterFields?: ReactNode;
  onSubmitValid?: (values: Record<string, unknown>) => void | Promise<void>;
  onSubmitSuccess?: (result: SubmitResult<T>) => void;
  onSubmitError?: (result: SubmitResult<never>) => void;
  adapters?: FormAdapters;
  components?: FormAdapters;
  inlineBreakpoint?: InlineBreakpoint;
  fileUploadUrl?: string;
  messages?: FormMessageOverrides;
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
