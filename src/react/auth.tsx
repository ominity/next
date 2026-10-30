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

import type { OminityActionError } from "../actions/client.js";
import type { OminityAuthState } from "../auth/server/route-handlers.js";
import { toOminitySdkError } from "../sdk/errors.js";
import { jsonBody, requestRoute } from "./http.js";

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
  readonly pending: boolean;
  readonly error: OminityActionError | null;
  signIn(input: { readonly email: string; readonly password: string }): Promise<OminityAuthState>;
  register(input: Pick<UserCreateInput, "firstName" | "email" | "password"> & Partial<Pick<UserCreateInput, "lastName">>): Promise<OminityAuthState>;
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
    pending: pending > 0,
    error,
    signIn: (input) => run(() => requestRoute<OminityAuthState>(`${base}/login`, jsonBody(input))).then(apply),
    register: (input) => run(() => requestRoute<OminityAuthState>(`${base}/register`, jsonBody(input))).then(apply),
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
  }), [apply, base, error, pending, refresh, run, state]);

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
