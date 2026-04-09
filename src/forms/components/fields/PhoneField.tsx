import type { CSSProperties, ComponentType } from "react";
import type {
  FormComponents,
  OminityFormField,
  PhoneCountry,
  PhoneFieldValue,
} from "../../types.js";
import FieldWrapper from "../FieldWrapper.js";
import FieldLabel from "../FieldLabel.js";
import FieldHelper from "../FieldHelper.js";
import FieldError from "../FieldError.js";
import PhoneInput, { type PhoneInputProps } from "../../phone/PhoneInput.js";

interface PhoneFieldSlotClasses {
  control: string;
  countryButton: string;
  dropdown: string;
  searchInput: string;
  option: string;
  numberInput: string;
}

interface PhoneFieldProps {
  field: OminityFormField;
  value: PhoneFieldValue | null;
  onChange: (value: PhoneFieldValue | null) => void;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  wrapperClass: string;
  wrapperStyle?: CSSProperties | undefined;
  labelClass: string;
  helperClass: string;
  errorClass: string;
  helperId?: string | undefined;
  errorId?: string | undefined;
  helperText?: string | undefined;
  errorMessage?: string | null | undefined;
  countries?: PhoneCountry[] | undefined;
  defaultCountry?: string | undefined;
  slotClasses: PhoneFieldSlotClasses;
  components?: FormComponents | undefined;
}

const PhoneField = ({
  field,
  value,
  onChange,
  placeholder,
  disabled,
  wrapperClass,
  wrapperStyle,
  labelClass,
  helperClass,
  errorClass,
  helperId,
  errorId,
  helperText,
  errorMessage,
  countries,
  defaultCountry,
  slotClasses,
  components,
}: PhoneFieldProps) => {
  const PhoneInputComponent = (components?.PhoneInput ?? PhoneInput) as ComponentType<
    PhoneInputProps
  >;

  return (
    <FieldWrapper
      field={field}
      className={wrapperClass}
      style={wrapperStyle}
    >
      <FieldLabel field={field} className={labelClass} />
      <PhoneInputComponent
        value={value}
        onChange={onChange}
        countries={countries}
        defaultCountry={defaultCountry}
        placeholder={placeholder}
        disabled={disabled}
        slotClasses={slotClasses}
        components={components}
      />
      <FieldHelper id={helperId} text={helperText} className={helperClass} />
      <FieldError id={errorId} message={errorMessage} className={errorClass} />
    </FieldWrapper>
  );
};

export default PhoneField;
