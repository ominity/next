import type { CSSProperties, ElementType } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import type { FormComponents, OminityFormField } from "../../types.js";
import FieldWrapper from "../FieldWrapper.js";
import FieldLabel from "../FieldLabel.js";
import FieldHelper from "../FieldHelper.js";
import FieldError from "../FieldError.js";

interface TextFieldProps {
  field: OminityFormField;
  type: "text" | "email";
  inputId: string;
  placeholder?: string | undefined;
  registerReturn: UseFormRegisterReturn;
  wrapperClass: string;
  wrapperStyle?: CSSProperties | undefined;
  labelClass: string;
  inputClass: string;
  helperClass: string;
  errorClass: string;
  helperId?: string | undefined;
  errorId?: string | undefined;
  helperText?: string | undefined;
  errorMessage?: string | null | undefined;
  describedBy?: string | undefined;
  components?: FormComponents | undefined;
}

const TextField = ({
  field,
  type,
  inputId,
  placeholder,
  registerReturn,
  wrapperClass,
  wrapperStyle,
  labelClass,
  inputClass,
  helperClass,
  errorClass,
  helperId,
  errorId,
  helperText,
  errorMessage,
  describedBy,
  components,
}: TextFieldProps) => {
  const InputComponent = (components?.Input ?? "input") as ElementType;

  return (
    <FieldWrapper
      field={field}
      className={wrapperClass}
      style={wrapperStyle}
    >
      <FieldLabel field={field} htmlFor={inputId} className={labelClass} />
      <InputComponent
        id={inputId}
        type={type}
        placeholder={placeholder}
        className={inputClass}
        aria-describedby={describedBy}
        data-slot="field.input"
        {...registerReturn}
      />
      <FieldHelper id={helperId} text={helperText} className={helperClass} />
      <FieldError id={errorId} message={errorMessage} className={errorClass} />
    </FieldWrapper>
  );
};

export default TextField;
