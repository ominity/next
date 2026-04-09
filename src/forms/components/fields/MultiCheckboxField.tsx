import type { CSSProperties, ElementType } from "react";
import type { ChangeEvent } from "react";
import type { FieldOption, FormComponents, OminityFormField } from "../../types.js";
import FieldWrapper from "../FieldWrapper.js";
import FieldLabel from "../FieldLabel.js";
import FieldHelper from "../FieldHelper.js";
import FieldError from "../FieldError.js";

interface MultiCheckboxFieldProps {
  field: OminityFormField;
  options: FieldOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  wrapperClass: string;
  wrapperStyle?: CSSProperties | undefined;
  labelClass: string;
  optionClass: string;
  optionInputClass: string;
  helperClass: string;
  errorClass: string;
  helperId?: string | undefined;
  errorId?: string | undefined;
  helperText?: string | undefined;
  errorMessage?: string | null | undefined;
  components?: FormComponents | undefined;
}

const MultiCheckboxField = ({
  field,
  options,
  selectedValues,
  onChange,
  wrapperClass,
  wrapperStyle,
  labelClass,
  optionClass,
  optionInputClass,
  helperClass,
  errorClass,
  helperId,
  errorId,
  helperText,
  errorMessage,
  components,
}: MultiCheckboxFieldProps) => {
  const CheckboxComponent = (components?.Checkbox ?? "input") as ElementType;

  const handleToggle = (value: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedValues, value]);
    } else {
      onChange(selectedValues.filter((current) => current !== value));
    }
  };

  return (
    <FieldWrapper
      field={field}
      className={wrapperClass}
      style={wrapperStyle}
    >
      <FieldLabel field={field} className={labelClass} as="p" />
      <div className="ominity-forms__multicheckbox-options">
        {options.map((option) => {
          const optionId = `${field.id}-${option.value}`;
          const checked = selectedValues.includes(option.value);
          return (
            <label key={optionId} htmlFor={optionId} className={optionClass}>
              <CheckboxComponent
                name={field.name}
                id={optionId}
                type="checkbox"
                value={option.value}
                checked={checked}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  handleToggle(option.value, Boolean(event.target.checked))}
                className={optionInputClass}
                data-slot="field.multicheckbox"
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
      <FieldHelper id={helperId} text={helperText} className={helperClass} />
      <FieldError id={errorId} message={errorMessage} className={errorClass} />
    </FieldWrapper>
  );
};

export default MultiCheckboxField;
