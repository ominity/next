import type { UseFormRegisterReturn } from "react-hook-form";
import type { OminityFormField } from "../../types.js";

interface MetadataFieldProps {
  field: OminityFormField;
  registers: Array<{
    name: string;
    registerReturn: UseFormRegisterReturn;
  }>;
}

const MetadataField = ({ field, registers }: MetadataFieldProps) => (
  <div style={{ display: "none" }} aria-hidden="true" data-field-name={field.name}>
    {registers.map(({ name, registerReturn }) => (
      <input key={name} type="hidden" {...registerReturn} />
    ))}
  </div>
);

export default MetadataField;
