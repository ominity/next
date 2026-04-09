import type { UseFormRegisterReturn } from "react-hook-form";

interface HiddenFieldProps {
  registerReturn: UseFormRegisterReturn;
}

const HiddenField = ({ registerReturn }: HiddenFieldProps) => (
  <input type="hidden" {...registerReturn} />
);

export default HiddenField;
