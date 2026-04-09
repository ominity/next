import type {
  CmsClientDebugOptions,
  CmsClientLogEvent,
  CmsClientLogLevel,
  CmsClientLogger,
} from "./types.js";

class ConsoleCmsLogger implements CmsClientLogger {
  public log(event: CmsClientLogEvent): void {
    const payload = typeof event.payload === "undefined" ? "" : event.payload;
    const prefix = `[${event.scope}]`;

    switch (event.level) {
      case "debug":
        console.debug(prefix, event.message, payload);
        return;
      case "info":
        console.info(prefix, event.message, payload);
        return;
      case "warn":
        console.warn(prefix, event.message, payload);
        return;
      default:
        console.error(prefix, event.message, payload);
        return;
    }
  }
}

export interface CmsDebugLogger {
  enabled: boolean;
  emit(level: CmsClientLogLevel, message: string, payload?: unknown): void;
}

export function createCmsDebugLogger(options: CmsClientDebugOptions | undefined, scope: string): CmsDebugLogger {
  const enabled = options?.enabled ?? false;
  const logger = options?.logger ?? new ConsoleCmsLogger();
  const namespace = options?.namespace ?? "@ominity/next";

  return {
    enabled,
    emit(level, message, payload) {
      if (!enabled) {
        return;
      }

      logger.log({
        level,
        message,
        payload,
        scope: `${namespace}:${scope}`,
      });
    },
  };
}

