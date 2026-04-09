import type { CSSProperties, ReactNode } from "react";
import type { OminityFormField } from "../types.js";

interface FieldWrapperProps {
  field: OminityFormField;
  className: string;
  style?: CSSProperties | undefined;
  children: ReactNode;
}

const hasStyle = (style?: CSSProperties): style is CSSProperties =>
  Boolean(style && Object.keys(style).length);

const getWrapperStyle = (style?: CSSProperties): CSSProperties => {
  if (hasStyle(style)) {
    if ("minWidth" in style) {
      return style;
    }
    return {
      minWidth: 0,
      ...style,
    };
  }
  return { minWidth: 0 };
};

const FieldWrapper = ({
  field,
  className,
  style,
  children,
}: FieldWrapperProps) => (
  <div
    className={className}
    style={getWrapperStyle(style)}
    data-slot="field.wrapper"
    data-field-type={field.type}
    data-inline={field.isInline ? "true" : undefined}
  >
    {children}
  </div>
);

export default FieldWrapper;
