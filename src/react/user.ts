"use client";

import type { User } from "@ominity/api-typescript/models/identity/users/user";
import type { UserLogin } from "@ominity/api-typescript/models/identity/users/user-login";
import type { UserMfaMethod } from "@ominity/api-typescript/models/identity/user-mfa-method";
import type { UserRecoveryCode } from "@ominity/api-typescript/models/identity/user-recovery-code";
import type { UserUpdateInput } from "@ominity/api-typescript/models/operations";
import { useCallback, useState } from "react";

import type { OminityActionError } from "../actions/client.js";
import { toOminitySdkError } from "../sdk/errors.js";
import {
  useOminitySdk,
  useOminitySdkPaginatedQuery,
  useOminitySdkQuery,
  type UseOminitySdkPaginatedQueryOptions,
} from "../sdk/react.js";
import { useAuth } from "./auth.js";

/** Proof for turning off a method: a current code of that method, or an unused recovery code. */
export type OminityMfaMethodProof = { readonly code: string } | { readonly recoveryCode: string };

/** Proof for a two-factor security change: a current code of one of the user's enabled methods, or a recovery code. */
export type OminityMfaProof = { readonly method: string; readonly code: string } | { readonly recoveryCode: string };

/**
 * The signed-in user's own settings: profile and password, MFA methods and recovery codes. Everything goes through
 * the SDK with the user's session.
 */
export function useUser() {
  const auth = useAuth();
  const sdk = useOminitySdk();
  const userId = auth.user?.id ?? null;
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<OminityActionError | null>(null);
  const mfa = useOminitySdkQuery(
    (client, { signal }) => client.users.mfaMethods.list({ id: userId as number }, { signal }),
    { key: [userId], enabled: auth.status === "authenticated" && userId !== null },
  );

  const run = useCallback(async <T,>(action: (id: number) => Promise<T>): Promise<T> => {
    if (userId === null) throw toOminitySdkError({ message: "You must be signed in.", status: 401, code: "UNAUTHENTICATED" });
    setPending((count) => count + 1);
    setError(null);
    try {
      return await action(userId);
    } catch (caught) {
      const failure = toOminitySdkError(caught);
      setError(failure);
      throw failure;
    } finally {
      setPending((count) => count - 1);
    }
  }, [userId]);

  const withMfaRefresh = <T,>(action: (id: number) => Promise<T>) => run(async (id) => {
    const result = await action(id);
    await mfa.refresh();
    return result;
  });

  return {
    user: auth.user,
    ready: auth.ready,
    pending: pending > 0,
    error,
    /** Changes profile fields or the password. */
    update: (body: UserUpdateInput): Promise<User> => run(async (id) => {
      const user = await sdk.users.update({ id, body });
      auth.setUser(user);
      return user;
    }),
    /**
     * The methods the channel offers (`authenticator`, `email`, `sms`, …), each with `isEnabled` for this user; empty
     * when the channel offers none.
     */
    mfaMethods: (mfa.data?.items ?? []) as ReadonlyArray<UserMfaMethod>,
    mfaLoading: mfa.loading,
    /**
     * Starts enabling an offered method. `authenticator` returns `details.qrCode` (an image), `details.uri` and
     * `details.secret`; `sms` needs `phone` in E.164 format. Email and SMS codes are sent with `sendMfaCode`.
     */
    enableMfa: (method: string, options: { readonly phone?: string } = {}): Promise<UserMfaMethod> => withMfaRefresh((id) =>
      sdk.users.mfaMethods.enable({ id, method, ...(options.phone ? { phone: options.phone } : {}) })),
    /** Confirms an enabled method with a code from it. */
    confirmMfa: (method: string, code: string): Promise<boolean> => withMfaRefresh(async (id) => {
      const result = await sdk.users.mfaMethods.validate({ id, method, code });
      if (result.success) await auth.refresh();
      return result.success;
    }),
    /**
     * Turns a method off. A method that is on needs proof: a current `code` of this method (for email and SMS, send
     * one first with `sendMfaCode`) or an unused `recoveryCode`. Without proof only a setup that was never confirmed
     * can be removed.
     */
    disableMfa: (method: string, proof?: OminityMfaMethodProof): Promise<void> => withMfaRefresh(async (id) => {
      await sdk.users.mfaMethods.disable({ id, method, ...proof });
      await auth.refresh();
    }),
    sendMfaCode: (method: string): Promise<void> => run(async (id) => {
      await sdk.users.mfaMethods.send({ id, method });
    }),
    recoveryCodes: (): Promise<ReadonlyArray<UserRecoveryCode>> => run(async (id) => (await sdk.users.recoveryCodes.list({ id })).items),
    /**
     * Replaces the recovery codes and returns the new ones in full (the only time they are). With MFA on it needs
     * proof: `method` and a current `code` of that enabled method, or an unused `recoveryCode`.
     */
    regenerateRecoveryCodes: (proof?: OminityMfaProof): Promise<ReadonlyArray<UserRecoveryCode>> => run(async (id) =>
      (await sdk.users.recoveryCodes.regenerate({ id, confirm: true, ...proof })).items),
    refreshMfa: mfa.refresh,
  };
}

/** The signed-in user's sign-in history (SDK `UserLogin`), newest first. */
export function useLoginActivity(options: Omit<UseOminitySdkPaginatedQueryOptions, "key"> = {}) {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  return useOminitySdkPaginatedQuery<UserLogin>(
    (client, { page, limit, signal }) => client.users.logins.list({ userId: userId as number, page, limit, sort: "-createdAt" }, { signal }),
    { ...options, key: [userId], enabled: (options.enabled ?? true) && auth.status === "authenticated" && userId !== null },
  );
}
