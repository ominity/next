export type OminityNextErrorCode =
  | "INVALID_ARGUMENT"
  | "CLIENT_REQUEST_FAILED"
  | "CLIENT_RESPONSE_INVALID"
  | "NORMALIZATION_FAILED"
  | "ROUTE_RESOLUTION_FAILED"
  | "REGISTRY_DUPLICATE_KEY"
  | "REGISTRY_MISSING_COMPONENT"
  | "RENDER_FAILED"
  | "COMMERCE_CLIENT_FAILED"
  | "COMMERCE_NORMALIZATION_FAILED"
  | "AUTH_CLIENT_FAILED"
  | "AUTH_RESPONSE_INVALID";

export interface OminityNextErrorDetails {
  readonly [key: string]: unknown;
}

export class OminityNextError extends Error {
  public readonly code: OminityNextErrorCode;

  public readonly details: OminityNextErrorDetails;

  public override readonly cause: unknown;

  public constructor(
    message: string,
    options: {
      code: OminityNextErrorCode;
      cause?: unknown;
      details?: OminityNextErrorDetails;
    },
  ) {
    super(message);
    this.name = "OminityNextError";
    this.code = options.code;
    this.details = options.details ?? {};
    this.cause = options.cause;
  }
}

export class CmsClientError extends OminityNextError {
  public constructor(message: string, options: { cause?: unknown; details?: OminityNextErrorDetails } = {}) {
    super(message, {
      code: "CLIENT_REQUEST_FAILED",
      ...(typeof options.cause !== "undefined" ? { cause: options.cause } : {}),
      ...(typeof options.details !== "undefined" ? { details: options.details } : {}),
    });
    this.name = "CmsClientError";
  }
}

export class CmsNormalizationError extends OminityNextError {
  public constructor(message: string, options: { cause?: unknown; details?: OminityNextErrorDetails } = {}) {
    super(message, {
      code: "NORMALIZATION_FAILED",
      ...(typeof options.cause !== "undefined" ? { cause: options.cause } : {}),
      ...(typeof options.details !== "undefined" ? { details: options.details } : {}),
    });
    this.name = "CmsNormalizationError";
  }
}

export class CmsRouteResolutionError extends OminityNextError {
  public constructor(message: string, options: { cause?: unknown; details?: OminityNextErrorDetails } = {}) {
    super(message, {
      code: "ROUTE_RESOLUTION_FAILED",
      ...(typeof options.cause !== "undefined" ? { cause: options.cause } : {}),
      ...(typeof options.details !== "undefined" ? { details: options.details } : {}),
    });
    this.name = "CmsRouteResolutionError";
  }
}

export class CmsRegistryError extends OminityNextError {
  public constructor(message: string, options: { code?: OminityNextErrorCode; details?: OminityNextErrorDetails } = {}) {
    super(message, {
      code: options.code ?? "REGISTRY_MISSING_COMPONENT",
      ...(typeof options.details !== "undefined" ? { details: options.details } : {}),
    });
    this.name = "CmsRegistryError";
  }
}

export class CmsRenderError extends OminityNextError {
  public constructor(message: string, options: { cause?: unknown; details?: OminityNextErrorDetails } = {}) {
    super(message, {
      code: "RENDER_FAILED",
      ...(typeof options.cause !== "undefined" ? { cause: options.cause } : {}),
      ...(typeof options.details !== "undefined" ? { details: options.details } : {}),
    });
    this.name = "CmsRenderError";
  }
}

export class CommerceClientError extends OminityNextError {
  public constructor(message: string, options: { cause?: unknown; details?: OminityNextErrorDetails } = {}) {
    super(message, {
      code: "COMMERCE_CLIENT_FAILED",
      ...(typeof options.cause !== "undefined" ? { cause: options.cause } : {}),
      ...(typeof options.details !== "undefined" ? { details: options.details } : {}),
    });
    this.name = "CommerceClientError";
  }
}

export class CommerceNormalizationError extends OminityNextError {
  public constructor(message: string, options: { cause?: unknown; details?: OminityNextErrorDetails } = {}) {
    super(message, {
      code: "COMMERCE_NORMALIZATION_FAILED",
      ...(typeof options.cause !== "undefined" ? { cause: options.cause } : {}),
      ...(typeof options.details !== "undefined" ? { details: options.details } : {}),
    });
    this.name = "CommerceNormalizationError";
  }
}

export class AuthClientError extends OminityNextError {
  public constructor(message: string, options: { cause?: unknown; details?: OminityNextErrorDetails } = {}) {
    super(message, {
      code: "AUTH_CLIENT_FAILED",
      ...(typeof options.cause !== "undefined" ? { cause: options.cause } : {}),
      ...(typeof options.details !== "undefined" ? { details: options.details } : {}),
    });
    this.name = "AuthClientError";
  }
}
