import type { UseFormRegisterReturn } from "react-hook-form";
import type { OminityFormField } from "../../types.js";

interface HoneypotFieldProps {
  field: OminityFormField;
  inputId: string;
  registerReturn: UseFormRegisterReturn;
}

const HoneypotField = ({
  field,
  inputId,
  registerReturn,
}: HoneypotFieldProps) => (
  <div style={{ display: "none" }} aria-hidden="true">
    <label htmlFor={inputId}>{field.label || "Leave this field empty"}</label>
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
