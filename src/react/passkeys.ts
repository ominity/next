"use client";

import type { UserPasskey } from "@ominity/api-typescript/models/identity/user-passkey";
import { useCallback, useState } from "react";

import type { OminityActionError } from "../actions/client.js";
import { toOminitySdkError } from "../sdk/errors.js";
import { useOminitySdk, useOminitySdkQuery } from "../sdk/react.js";
import { useAuth } from "./auth.js";
import { createPasskeyCredential, type OminityPasskeyOptionsJSON } from "./webauthn.js";

export {
  isPasskeyAutofillSupported,
  isPasskeySupported,
} from "./webauthn.js";

/**
 * The signed-in user's passkeys, for an account page: the list, and adding, renaming and removing them. Everything
 * goes through the SDK with the user's session; the ceremony runs on this page's origin, which must be one of the
 * channel's domains in Ominity.
 *
 * Adding needs a recent sign-in: after ten minutes `addPasskey` rejects with code
 * `passkey.reauthentication_required`; ask the user to sign in again first. Closing the browser's prompt rejects with
 * `PASSKEY_CANCELLED` (not stored in `error`).
 */
export function usePasskeys() {
  const auth = useAuth();
  const sdk = useOminitySdk();
  const userId = auth.user?.id ?? null;
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<OminityActionError | null>(null);
  const list = useOminitySdkQuery(
    (client, { signal }) => client.users.passkeys.list({ userId: userId as number }, { signal }),
    { key: [userId], enabled: auth.status === "authenticated" && userId !== null },
  );

  const run = useCallback(async <T,>(action: (id: number) => Promise<T>): Promise<T> => {
    if (userId === null) throw toOminitySdkError({ message: "You must be signed in.", status: 401, code: "UNAUTHENTICATED" });
    setPending((count) => count + 1);
    setError(null);
    try {
      const result = await action(userId);
      await list.refresh();
      return result;
    } catch (caught) {
      const failure = toOminitySdkError(caught);
      if (failure.code !== "PASSKEY_CANCELLED") setError(failure);
      throw failure;
    } finally {
      setPending((count) => count - 1);
    }
  }, [list, userId]);

  return {
    passkeys: (list.data?.items ?? []) as ReadonlyArray<UserPasskey>,
    loading: list.loading,
    pending: pending > 0,
    error,
    /** Creates a passkey on this device (or a phone, via the browser's prompt) and adds it. */
    addPasskey: (name?: string): Promise<UserPasskey> => run(async (id) => {
      const challenge = await sdk.users.passkeys.createChallenge({ userId: id, origin: window.location.origin });
      const credential = await createPasskeyCredential(challenge.publicKey as OminityPasskeyOptionsJSON);
      return sdk.users.passkeys.create({
        userId: id,
        challengeId: challenge.challengeId,
        credential,
        ...(name && name.trim() !== "" ? { name: name.trim() } : {}),
      });
    }),
    renamePasskey: (passkeyId: number, name: string): Promise<UserPasskey> => run((id) =>
      sdk.users.passkeys.update({ userId: id, id: passkeyId, name })),
    /** Removes a passkey; the user can still sign in with an emailed code. */
    removePasskey: (passkeyId: number): Promise<void> => run(async (id) => {
      await sdk.users.passkeys.delete({ userId: id, id: passkeyId });
    }),
    refresh: list.refresh,
  };
}
