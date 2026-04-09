import type { CSSProperties, ElementType } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import type { FormComponents, OminityFormField } from "../../types.js";
import FieldWrapper from "../FieldWrapper.js";
import FieldLabel from "../FieldLabel.js";
import FieldHelper from "../FieldHelper.js";
import FieldError from "../FieldError.js";

interface CheckboxFieldProps {
  field: OminityFormField;
  inputId: string;
  registerReturn: UseFormRegisterReturn;
  wrapperClass: string;
  wrapperStyle?: CSSProperties | undefined;
  labelClass: string;
  checkboxClass: string;
  helperClass: string;
  errorClass: string;
  helperId?: string | undefined;
  errorId?: string | undefined;
  helperText?: string | undefined;
  errorMessage?: string | null | undefined;
  describedBy?: string | undefined;
  components?: FormComponents | undefined;
}

const CheckboxField = ({
  field,
  inputId,
  registerReturn,
  wrapperClass,
  wrapperStyle,
  labelClass,
  checkboxClass,
  helperClass,
  errorClass,
  helperId,
  errorId,
  helperText,
  errorMessage,
  describedBy,
  components,
}: CheckboxFieldProps) => {
  const CheckboxComponent = (components?.Checkbox ?? "input") as ElementType;

  return (
    <FieldWrapper
      field={field}
      className={wrapperClass}
      style={wrapperStyle}
    >
      <FieldLabel field={field} className={labelClass}>
        <CheckboxComponent
          id={inputId}
          type="checkbox"
          className={checkboxClass}
          aria-describedby={describedBy}
          data-slot="field.checkbox"
          {...registerReturn}
        />
        <span>{field.label}</span>
      </FieldLabel>
      <FieldHelper id={helperId} text={helperText} className={helperClass} />
      <FieldError id={errorId} message={errorMessage} className={errorClass} />
    </FieldWrapper>
  );
};

export default CheckboxField;
