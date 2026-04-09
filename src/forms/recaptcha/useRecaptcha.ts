import { useCallback, useEffect, useRef, useState } from "react";
import type { RecaptchaConfig } from "../types.js";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      render: (
        container: HTMLElement,
        params: Record<string, unknown>,
      ) => number;
      execute: (
        siteKeyOrWidgetId: string | number,
        options?: Record<string, unknown>,
      ) => Promise<string>;
      reset: (widgetId?: number) => void;
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

  useEffect(() => {
    if (!config) {
      setReady(false);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const scriptId = `ominity-recaptcha-${config.version}-${config.siteKey}`;
    const existingScript = document.getElementById(scriptId);

    if (existingScript) {
      setReady(true);
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src =
      config.version === "v3"
        ? `https://www.google.com/recaptcha/api.js?render=${config.siteKey}`
        : "https://www.google.com/recaptcha/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => setReady(true);
    script.onerror = () => {
      setError("Failed to load reCAPTCHA.");
      setReady(false);
    };

    document.head.appendChild(script);

    return () => {
      script.onload = null;
      script.onerror = null;
    };
  }, [config]);

  useEffect(() => {
    if (!config || config.version === "v3") {
      return;
    }
    if (!ready || typeof window === "undefined" || !window.grecaptcha) {
      return;
    }
    if (!containerRef.current) {
      return;
    }

    window.grecaptcha.ready(() => {
      if (!containerRef.current) {
        return;
      }

      widgetIdRef.current = window.grecaptcha!.render(
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
  }, [config, handleError, handleExpired, handleToken, ready]);

  const executeV3 = useCallback(async (): Promise<string | null> => {
    if (!config || config.version !== "v3") {
      return null;
    }
    if (typeof window === "undefined" || !window.grecaptcha) {
      return null;
    }
    if (!ready) {
      return null;
    }

    return new Promise<string | null>((resolve, reject) => {
      window.grecaptcha!.ready(async () => {
        try {
          const generated = await window
            .grecaptcha!.execute(config.siteKey, {
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
  }, [config, ready]);

  const executeV2Invisible = useCallback((): Promise<string | null> => {
    if (
      !config ||
      config.version !== "v2-invisible" ||
      typeof window === "undefined" ||
      !window.grecaptcha ||
      widgetIdRef.current === null
    ) {
      return Promise.resolve(null);
    }

    return new Promise<string | null>((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;

      window.grecaptcha!.ready(() => {
        const widgetId = widgetIdRef.current;
        if (widgetId === null) {
          resolve(null);
          cleanupPendingPromises();
          return;
        }
        try {
          window
            .grecaptcha!.execute(widgetId)
            .catch((executionError) => {
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
  }, [cleanupPendingPromises, config]);

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
    if (typeof window === "undefined" || !window.grecaptcha) {
      return;
    }
    if (config?.version === "v3") {
      return;
    }
    if (widgetIdRef.current !== null) {
      window.grecaptcha.reset(widgetIdRef.current);
    }
  }, [cleanupPendingPromises, config?.version]);

  return {
    ready,
    token,
    error,
    execute,
    reset,
    containerRef: setContainer,
  };
};
