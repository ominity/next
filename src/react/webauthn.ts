"use client";

import { OminityActionError } from "../actions/client.js";

/**
 * Browser WebAuthn helpers for passkeys: Ominity sends options as WebAuthn JSON (base64url binary fields) and takes
 * the browser's answer as `PublicKeyCredential.toJSON()`. Browsers with the JSON helpers use them; older ones get the
 * small base64url conversion below.
 */

/** WebAuthn options as JSON (`publicKey` from a passkey challenge). */
export type OminityPasskeyOptionsJSON = Record<string, unknown> & { readonly challenge: string };

/** Whether this browser can use passkeys at all. */
export function isPasskeySupported(): boolean {
  return typeof window !== "undefined"
    && typeof window.PublicKeyCredential === "function"
    && typeof navigator !== "undefined"
    && typeof navigator.credentials?.get === "function";
}

/** Whether passkeys can be offered in the email field's autofill (`mediation: "conditional"`). */
export async function isPasskeyAutofillSupported(): Promise<boolean> {
  if (!isPasskeySupported()) return false;
  const check = (window.PublicKeyCredential as unknown as { isConditionalMediationAvailable?: () => Promise<boolean> })
    .isConditionalMediationAvailable;
  try {
    return typeof check === "function" ? await check.call(window.PublicKeyCredential) : false;
  } catch {
    return false;
  }
}

/**
 * Asks the browser for a passkey (sign-in). Cancelling, or no passkey, rejects with an `OminityActionError` coded
 * `PASSKEY_CANCELLED`, which is not a failed sign-in.
 */
export async function getPasskeyCredential(
  options: OminityPasskeyOptionsJSON,
  init: { readonly conditional?: boolean | undefined; readonly signal?: AbortSignal | undefined } = {},
): Promise<Record<string, unknown>> {
  ensureSupported();
  try {
    const credential = await navigator.credentials.get({
      publicKey: toRequestOptions(options),
      ...(init.conditional ? { mediation: "conditional" as CredentialMediationRequirement } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
    });
    return credentialToJSON(credential);
  } catch (error) {
    throw toPasskeyError(error);
  }
}

/** Asks the browser to create a passkey (registration). Cancelling rejects with `PASSKEY_CANCELLED`. */
export async function createPasskeyCredential(
  options: OminityPasskeyOptionsJSON,
  init: { readonly signal?: AbortSignal | undefined } = {},
): Promise<Record<string, unknown>> {
  ensureSupported();
  try {
    const credential = await navigator.credentials.create({
      publicKey: toCreationOptions(options),
      ...(init.signal ? { signal: init.signal } : {}),
    });
    return credentialToJSON(credential);
  } catch (error) {
    throw toPasskeyError(error);
  }
}

type JsonParsers = {
  parseRequestOptionsFromJSON?: (options: unknown) => PublicKeyCredentialRequestOptions;
  parseCreationOptionsFromJSON?: (options: unknown) => PublicKeyCredentialCreationOptions;
};

export function toRequestOptions(options: OminityPasskeyOptionsJSON): PublicKeyCredentialRequestOptions {
  const parsers = window.PublicKeyCredential as unknown as JsonParsers;
  if (typeof parsers.parseRequestOptionsFromJSON === "function") {
    return parsers.parseRequestOptionsFromJSON(options);
  }

  const allowCredentials = descriptors(options.allowCredentials);
  return {
    ...(options as unknown as PublicKeyCredentialRequestOptions),
    challenge: base64UrlToBuffer(options.challenge),
    ...(allowCredentials ? { allowCredentials } : {}),
  };
}

export function toCreationOptions(options: OminityPasskeyOptionsJSON): PublicKeyCredentialCreationOptions {
  const parsers = window.PublicKeyCredential as unknown as JsonParsers;
  if (typeof parsers.parseCreationOptionsFromJSON === "function") {
    return parsers.parseCreationOptionsFromJSON(options);
  }

  const user = options.user as { id: string; name: string; displayName: string };
  const excludeCredentials = descriptors(options.excludeCredentials);
  return {
    ...(options as unknown as PublicKeyCredentialCreationOptions),
    challenge: base64UrlToBuffer(options.challenge),
    user: { ...user, id: base64UrlToBuffer(user.id) },
    ...(excludeCredentials ? { excludeCredentials } : {}),
  };
}

export function credentialToJSON(credential: Credential | null): Record<string, unknown> {
  if (!credential) {
    throw passkeyCancelled();
  }

  const withJson = credential as Credential & { toJSON?: () => unknown };
  if (typeof withJson.toJSON === "function") {
    return withJson.toJSON() as Record<string, unknown>;
  }

  const key = credential as PublicKeyCredential;
  const response = key.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  const encoded: Record<string, unknown> = { clientDataJSON: bufferToBase64Url(response.clientDataJSON) };

  if ("attestationObject" in response && response.attestationObject) {
    encoded.attestationObject = bufferToBase64Url(response.attestationObject);
    encoded.transports = typeof response.getTransports === "function" ? response.getTransports() : [];
  }
  if ("authenticatorData" in response && response.authenticatorData) {
    encoded.authenticatorData = bufferToBase64Url(response.authenticatorData);
    encoded.signature = bufferToBase64Url(response.signature);
    if (response.userHandle) encoded.userHandle = bufferToBase64Url(response.userHandle);
  }

  return {
    id: key.id,
    rawId: bufferToBase64Url(key.rawId),
    type: key.type,
    authenticatorAttachment: key.authenticatorAttachment ?? null,
    clientExtensionResults: typeof key.getClientExtensionResults === "function" ? key.getClientExtensionResults() : {},
    response: encoded,
  };
}

function descriptors(value: unknown): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item: { id: string; type: "public-key"; transports?: AuthenticatorTransport[] }) => ({
    ...item,
    id: base64UrlToBuffer(item.id),
  }));
}

export function base64UrlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function bufferToBase64Url(buffer: ArrayBuffer | ArrayBufferView): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function ensureSupported(): void {
  if (!isPasskeySupported()) {
    throw new OminityActionError("Passkeys are not supported in this browser.", 400, "PASSKEY_UNSUPPORTED");
  }
}

function passkeyCancelled(): OminityActionError {
  return new OminityActionError("No passkey was used.", 400, "PASSKEY_CANCELLED");
}

function toPasskeyError(error: unknown): unknown {
  if (error instanceof OminityActionError) return error;
  const name = (error as { name?: unknown } | null)?.name;
  // The user closed the prompt, it timed out, or the browser has no matching passkey.
  if (name === "NotAllowedError" || name === "AbortError") return passkeyCancelled();
  if (name === "InvalidStateError") {
    return new OminityActionError("This passkey is already added.", 409, "PASSKEY_ALREADY_ADDED");
  }
  return new OminityActionError(error instanceof Error ? error.message : "The passkey could not be used.", 400, "PASSKEY_FAILED");
}
