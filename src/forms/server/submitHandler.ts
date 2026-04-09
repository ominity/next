import type {
  CreateSubmitHandlerConfig,
  MetadataValue,
  SubmissionPayload,
} from "../types.js";

const DEFAULT_BASE_URL = "https://demo.ominity.com/api";
const DEFAULT_RECAPTCHA_VERIFY_URL =
  "https://www.google.com/recaptcha/api/siteverify";

interface RecaptchaVerificationResponse {
  success: boolean;
  action?: string;
  score?: number;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

interface ForwardSubmissionResult {
  status: number;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const isForwardSubmissionResult = (input: unknown): input is ForwardSubmissionResult => {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  return "status" in input && typeof (input as { status?: unknown }).status === "number";
};

const getClientIp = (request: Request): string | null => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",").map((value) => value.trim());
    if (first) {
      return first;
    }
  }

  const headerNames = [
    "x-real-ip",
    "cf-connecting-ip",
    "fastly-client-ip",
    "true-client-ip",
  ];

  for (const name of headerNames) {
    const value = request.headers.get(name);
    if (value) {
      return value;
    }
  }

  return null;
};

const buildServerMetadata = (
  request: Request,
  overrides?: MetadataValue | null | undefined,
): MetadataValue => {
  const userAgent = request.headers.get("user-agent");
  const locale = request.headers.get("accept-language")?.split(",")[0];
  const referrer = request.headers.get("referer") || undefined;

  return {
    page_url: overrides?.page_url ?? null,
    page_title: overrides?.page_title ?? null,
    referrer: overrides?.referrer ?? referrer ?? null,
    user_agent: overrides?.user_agent ?? userAgent ?? null,
    locale: overrides?.locale ?? locale ?? null,
    ip_address: overrides?.ip_address ?? getClientIp(request),
  };
};

const verifyRecaptcha = async (
  token: string | null,
  config: CreateSubmitHandlerConfig,
  fetchImpl: typeof fetch,
): Promise<boolean> => {
  if (!config.recaptchaSecret) {
    return true;
  }

  if (!token) {
    return false;
  }

  const response = await fetchImpl(
    config.recaptchaVerificationUrl ?? DEFAULT_RECAPTCHA_VERIFY_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        secret: config.recaptchaSecret,
        response: token,
      }),
    },
  );

  if (!response.ok) {
    return false;
  }

  const payload =
    (await response.json()) as RecaptchaVerificationResponse | undefined;

  return Boolean(payload?.success);
};

const normalizeKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]/g, "");

const stripHoneypotFields = (
  data: Record<string, unknown>,
  honeypotNames: string[],
): Record<string, unknown> => {
  const normalizedNames = new Set(
    honeypotNames.map((name) => normalizeKey(name)),
  );

  const entries = Object.entries(data).filter(([key]) => {
    const normalized = normalizeKey(key);
    if (normalized.includes("honeypot")) {
      return false;
    }
    if (normalizedNames.has(normalized)) {
      return false;
    }
    return true;
  });

  return Object.fromEntries(entries);
};

const normalizePayload = (
  payload: SubmissionPayload,
  metadata: MetadataValue,
): SubmissionPayload => {
  const { honeypotFields = [], ...rest } = payload;
  const existingMetadata = (payload.data.metadata as MetadataValue) ?? {};
  const sanitizedData = stripHoneypotFields(
    payload.data,
    honeypotFields,
  );
  return {
    ...rest,
    data: {
      ...sanitizedData,
      metadata: {
        ...existingMetadata,
        ...metadata,
      },
    },
  };
};

export const createOminityFormSubmitHandler = (
  config: CreateSubmitHandlerConfig,
) => {
  const fetchImpl = config.fetchImpl ?? fetch;
  if (!fetchImpl) {
    throw new Error("Fetch implementation is required for server handler.");
  }

  const baseUrl = (config.ominityBaseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method Not Allowed" }, 405);
    }

    let payload: SubmissionPayload;
    try {
      payload = (await request.json()) as SubmissionPayload;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    if (!payload || typeof payload.formId !== "number" || !payload.data) {
      return jsonResponse({ error: "Invalid submission payload." }, 400);
    }

    const recaptchaValid = await verifyRecaptcha(
      payload.recaptchaToken,
      config,
      fetchImpl,
    );

    if (!recaptchaValid) {
      return jsonResponse({ error: "Unable to verify reCAPTCHA." }, 400);
    }

    let customMetadata: MetadataValue | null | undefined = null;
    if (config.enrichMetadata) {
      try {
        customMetadata = await config.enrichMetadata({ request, payload });
      } catch {
        customMetadata = null;
      }
    }

    payload = normalizePayload(
      payload,
      buildServerMetadata(request, customMetadata ?? undefined),
    );

    if (config.onBeforeForward) {
      const maybeUpdated = await config.onBeforeForward(payload, request);
      if (maybeUpdated) {
        payload = maybeUpdated;
      }
    }

    try {
      if (config.forwardSubmission) {
        const forwarded = await config.forwardSubmission({
          payload,
          request,
          baseUrl,
          ominityApiKey: config.ominityApiKey,
          fetchImpl,
        });

        if (forwarded instanceof Response) {
          return forwarded;
        }

        if (isForwardSubmissionResult(forwarded)) {
          return new Response(JSON.stringify(forwarded.body ?? {}), {
            status: forwarded.status,
            headers: {
              "Content-Type": "application/json",
              ...(forwarded.headers ?? {}),
            },
          });
        }

        return jsonResponse(forwarded ?? {});
      }

      const ominityResponse = await fetchImpl(
        `${baseUrl}/v1/modules/forms/submissions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.ominityApiKey}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const responseBody = await ominityResponse.text();
      return new Response(responseBody || "{}", {
        status: ominityResponse.status,
        headers: {
          "Content-Type":
            ominityResponse.headers.get("content-type") ?? "application/json",
        },
      });
    } catch (error) {
      return jsonResponse(
        { error: "Failed to submit form to Ominity.", details: `${error}` },
        500,
      );
    }
  };
};
