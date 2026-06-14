import type { ComponentType } from "react";

import type {
  FormAdapters,
  FormButtonAdapterProps,
  FormCheckboxAdapterProps,
  FormFieldContentAdapterProps,
  FormFieldDescriptionAdapterProps,
  FormFieldErrorAdapterProps,
  FormFieldGroupAdapterProps,
  FormFieldLabelAdapterProps,
  FormFieldLegendAdapterProps,
  FormFieldRootAdapterProps,
  FormFieldSetAdapterProps,
  FormFileInputAdapterProps,
  FormHtmlBlockAdapterProps,
  FormInputAdapterProps,
  FormMultiSelectAdapterProps,
  FormPhoneInputAdapterProps,
  FormRadioGroupAdapterProps,
  FormRadioItemAdapterProps,
  FormSelectAdapterProps,
  FormTextareaAdapterProps,
} from "./types.js";

export interface ShadcnFormAdaptersInput {
  readonly Field?: ComponentType<FormFieldRootAdapterProps>;
  readonly FieldContent?: ComponentType<FormFieldContentAdapterProps>;
  readonly FieldLabel?: ComponentType<FormFieldLabelAdapterProps>;
  readonly FieldDescription?: ComponentType<FormFieldDescriptionAdapterProps>;
  readonly FieldError?: ComponentType<FormFieldErrorAdapterProps>;
  readonly FieldSet?: ComponentType<FormFieldSetAdapterProps>;
  readonly FieldLegend?: ComponentType<FormFieldLegendAdapterProps>;
  readonly FieldGroup?: ComponentType<FormFieldGroupAdapterProps>;
  readonly Input: ComponentType<FormInputAdapterProps>;
  readonly Textarea?: ComponentType<FormTextareaAdapterProps>;
  readonly Select?: ComponentType<FormSelectAdapterProps>;
  readonly MultiSelect?: ComponentType<FormMultiSelectAdapterProps>;
  readonly Checkbox?: ComponentType<FormCheckboxAdapterProps>;
  readonly RadioGroup?: ComponentType<FormRadioGroupAdapterProps>;
  readonly RadioItem?: ComponentType<FormRadioItemAdapterProps>;
  readonly Button?: ComponentType<FormButtonAdapterProps>;
  readonly PhoneInput?: ComponentType<FormPhoneInputAdapterProps>;
  readonly FileInput?: ComponentType<FormFileInputAdapterProps>;
  readonly HtmlBlock?: ComponentType<FormHtmlBlockAdapterProps>;
}

export function createShadcnFormAdapters(
  input: ShadcnFormAdaptersInput,
): FormAdapters {
  return {
    ...(typeof input.Field !== "undefined" ? { Field: input.Field } : {}),
    ...(typeof input.FieldContent !== "undefined" ? { FieldContent: input.FieldContent } : {}),
    ...(typeof input.FieldLabel !== "undefined" ? { FieldLabel: input.FieldLabel } : {}),
    ...(typeof input.FieldDescription !== "undefined" ? { FieldDescription: input.FieldDescription } : {}),
    ...(typeof input.FieldError !== "undefined" ? { FieldError: input.FieldError } : {}),
    ...(typeof input.FieldSet !== "undefined" ? { FieldSet: input.FieldSet } : {}),
    ...(typeof input.FieldLegend !== "undefined" ? { FieldLegend: input.FieldLegend } : {}),
    ...(typeof input.FieldGroup !== "undefined" ? { FieldGroup: input.FieldGroup } : {}),
    Input: input.Input,
    ...(typeof input.Textarea !== "undefined" ? { Textarea: input.Textarea } : {}),
    ...(typeof input.Select !== "undefined" ? { Select: input.Select } : {}),
    ...(typeof input.MultiSelect !== "undefined" ? { MultiSelect: input.MultiSelect } : {}),
    ...(typeof input.Checkbox !== "undefined" ? { Checkbox: input.Checkbox } : {}),
    ...(typeof input.RadioGroup !== "undefined" ? { RadioGroup: input.RadioGroup } : {}),
    ...(typeof input.RadioItem !== "undefined" ? { RadioItem: input.RadioItem } : {}),
    ...(typeof input.Button !== "undefined" ? { Button: input.Button } : {}),
    ...(typeof input.PhoneInput !== "undefined" ? { PhoneInput: input.PhoneInput } : {}),
    ...(typeof input.FileInput !== "undefined" ? { FileInput: input.FileInput } : {}),
    ...(typeof input.HtmlBlock !== "undefined" ? { HtmlBlock: input.HtmlBlock } : {}),
  };
}
