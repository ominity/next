import type { UseFormRegisterReturn } from "react-hook-form";
import type { OminityFormField } from "../../types.js";

interface HoneypotFieldProps {
  field: OminityFormField;
  inputId: string;
  registerReturn: UseFormRegisterReturn;
  label?: string;
}

const HoneypotField = ({
  field,
  inputId,
  registerReturn,
  label,
}: HoneypotFieldProps) => (
  <div style={{ display: "none" }} aria-hidden="true">
    <label htmlFor={inputId}>{field.label || label || "Leave this field empty"}</label>
    <input
      id={inputId}
      type="text"
      autoComplete="off"
      tabIndex={-1}
      {...registerReturn}
    />
  </div>
);

export default HoneypotField;
