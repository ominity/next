export type FormsClientLogLevel = "debug" | "info" | "warn" | "error";

export interface FormsClientLogEvent {
  readonly scope: string;
  readonly message: string;
  readonly level: FormsClientLogLevel;
  readonly payload?: unknown;
}

export interface FormsClientLogger {
  log(event: FormsClientLogEvent): void;
}

export interface FormsClientDebugOptions {
  readonly enabled?: boolean;
  readonly logger?: FormsClientLogger;
  readonly namespace?: string;
}

export interface FormsDebugLogger {
  enabled: boolean;
  emit(level: FormsClientLogLevel, message: string, payload?: unknown): void;
}

class ConsoleFormsLogger implements FormsClientLogger {
  public log(event: FormsClientLogEvent): void {
    const prefix = `[${event.scope}]`;
    const payload = typeof event.payload === "undefined" ? "" : event.payload;

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

export function createFormsDebugLogger(
  options: FormsClientDebugOptions | undefined,
  scope: string,
): FormsDebugLogger {
  const enabled = options?.enabled ?? false;
  const logger = options?.logger ?? new ConsoleFormsLogger();
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

