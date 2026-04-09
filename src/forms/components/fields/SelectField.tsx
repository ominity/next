import type { CSSProperties, ElementType } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import type { FieldOption, FormComponents, OminityFormField } from "../../types.js";
import FieldWrapper from "../FieldWrapper.js";
import FieldLabel from "../FieldLabel.js";
import FieldHelper from "../FieldHelper.js";
import FieldError from "../FieldError.js";

interface SelectFieldProps {
  field: OminityFormField;
  inputId: string;
  placeholder?: string | undefined;
  options: FieldOption[];
  registerReturn: UseFormRegisterReturn;
  wrapperClass: string;
  wrapperStyle?: CSSProperties | undefined;
  labelClass: string;
  selectClass: string;
  helperClass: string;
  errorClass: string;
  helperId?: string | undefined;
  errorId?: string | undefined;
  helperText?: string | undefined;
  errorMessage?: string | null | undefined;
  describedBy?: string | undefined;
  components?: FormComponents | undefined;
}

const SelectField = ({
  field,
  inputId,
  placeholder,
  options,
  registerReturn,
  wrapperClass,
  wrapperStyle,
  labelClass,
  selectClass,
  helperClass,
  errorClass,
  helperId,
  errorId,
  helperText,
  errorMessage,
  describedBy,
  components,
}: SelectFieldProps) => {
  const SelectComponent = (components?.Select ?? "select") as ElementType;

  return (
    <FieldWrapper
      field={field}
      className={wrapperClass}
      style={wrapperStyle}
    >
      <FieldLabel field={field} htmlFor={inputId} className={labelClass} />
      <SelectComponent
        id={inputId}
        className={selectClass}
        aria-describedby={describedBy}
        data-slot="field.select"
        {...registerReturn}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={`${field.id}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectComponent>
      <FieldHelper id={helperId} text={helperText} className={helperClass} />
      <FieldError id={errorId} message={errorMessage} className={errorClass} />
    </FieldWrapper>
  );
};

export default SelectField;
