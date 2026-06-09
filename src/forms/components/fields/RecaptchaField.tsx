import type { CSSProperties } from "react";
import type {
  OminityFormField,
  RecaptchaV2CheckboxConfig,
} from "../../types.js";
import FieldWrapper from "../FieldWrapper.js";
import FieldLabel from "../FieldLabel.js";
import FieldHelper from "../FieldHelper.js";
import FieldError from "../FieldError.js";

interface RecaptchaFieldProps {
  field: OminityFormField;
  config: RecaptchaV2CheckboxConfig;
  inputId: string;
  labelId?: string | undefined;
  helperId?: string | undefined;
  errorId?: string | undefined;
  wrapperClass: string;
  wrapperStyle?: CSSProperties | undefined;
  labelClass: string;
  containerClass: string;
  helperClass: string;
  errorClass: string;
  helperText?: string | undefined;
  errorMessage?: string | null | undefined;
  describedBy?: string | undefined;
  containerRef: (node: HTMLDivElement | null) => void;
}

const RecaptchaField = ({
  field,
  config,
  inputId,
  labelId,
  helperId,
  errorId,
  wrapperClass,
  wrapperStyle,
  labelClass,
  containerClass,
  helperClass,
  errorClass,
  helperText,
  errorMessage,
  describedBy,
  containerRef,
}: RecaptchaFieldProps) => (
  <FieldWrapper
    field={field}
    className={wrapperClass}
    style={wrapperStyle}
  >
    <FieldLabel
      id={labelId}
      field={field}
      as="p"
      className={labelClass}
    />
    <div
      id={inputId}
      ref={containerRef}
      className={containerClass}
      aria-describedby={describedBy}
      aria-labelledby={labelId}
      data-slot="field.recaptcha"
      data-recaptcha-version={config.version}
      data-recaptcha-provider={config.provider}
    />
    <FieldHelper id={helperId} text={helperText} className={helperClass} />
    <FieldError id={errorId} message={errorMessage} className={errorClass} />
  </FieldWrapper>
);

export default RecaptchaField;
