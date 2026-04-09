import type { CSSProperties, ReactNode } from "react";

interface FormRowProps {
  inline: boolean;
  isStacked: boolean;
  columnTemplate?: string | undefined;
  className?: string | undefined;
  stackedClassName?: string | undefined;
  style?: CSSProperties | undefined;
  children: ReactNode;
}

const INLINE_GAP_VAR = "var(--ominity-inline-gap, 1.5rem)";

const DEFAULT_INLINE_STYLE: CSSProperties = {
  display: "grid",
  width: "100%",
  alignItems: "start",
  columnGap: INLINE_GAP_VAR,
};

const FormRow = ({
  inline,
  isStacked,
  columnTemplate,
  className = "ominity-forms__inline-row",
  stackedClassName,
  style,
  children,
}: FormRowProps) => {
  if (!inline || isStacked) {
    if (stackedClassName) {
      return <div className={stackedClassName}>{children}</div>;
    }
    return <>{children}</>;
  }

  const inlineStyle: CSSProperties = {
    ...DEFAULT_INLINE_STYLE,
    ...(style ?? {}),
  };

  if (columnTemplate) {
    inlineStyle.gridTemplateColumns = columnTemplate;
  }

  return (
    <div
      className={className}
      style={inlineStyle}
      data-slot="form.inlineRow"
    >
      {children}
    </div>
  );
};

export default FormRow;
