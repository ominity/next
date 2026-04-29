import type {
  CommerceClientDebugOptions,
  CommerceClientLogLevel,
} from "./types.js";

export interface CommerceDebugLogger {
  emit(level: CommerceClientLogLevel, message: string, payload?: unknown): void;
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

      if (logger) {
        logger.log({
          scope: logScope,
          level,
          message,
          ...(typeof payload !== "undefined" ? { payload } : {}),
        });
        return;
      }

      const record = {
        scope: logScope,
        message,
        ...(typeof payload !== "undefined" ? { payload } : {}),
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
