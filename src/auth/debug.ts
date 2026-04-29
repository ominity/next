import type {
  AuthClientDebugOptions,
  AuthClientLogLevel,
} from "./types.js";

export interface AuthDebugLogger {
  emit(level: AuthClientLogLevel, message: string, payload?: unknown): void;
}

export function createAuthDebugLogger(
  options: AuthClientDebugOptions | undefined,
  scope: string,
): AuthDebugLogger {
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
