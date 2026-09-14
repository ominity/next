import type {
  CommerceClientDebugOptions,
  CommerceClientLogLevel,
} from "./types.js";

export interface CommerceDebugLogger {
  emit(level: CommerceClientLogLevel, message: string, payload?: unknown): void;
}

const SENSITIVE_KEYS = /^(?:authorization|cookie|set-cookie|password|secret|token|cardtoken|accesstoken|refreshtoken|clientsecret|apikey)$/i;

function redactDebugValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactDebugValue(item, seen));
  }
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    SENSITIVE_KEYS.test(key) ? "[redacted]" : redactDebugValue(entry, seen),
  ]));
}

export function createCommerceDebugLogger(
  options: CommerceClientDebugOptions | undefined,
  scope: string,
): CommerceDebugLogger {
  const enabled = options?.enabled ?? false;
  const logger = options?.logger;
  const namespace = options?.namespace ?? "@ominity/next";
  const logScope = `${namespace}:${scope}`;

  return {
    emit(level, message, payload) {
      if (!enabled) {
        return;
      }

      const safePayload = typeof payload === "undefined" ? undefined : redactDebugValue(payload);

      if (logger) {
        logger.log({
          scope: logScope,
          level,
          message,
          ...(typeof safePayload !== "undefined" ? { payload: safePayload } : {}),
        });
        return;
      }

      const record = {
        scope: logScope,
        message,
        ...(typeof safePayload !== "undefined" ? { payload: safePayload } : {}),
      };

      if (level === "warn") {
        console.warn(record);
        return;
      }

      if (level === "error") {
        console.error(record);
        return;
      }

      console.log(record);
    },
  };
}
