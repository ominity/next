interface CustomerAccountsErrorPayload {
  readonly code?: unknown;
  readonly error?: unknown;
  readonly details?: unknown;
}

export class CustomerAccountsError extends Error {
  readonly name = "CustomerAccountsError";

  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  get fields(): Readonly<Record<string, ReadonlyArray<string>>> | undefined {
    if (typeof this.details !== "object" || this.details === null) return undefined;
    const fields = (this.details as { readonly fields?: unknown }).fields;
    return typeof fields === "object" && fields !== null
      ? fields as Readonly<Record<string, ReadonlyArray<string>>>
      : undefined;
  }

  get isAuthenticationError(): boolean {
    return this.status === 401;
  }

  get isAuthorizationError(): boolean {
    return this.status === 403;
  }

  get isValidationError(): boolean {
    return this.status === 400 || this.status === 422;
  }

  get isRetryable(): boolean {
    return this.status === 0
      || this.status === 408
      || this.status === 425
      || this.status === 429
      || this.status >= 500;
  }
}

export function customerAccountsErrorFromResponse(
  response: Response,
  payload: unknown,
): CustomerAccountsError {
  const record = typeof payload === "object" && payload !== null
    ? payload as CustomerAccountsErrorPayload
    : null;
  const message = typeof record?.error === "string"
    ? record.error
    : `Customer account request failed (${response.status}).`;
  const code = typeof record?.code === "string" ? record.code : "CUSTOMER_ACCOUNT_REQUEST_FAILED";

  return new CustomerAccountsError(message, response.status, code, record?.details);
}
