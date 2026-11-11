"use client";

import { useEffect, useState } from "react";

export interface OminityResendCountdown {
  /** Whole seconds until another code can be sent; 0 when it can be sent now. */
  readonly secondsLeft: number;
  readonly canResend: boolean;
  /** The wait in words, in the visitor's language ("45 seconds", "2 minutes"); null when it can be sent now. */
  readonly label: string | null;
}

/**
 * Counts down to `resendAvailableAt` (from `sendEmailCode` or a `verification_required` state), once a second. The
 * wait between codes grows with each one sent (a minute, then two, five, up to fifteen), so show it in words:
 * `Send a new code in ${label}`.
 */
export function useResendCountdown(resendAvailableAt: string | null | undefined, locale?: string): OminityResendCountdown {
  const [now, setNow] = useState(() => Date.now());
  const until = resendAvailableAt ? Date.parse(resendAvailableAt) : Number.NaN;
  const secondsLeft = Number.isFinite(until) ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft > 0, until]);

  return { secondsLeft, canResend: secondsLeft === 0, label: secondsLeft > 0 ? formatResendWait(secondsLeft, locale) : null };
}

/**
 * A wait in words: seconds under a minute ("45 seconds"), whole minutes after that, rounded up ("2 minutes"), hours
 * from an hour ("1 hour"). Localized with `Intl` (`locale` defaults to the browser's).
 */
export function formatResendWait(seconds: number, locale?: string): string {
  const [value, unit] = seconds < 60
    ? [Math.max(1, Math.ceil(seconds)), "second"]
    : seconds < 3600
      ? [Math.ceil(seconds / 60), "minute"]
      : [Math.ceil(seconds / 3600), "hour"];

  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(value);
}
