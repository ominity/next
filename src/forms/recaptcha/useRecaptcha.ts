import { useCallback, useEffect, useRef, useState } from "react";
import type { RecaptchaConfig } from "../types.js";
import type { RecaptchaApi } from "./runtime.js";
import {
  buildRecaptchaScriptSrc,
  hasRecaptchaExecuteApi,
  hasRecaptchaWidgetApi,
  resolveRecaptchaApi,
  resolveRecaptchaClientApiNamespace,
  resolveRecaptchaProvider,
} from "./runtime.js";

declare global {
  interface Window {
    grecaptcha?: RecaptchaApi & {
      enterprise?: RecaptchaApi;
    };
  }
}

export interface UseRecaptchaResult {
  ready: boolean;
  token: string | null;
  error: string | null;
  execute: () => Promise<string | null>;
  reset: () => void;
  containerRef: (node: HTMLDivElement | null) => void;
}

const FORM_SUBMIT_ACTION = "form_submit";
const RECAPTCHA_INIT_POLL_INTERVAL_MS = 100;
const RECAPTCHA_INIT_TIMEOUT_MS = 10_000;

export const useRecaptcha = (config?: RecaptchaConfig): UseRecaptchaResult => {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resolveRef = useRef<((value: string | null) => void) | null>(null);
  const rejectRef = useRef<((reason?: unknown) => void) | null>(null);

  const setContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
  }, []);

  const cleanupPendingPromises = useCallback(() => {
    resolveRef.current = null;
    rejectRef.current = null;
  }, []);

  const handleToken = useCallback(
    (nextToken: string) => {
      setToken(nextToken);
      resolveRef.current?.(nextToken);
      cleanupPendingPromises();
    },
    [cleanupPendingPromises],
  );

  const handleError = useCallback(() => {
    setToken(null);
    const errorMessage = "Unable to verify reCAPTCHA.";
    setError(errorMessage);
    rejectRef.current?.(new Error(errorMessage));
    cleanupPendingPromises();
  }, [cleanupPendingPromises]);

  const handleExpired = useCallback(() => {
    setToken(null);
  }, []);

  const getClientApi = useCallback((): RecaptchaApi | null => {
    if (!config || typeof window === "undefined") {
      return null;
    }

    return resolveRecaptchaApi(
      window,
      resolveRecaptchaClientApiNamespace(config),
    );
  }, [config]);

  const hasRequiredCapabilities = useCallback((api: RecaptchaApi | null): boolean => {
    if (!config || !api) {
      return false;
    }

    switch (config.version) {
      case "v3":
        return hasRecaptchaExecuteApi(api);
      case "v2-checkbox":
        return hasRecaptchaWidgetApi(api);
      case "v2-invisible":
        return hasRecaptchaWidgetApi(api) && hasRecaptchaExecuteApi(api);
      default:
        return false;
    }
  }, [config]);

  useEffect(() => {
    if (!config) {
      setReady(false);
      setToken(null);
      setError(null);
      widgetIdRef.current = null;
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const scriptId = `ominity-recaptcha-${resolveRecaptchaProvider(config)}-${config.version}-${config.siteKey}`;
    const existingScript = document.getElementById(scriptId) as
      | HTMLScriptElement
      | null;
    let pollIntervalId: number | null = null;
    let pollTimeoutId: number | null = null;

    const stopPolling = () => {
      if (pollIntervalId !== null) {
        window.clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
      if (pollTimeoutId !== null) {
        window.clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
      }
    };

    const tryInitialize = (): boolean => {
      const clientApi = getClientApi();
      const initialized = hasRequiredCapabilities(clientApi);
      if (initialized) {
        stopPolling();
        setReady(true);
        setError(null);
      }

      return initialized;
    };

    const failInitialization = () => {
      stopPolling();
      setReady(false);
      setError("Failed to initialize reCAPTCHA.");
    };

    const startPolling = () => {
      if (tryInitialize()) {
        return;
      }

      if (pollIntervalId !== null || pollTimeoutId !== null) {
        return;
      }

      pollIntervalId = window.setInterval(() => {
        tryInitialize();
      }, RECAPTCHA_INIT_POLL_INTERVAL_MS);

      pollTimeoutId = window.setTimeout(() => {
        if (!tryInitialize()) {
          failInitialization();
        }
      }, RECAPTCHA_INIT_TIMEOUT_MS);
    };

    const handleError = () => {
      stopPolling();
      setError("Failed to load reCAPTCHA.");
      setReady(false);
    };

    setReady(false);
    setError(null);

    if (existingScript) {
      if (existingScript.dataset.loaded === "true") {
        startPolling();
        return;
      }

      existingScript.addEventListener("load", startPolling);
      existingScript.addEventListener("error", handleError);
      startPolling();

      return () => {
        stopPolling();
        existingScript.removeEventListener("load", startPolling);
        existingScript.removeEventListener("error", handleError);
      };
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = buildRecaptchaScriptSrc(config);
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      startPolling();
    };
    script.onerror = handleError;

    document.head.appendChild(script);
    startPolling();

    return () => {
      stopPolling();
      script.onload = null;
      script.onerror = null;
    };
  }, [config, getClientApi, hasRequiredCapabilities]);

  useEffect(() => {
    if (!config || config.version === "v3") {
      return;
    }
    const clientApi = getClientApi();
    if (!ready || !hasRecaptchaWidgetApi(clientApi)) {
      return;
    }
    if (!containerRef.current) {
      return;
    }
    if (widgetIdRef.current !== null) {
      return;
    }

    clientApi.ready(() => {
      if (!containerRef.current) {
        return;
      }
      if (widgetIdRef.current !== null) {
        return;
      }

      widgetIdRef.current = clientApi.render(
        containerRef.current,
        {
          sitekey: config.siteKey,
          size: config.version === "v2-invisible" ? "invisible" : "normal",
          callback: handleToken,
          "error-callback": handleError,
          "expired-callback": handleExpired,
          badge: config.badge,
          theme: config.version === "v2-checkbox" ? config.theme ?? "light" : undefined,
          tabindex: config.version === "v2-checkbox" ? config.tabIndex : undefined,
        },
      );
    });
  }, [config, getClientApi, handleError, handleExpired, handleToken, ready]);

  const executeV3 = useCallback(async (): Promise<string | null> => {
    if (!config || config.version !== "v3") {
      return null;
    }
    if (!ready) {
      return null;
    }
    const clientApi = getClientApi();
    if (!hasRecaptchaExecuteApi(clientApi)) {
      return null;
    }

    return new Promise<string | null>((resolve, reject) => {
      clientApi.ready(async () => {
        try {
          const generated = await clientApi.execute(config.siteKey, {
            action: config.action ?? FORM_SUBMIT_ACTION,
          });
          setToken(generated);
          resolve(generated);
        } catch (executionError) {
          setError("Failed to execute reCAPTCHA.");
          reject(executionError);
        }
      });
    });
  }, [config, getClientApi, ready]);

  const executeV2Invisible = useCallback((): Promise<string | null> => {
    const clientApi = getClientApi();
    if (
      !config ||
      config.version !== "v2-invisible" ||
      !hasRecaptchaWidgetApi(clientApi) ||
      !hasRecaptchaExecuteApi(clientApi) ||
      widgetIdRef.current === null
    ) {
      return Promise.resolve(null);
    }

    return new Promise<string | null>((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;

      clientApi.ready(() => {
        const widgetId = widgetIdRef.current;
        if (widgetId === null) {
          resolve(null);
          cleanupPendingPromises();
          return;
        }
        try {
          clientApi.execute(widgetId).catch((executionError) => {
            setError("Failed to execute reCAPTCHA.");
            reject(executionError);
            cleanupPendingPromises();
          });
        } catch (executionError) {
          setError("Failed to execute reCAPTCHA.");
          reject(executionError);
          cleanupPendingPromises();
        }
      });
    });
  }, [cleanupPendingPromises, config, getClientApi]);

  const execute = useCallback(async (): Promise<string | null> => {
    if (!config) {
      return null;
    }

    switch (config.version) {
      case "v3":
        return executeV3();
      case "v2-invisible":
        return executeV2Invisible();
      case "v2-checkbox":
        return token;
      default:
        return null;
    }
  }, [config, executeV2Invisible, executeV3, token]);

  const reset = useCallback(() => {
    setToken(null);
    setError(null);
    cleanupPendingPromises();
    if (config?.version === "v3") {
      return;
    }
    const clientApi = getClientApi();
    if (!hasRecaptchaWidgetApi(clientApi)) {
      return;
    }
    if (widgetIdRef.current !== null) {
      clientApi.reset(widgetIdRef.current);
    }
  }, [cleanupPendingPromises, config?.version, getClientApi]);

  return {
    ready,
    token,
    error,
    execute,
    reset,
    containerRef: setContainer,
  };
};
