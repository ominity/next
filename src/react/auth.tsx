"use client";

import type { User } from "@ominity/api-typescript/models/identity/users/user";
import type { UserMfaMethod } from "@ominity/api-typescript/models/identity/user-mfa-method";
import type { UserCreateInput } from "@ominity/api-typescript/models/operations";
import type { SocialProvider } from "@ominity/api-typescript/models/settings/social-provider";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { OminityActionError } from "../actions/client.js";
import type { OminityAuthState } from "../auth/server/route-handlers.js";
import { toOminitySdkError } from "../sdk/errors.js";
import { jsonBody, requestRoute } from "./http.js";
import { getPasskeyCredential, type OminityPasskeyOptionsJSON } from "./webauthn.js";

export type { OminityAuthState };

export type OminityAuthStatus = "loading" | OminityAuthState["status"];

export type OminitySocialProvider = Pick<SocialProvider, "id" | "provider" | "name" | "icon" | "isEnabled">;

export interface OminityAuthContextValue {
  /** `mfa_required` after a password sign-in of a user with MFA, until `verifyMfa` or `verifyRecoveryCode`. */
  readonly status: OminityAuthStatus;
  readonly ready: boolean;
  readonly user: User | null;
  readonly expiresAt: string | null;
  /** The methods that can complete a pending sign-in. */
  readonly mfaMethods: ReadonlyArray<UserMfaMethod>;
  /**
   * After a password sign-up, or a password sign-in of an account that hasn't verified its email: where the code went
   * and when another can be sent, until `verifyEmailCode` signs in (`status` is `verification_required`).
   */
  readonly verification: {
    readonly email: string;
    readonly expiresAt: string | null;
    readonly resendAvailableAt: string | null;
  } | null;
  readonly pending: boolean;
  readonly error: OminityActionError | null;
  signIn(input: { readonly email: string; readonly password: string }): Promise<OminityAuthState>;
  /**
   * Creates the account. By default it has to verify its email first (`verification_required`: Ominity emailed a
   * sign-up code, `verifyEmailCode` signs in); with `verifyEmailOnRegister: false` on the server it signs in at once.
   */
  register(input: Pick<UserCreateInput, "firstName" | "email" | "password"> & Partial<Pick<UserCreateInput, "lastName">>): Promise<OminityAuthState>;
  /**
   * Emails a 6-digit code: a sign-in code when the email has an account, a signup code otherwise (the answer is the
   * same). The email links to the site's `emailCodePath` with `#email=…&code=…`.
   */
  sendEmailCode(email: string): Promise<{ readonly expiresAt: string; readonly resendAvailableAt: string }>;
  /** Signs in with an emailed code; a signup code creates the user (verified email, no password). */
  verifyEmailCode(input: { readonly email: string; readonly code: string }): Promise<OminityAuthState>;
  /**
   * Email-first sign-in: whether this email can sign in with a passkey on this site. An unknown email answers `false`
   * too. When `true`, the challenge is kept, so `signInWithPasskey({ email })` opens the prompt without another call.
   */
  checkPasskeys(email: string): Promise<{ readonly hasPasskeys: boolean }>;
  /**
   * Signs in with a passkey: opens the browser's passkey prompt and finishes the sign-in (no MFA step; a passkey is
   * two factors). With `email`, only that user's passkeys are offered; without, any passkey for this site. With
   * `conditional`, the prompt is the email field's autofill (`autocomplete="username webauthn"`); call it once on
   * page load and abort it with `signal` when the user signs in another way. Closing the prompt rejects with code
   * `PASSKEY_CANCELLED` (not stored in `error`); an email without passkeys rejects with `NO_PASSKEYS`.
   */
  signInWithPasskey(input?: {
    readonly email?: string | undefined;
    readonly conditional?: boolean | undefined;
    readonly signal?: AbortSignal | undefined;
  }): Promise<OminityAuthState>;
  signOut(): Promise<void>;
  sendMfaCode(method: string): Promise<void>;
  verifyMfa(method: string, code: string): Promise<OminityAuthState>;
  verifyRecoveryCode(code: string): Promise<OminityAuthState>;
  /** Sends a reset link; `redirectUrl` is the page that completes it with `resetPassword`. */
  requestPasswordReset(input: { readonly email: string; readonly redirectUrl: string }): Promise<void>;
  resetPassword(input: { readonly email: string; readonly token: string; readonly password: string }): Promise<void>;
  listSocialProviders(): Promise<ReadonlyArray<OminitySocialProvider>>;
  /** The URL that starts a social sign-in; navigate the browser to it. */
  socialSignInUrl(providerId: number): string;
  refresh(): Promise<OminityAuthState>;
  /** Replaces the signed-in user after a profile change (used by `useUser`). */
  setUser(user: User): void;
}

export interface OminityAuthOptions {
  /** Where the auth routes are mounted. Defaults to `/api/auth`. */
  readonly basePath?: string | undefined;
}

const AuthContext = createContext<OminityAuthContextValue | null>(null);

interface PasskeyChallengeResponse {
  readonly hasPasskeys?: boolean;
  readonly challengeId?: string;
  readonly expiresAt?: string;
  readonly publicKey?: OminityPasskeyOptionsJSON;
}

interface PasskeyChallenge {
  readonly email: string | undefined;
  readonly challengeId: string;
  readonly expiresAt: string;
  readonly publicKey: OminityPasskeyOptionsJSON;
}

export function OminityAuthStateProvider({ children, options = {} }: { readonly children: ReactNode; readonly options?: OminityAuthOptions | undefined }) {
  const base = (options.basePath ?? "/api/auth").replace(/\/+$/, "");
  const [state, setState] = useState<OminityAuthState | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<OminityActionError | null>(null);
  const mounted = useRef(true);

  // Set on every mount: StrictMode unmounts and remounts once in development.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setPending((count) => count + 1);
    setError(null);
    try {
      return await action();
    } catch (caught) {
      const failure = toOminitySdkError(caught);
      if (mounted.current) setError(failure);
      throw failure;
    } finally {
      if (mounted.current) setPending((count) => count - 1);
    }
  }, []);

  // The challenge from the last `checkPasskeys`, for the sign-in that usually follows it.
  const passkeyChallenge = useRef<PasskeyChallenge | null>(null);

  const startPasskeySignIn = useCallback(async (email: string | undefined): Promise<PasskeyChallenge> => {
    const kept = passkeyChallenge.current;
    passkeyChallenge.current = null;
    if (kept && kept.email === email && Date.parse(kept.expiresAt) - Date.now() > 10_000) {
      return kept;
    }

    const started = await requestRoute<PasskeyChallengeResponse>(`${base}/passkey/challenge`, jsonBody(email ? { email } : {}));
    if (!started.challengeId || !started.publicKey) {
      throw new OminityActionError("There is no passkey for this email on this site.", 404, "NO_PASSKEYS");
    }
    return { email, challengeId: started.challengeId, publicKey: started.publicKey, expiresAt: started.expiresAt ?? "" };
  }, [base]);

  const apply = useCallback((next: OminityAuthState) => {
    if (mounted.current) setState(next);
    return next;
  }, []);

  const refresh = useCallback(
    () => requestRoute<OminityAuthState>(`${base}/me`).then(apply, () => apply({ status: "anonymous" })),
    [apply, base],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<OminityAuthContextValue>(() => ({
    status: state?.status ?? "loading",
    ready: state !== null,
    user: state?.status === "authenticated" ? state.user : null,
    expiresAt: state?.status === "authenticated" ? state.expiresAt : null,
    mfaMethods: state?.status === "mfa_required" ? state.methods : [],
    verification: state?.status === "verification_required"
      ? { email: state.email, expiresAt: state.expiresAt, resendAvailableAt: state.resendAvailableAt }
      : null,
    pending: pending > 0,
    error,
    signIn: (input) => run(() => requestRoute<OminityAuthState>(`${base}/login`, jsonBody(input))).then(apply),
    register: (input) => run(() => requestRoute<OminityAuthState>(`${base}/register`, jsonBody(input))).then(apply),
    sendEmailCode: (email) => run(() => requestRoute<{ expiresAt: string; resendAvailableAt: string }>(`${base}/email-code/send`, jsonBody({ email }))).then((sent) => {
      // A pending verification follows the newest code.
      setState((current) => current?.status === "verification_required" && current.email === email.trim().toLowerCase()
        ? { ...current, expiresAt: sent.expiresAt, resendAvailableAt: sent.resendAvailableAt }
        : current);
      return sent;
    }),
    verifyEmailCode: (input) => run(() => requestRoute<OminityAuthState>(`${base}/email-code/verify`, jsonBody(input))).then(apply),
    checkPasskeys: (email) => run(async () => {
      const normalized = email.trim().toLowerCase();
      const started = await requestRoute<PasskeyChallengeResponse>(`${base}/passkey/challenge`, jsonBody({ email: normalized }));
      passkeyChallenge.current = started.hasPasskeys && started.challengeId && started.publicKey
        ? { email: normalized, challengeId: started.challengeId, publicKey: started.publicKey, expiresAt: started.expiresAt ?? "" }
        : null;
      return { hasPasskeys: started.hasPasskeys === true };
    }),
    signInWithPasskey: async (input = {}) => {
      const email = input.email?.trim().toLowerCase() || undefined;
      // Autofill waits for the user for as long as the page is open: it doesn't count as pending.
      const start = input.conditional ? await startPasskeySignIn(email) : await run(() => startPasskeySignIn(email));
      const credential = await getPasskeyCredential(start.publicKey, { conditional: input.conditional, signal: input.signal });
      return run(() => requestRoute<OminityAuthState>(`${base}/passkey/verify`, jsonBody({ challengeId: start.challengeId, credential }))).then(apply);
    },
    signOut: () => run(async () => {
      await requestRoute(`${base}/logout`, { method: "POST" });
      apply({ status: "anonymous" });
    }),
    sendMfaCode: (method) => run(async () => {
      await requestRoute(`${base}/mfa/send`, jsonBody({ method }));
    }),
    verifyMfa: (method, code) => run(() => requestRoute<OminityAuthState>(`${base}/mfa/validate`, jsonBody({ method, code }))).then(apply),
    verifyRecoveryCode: (code) => run(() => requestRoute<OminityAuthState>(`${base}/mfa/recovery/validate`, jsonBody({ code }))).then(apply),
    requestPasswordReset: (input) => run(async () => {
      await requestRoute(`${base}/password/forgot`, jsonBody(input));
    }),
    resetPassword: (input) => run(async () => {
      await requestRoute(`${base}/password/reset`, jsonBody(input));
    }),
    listSocialProviders: () => run(async () => (await requestRoute<{ items?: OminitySocialProvider[] }>(`${base}/social`)).items ?? []),
    socialSignInUrl: (providerId) => `${base}/social/${encodeURIComponent(String(providerId))}/start`,
    refresh,
    setUser: (user) => setState((current) => current?.status === "authenticated" ? { ...current, user } : current),
  }), [apply, base, error, pending, refresh, run, startPasskeySignIn, state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * The browser session: sign-in, registration, MFA challenge, password reset and social sign-in. `user` is the SDK
 * `User`; the tokens never leave the server.
 */
export function useAuth(): OminityAuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside OminityProvider.");
  return value;
}
