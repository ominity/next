import type { ReactNode } from "react";
import type { OminityFormField } from "../types.js";

type SupportedElements = "label" | "p" | "span";

interface FieldLabelProps {
  field: OminityFormField;
  className: string;
  htmlFor?: string | undefined;
  as?: SupportedElements | undefined;
  children?: ReactNode | undefined;
}

const FieldLabel = ({
  field,
  className,
  htmlFor,
  as = "label",
  children,
}: FieldLabelProps) => {
  const content = children ?? field.label;
  if (!content) {
    return null;
  }

  const hiddenAttr = field.isLabelVisible ? undefined : "true";

  if (as === "label" || htmlFor) {
    return (
      <label
        htmlFor={htmlFor}
        className={className}
        data-hidden={hiddenAttr}
        data-slot="field.label"
      >
        {content}
      </label>
    );
  }

  const Component = as;
  return (
    <Component className={className} data-hidden={hiddenAttr} data-slot="field.label">
      {content}
    </Component>
  );
};

export default FieldLabel;
