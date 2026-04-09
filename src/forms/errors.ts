export type OminityFormsErrorCode =
  | "FORMS_CLIENT_REQUEST_FAILED"
  | "FORMS_CLIENT_RESPONSE_INVALID"
  | "FORMS_NORMALIZATION_FAILED";

export interface OminityFormsErrorDetails {
  readonly [key: string]: unknown;
}

export class OminityFormsError extends Error {
  public readonly code: OminityFormsErrorCode;

  public readonly details: OminityFormsErrorDetails;

  public override readonly cause: unknown;

  public constructor(
    message: string,
    options: {
      code: OminityFormsErrorCode;
      details?: OminityFormsErrorDetails;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "OminityFormsError";
    this.code = options.code;
    this.details = options.details ?? {};
    this.cause = options.cause;
  }
}

export class FormsClientError extends OminityFormsError {
  public constructor(
    message: string,
    options: {
      code?: OminityFormsErrorCode;
      details?: OminityFormsErrorDetails;
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      code: options.code ?? "FORMS_CLIENT_REQUEST_FAILED",
      ...(typeof options.details !== "undefined" ? { details: options.details } : {}),
      ...(typeof options.cause !== "undefined" ? { cause: options.cause } : {}),
    });
    this.name = "FormsClientError";
  }
}

export class FormsNormalizationError extends OminityFormsError {
  public constructor(
    message: string,
    options: {
      details?: OminityFormsErrorDetails;
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      code: "FORMS_NORMALIZATION_FAILED",
      ...(typeof options.details !== "undefined" ? { details: options.details } : {}),
      ...(typeof options.cause !== "undefined" ? { cause: options.cause } : {}),
    });
    this.name = "FormsNormalizationError";
  }
}

