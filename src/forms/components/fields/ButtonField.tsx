import type { CSSProperties, ElementType } from "react";
import type { FormComponents, OminityFormField } from "../../types.js";
import FieldWrapper from "../FieldWrapper.js";
import FieldHelper from "../FieldHelper.js";

interface ButtonFieldProps {
  field: OminityFormField;
  helperId?: string | undefined;
  helperText?: string | undefined;
  wrapperClass: string;
  wrapperStyle?: CSSProperties | undefined;
  buttonClass: string;
  helperClass: string;
  disabled?: boolean | undefined;
  components?: FormComponents | undefined;
}

const ButtonField = ({
  field,
  helperId,
  helperText,
  wrapperClass,
  wrapperStyle,
  buttonClass,
  helperClass,
  disabled,
  components,
}: ButtonFieldProps) => {
  const ButtonComponent = (components?.Button ?? "button") as ElementType;

  return (
    <FieldWrapper
      field={field}
      className={wrapperClass}
      style={wrapperStyle}
    >
      <ButtonComponent
        type={(field.defaultValue as "button" | "reset" | "submit") || "submit"}
        className={buttonClass}
        disabled={disabled}
        data-slot="field.button"
      >
        {field.label}
      </ButtonComponent>
      <FieldHelper id={helperId} text={helperText} className={helperClass} />
    </FieldWrapper>
  );
};

export default ButtonField;
