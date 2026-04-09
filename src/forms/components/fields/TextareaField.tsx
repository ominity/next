import type { CSSProperties, ElementType } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import type { FormComponents, OminityFormField } from "../../types.js";
import FieldWrapper from "../FieldWrapper.js";
import FieldLabel from "../FieldLabel.js";
import FieldHelper from "../FieldHelper.js";
import FieldError from "../FieldError.js";

interface TextareaFieldProps {
  field: OminityFormField;
  inputId: string;
  placeholder?: string | undefined;
  registerReturn: UseFormRegisterReturn;
  wrapperClass: string;
  wrapperStyle?: CSSProperties | undefined;
  labelClass: string;
  textareaClass: string;
  helperClass: string;
  errorClass: string;
  helperId?: string | undefined;
  errorId?: string | undefined;
  helperText?: string | undefined;
  errorMessage?: string | null | undefined;
  describedBy?: string | undefined;
  components?: FormComponents | undefined;
}

const TextareaField = ({
  field,
  inputId,
  placeholder,
  registerReturn,
  wrapperClass,
  wrapperStyle,
  labelClass,
  textareaClass,
  helperClass,
  errorClass,
  helperId,
  errorId,
  helperText,
  errorMessage,
  describedBy,
  components,
}: TextareaFieldProps) => {
  const TextareaComponent = (components?.Textarea ?? "textarea") as ElementType;

  return (
    <FieldWrapper
      field={field}
      className={wrapperClass}
      style={wrapperStyle}
    >
      <FieldLabel field={field} htmlFor={inputId} className={labelClass} />
      <TextareaComponent
        id={inputId}
        placeholder={placeholder}
        className={textareaClass}
        aria-describedby={describedBy}
        data-slot="field.textarea"
        {...registerReturn}
      />
      <FieldHelper id={helperId} text={helperText} className={helperClass} />
      <FieldError id={errorId} message={errorMessage} className={errorClass} />
    </FieldWrapper>
  );
};

export default TextareaField;
