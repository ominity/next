import type { ComponentType } from "react";

import type { FormComponents } from "./types.js";

type GenericComponent = ComponentType<Record<string, unknown>>;

export interface ShadcnFormComponentsInput {
  readonly Input: GenericComponent;
  readonly Textarea?: GenericComponent;
  readonly Select?: GenericComponent;
  readonly Checkbox?: GenericComponent;
  readonly Button?: GenericComponent;
  readonly PhoneInput?: GenericComponent;
}

export function createShadcnFormComponents(
  input: ShadcnFormComponentsInput,
): FormComponents {
  return {
    Input: input.Input,
    ...(typeof input.Textarea !== "undefined" ? { Textarea: input.Textarea } : {}),
    ...(typeof input.Select !== "undefined" ? { Select: input.Select } : {}),
    ...(typeof input.Checkbox !== "undefined" ? { Checkbox: input.Checkbox } : {}),
    ...(typeof input.Button !== "undefined" ? { Button: input.Button } : {}),
    ...(typeof input.PhoneInput !== "undefined" ? { PhoneInput: input.PhoneInput } : {}),
  };
}

