import type {
  CreateSubmitHandlerConfig,
  MetadataValue,
  SubmissionPayload,
} from "../types.js";
import { normalizeMetadataLocale } from "../utils/metadata.js";

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

function normalizeIpCandidate(value: string): string | null {
  let normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("\"") && normalized.endsWith("\"")) {
    normalized = normalized.slice(1, -1).trim();
  }

  if (normalized.startsWith("for=")) {
    normalized = normalized.slice(4).trim();
  }

  if (normalized.startsWith("[") && normalized.includes("]")) {
    const closingBracketIndex = normalized.indexOf("]");
    normalized = normalized.slice(1, closingBracketIndex).trim();
  } else {
    const colonCount = (normalized.match(/:/g) ?? []).length;
    if (colonCount === 1 && normalized.includes(".")) {
      const [host] = normalized.split(":");
      normalized = host?.trim() ?? normalized;
    }
  }

  normalized = normalized.replace(/^::ffff:/i, "").trim();

  if (!normalized || normalized.toLowerCase() === "unknown") {
    return null;
  }

  return normalized;
}

function readHeaderCandidates(request: Request, headerName: string): string[] {
  const value = request.headers.get(headerName);
  if (!value) {
    return [];
  }

  if (headerName === "forwarded") {
    return value
      .split(",")
      .flatMap((entry) => entry.split(";"))
      .map((entry) => entry.trim())
      .filter((entry) => entry.toLowerCase().startsWith("for="))
      .map((entry) => normalizeIpCandidate(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  if (headerName === "x-forwarded-for") {
    return value
      .split(",")
      .map((entry) => normalizeIpCandidate(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  const normalized = normalizeIpCandidate(value);
  return normalized ? [normalized] : [];
}

const getClientIp = (request: Request): string | null => {
  const headerNames = [
    "x-ominity-client-ip",
    "cf-connecting-ip",
    "true-client-ip",
    "fastly-client-ip",
    "fly-client-ip",
    "x-vercel-forwarded-for",
    "x-client-ip",
    "x-nf-client-connection-ip",
    "x-real-ip",
    "forwarded",
    "x-forwarded-for",
  ];

  for (const headerName of headerNames) {
    const candidates = readHeaderCandidates(request, headerName);
    if (candidates.length > 0) {
      return candidates[0] ?? null;
    }
  }

  return null;
};

const buildServerMetadata = (
  request: Request,
  overrides?: MetadataValue | null | undefined,
): MetadataValue => {
  const userAgent = request.headers.get("user-agent");
  const locale = normalizeMetadataLocale(
    request.headers.get("accept-language")?.split(",")[0] ?? null,
  );
  const referrer = request.headers.get("referer") || undefined;

  return {
    page_url: overrides?.page_url ?? null,
    page_title: overrides?.page_title ?? null,
    referrer: overrides?.referrer ?? referrer ?? null,
    user_agent: overrides?.user_agent ?? userAgent ?? null,
    locale: normalizeMetadataLocale(overrides?.locale ?? locale ?? null),
    ip_address: overrides?.ip_address ?? getClientIp(request),
  };
};

const mergeMetadata = (
  existingMetadata: MetadataValue,
  serverMetadata: MetadataValue,
): MetadataValue => ({
  page_url: existingMetadata.page_url ?? serverMetadata.page_url ?? null,
  page_title: existingMetadata.page_title ?? serverMetadata.page_title ?? null,
  referrer: existingMetadata.referrer ?? serverMetadata.referrer ?? null,
  locale: normalizeMetadataLocale(existingMetadata.locale ?? serverMetadata.locale ?? null),
  user_agent: serverMetadata.user_agent ?? existingMetadata.user_agent ?? null,
  ip_address: serverMetadata.ip_address ?? existingMetadata.ip_address ?? null,
});

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

const enrichRecaptchaFieldValues = (
  data: Record<string, unknown>,
  metadata: MetadataValue,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [key, value];
      }

      const record = value as Record<string, unknown>;
      const token = typeof record.token === "string" ? record.token.trim() : "";
      if (!token) {
        return [key, value];
      }

      return [
        key,
        {
          ...record,
          ...(record.ip_address === undefined ? { ip_address: metadata.ip_address ?? null } : {}),
          ...(record.user_agent === undefined ? { user_agent: metadata.user_agent ?? null } : {}),
        },
      ];
    }),
  );

const normalizePayload = (
  payload: SubmissionPayload,
  metadata: MetadataValue,
): SubmissionPayload => {
  const { honeypotFields = [], ...rest } = payload;
  const existingMetadata = (payload.data.metadata as MetadataValue) ?? {};
  const mergedMetadata = mergeMetadata(existingMetadata, metadata);
  const sanitizedData = stripHoneypotFields(
    payload.data,
    honeypotFields,
  );
  return {
    ...rest,
    data: {
      ...enrichRecaptchaFieldValues(sanitizedData, mergedMetadata),
      metadata: mergedMetadata,
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
