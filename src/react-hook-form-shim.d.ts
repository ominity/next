declare module "react-hook-form" {
  import type { ReactNode } from "react";

  export type FieldValues = Record<string, unknown>;

  export interface FieldError {
    message?: string;
  }

  export type FieldErrors<TFieldValues extends FieldValues = FieldValues> =
    Partial<Record<keyof TFieldValues | string, FieldError>>;

  export interface ValidationRule<TValue = unknown> {
    value: TValue;
    message: string;
  }

  export interface RegisterOptions<TFieldValues extends FieldValues = FieldValues> {
    required?: string | boolean;
    minLength?: ValidationRule<number>;
    maxLength?: ValidationRule<number>;
    pattern?: ValidationRule<RegExp>;
    validate?: (value: unknown, values?: TFieldValues) => boolean | string;
  }

  export interface UseFormRegisterReturn {
    name: string;
    onBlur?: (...args: ReadonlyArray<unknown>) => void;
    onChange?: (...args: ReadonlyArray<unknown>) => void;
    ref?: (instance: unknown) => void;
    [key: string]: unknown;
  }

  export interface ControllerRenderField {
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur?: () => void;
    name?: string;
    ref?: (instance: unknown) => void;
  }

  export interface UseFormSetValueConfig {
    shouldDirty?: boolean;
    shouldTouch?: boolean;
  }

  export interface UseFormReturn<TFieldValues extends FieldValues = FieldValues> {
    control: unknown;
    register: (
      name: string,
      options?: RegisterOptions<TFieldValues>,
    ) => UseFormRegisterReturn;
    handleSubmit: (
      callback: (values: TFieldValues) => void | Promise<void>,
    ) => (event?: unknown) => void | Promise<void>;
    reset: (values?: Partial<TFieldValues>) => void;
    setValue: (
      name: string,
      value: unknown,
      options?: UseFormSetValueConfig,
    ) => void;
    formState: {
      errors: FieldErrors<TFieldValues>;
    };
  }

  export interface UseFormProps<TFieldValues extends FieldValues = FieldValues> {
    defaultValues?: Partial<TFieldValues>;
    mode?: string;
    reValidateMode?: string;
  }

  export function useForm<TFieldValues extends FieldValues = FieldValues>(
    props?: UseFormProps<TFieldValues>,
  ): UseFormReturn<TFieldValues>;

  export interface ControllerProps<TFieldValues extends FieldValues = FieldValues> {
    control: unknown;
    name: string;
    defaultValue?: unknown;
    rules?: RegisterOptions<TFieldValues>;
    render: (input: {
      field: ControllerRenderField;
    }) => ReactNode;
  }

  export function Controller<TFieldValues extends FieldValues = FieldValues>(
    props: ControllerProps<TFieldValues>,
  ): import("react").ReactElement | null;
}
