# Auth guide

Sign-in runs on the server. The auth routes exchange credentials for OAuth tokens, keep them in an encrypted,
HttpOnly session cookie and return only the signed-in state to the browser. Client components read and change that
state with `useAuth` and `useUser` from `@ominity/next/react`. Every value they return is an
`@ominity/api-typescript` model (`User`, `UserMfaMethod`, `UserRecoveryCode`, `UserLogin`, …).

Requires `@ominity/api-typescript` `^1.6.0`.

## Setup

Mount the routes once with `createOminityRouteHandlers` (see the [README](../README.md#one-route-file-for-every-server-route))
and wrap the app in `OminityProvider`:

```ts
// app/api/[...ominity]/route.ts
import { createOminityRouteHandlers } from "@ominity/next/routes";

export const { GET, POST, PATCH, PUT, DELETE } = createOminityRouteHandlers({
  ominityBaseUrl: process.env.OMINITY_API_URL,
  ominityApiKey: process.env.OMINITY_API_KEY,
  authClientId: process.env.OMINITY_AUTH_CLIENT_ID,
  authClientSecret: process.env.OMINITY_AUTH_CLIENT_SECRET,
  authSessionSecret: process.env.OMINITY_AUTH_SESSION_SECRET,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnv: process.env.NODE_ENV,
  auth: {
    socialLoginSuccessPath: "/account",
    socialLoginFailurePath: "/auth/login",
    socialLoginMfaPath: "/auth/mfa",
  },
});
```

```tsx
// app/providers.tsx
"use client";

import { OminityProvider } from "@ominity/next/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <OminityProvider>{children}</OminityProvider>;
}
```

`authSessionSecret` must be at least 32 characters; production refuses to start without one. Other auth options:
`authScope`, `authCookieName`, `authCookieMaxAgeSeconds`, `channelId`, `resolveLanguage`, `loginActivityEnabled`,
`onLoginActivityError`, `debugEnabled` and `emailCodePath` (the page emailed codes link to, default `/auth/verify`). `auth.socialLoginSuccessPath`, `auth.socialLoginFailurePath` and
`auth.socialLoginMfaPath` (defaults `/`, `/login` and the success path) may be functions, evaluated per request, e.g. to follow the channel's default locale. Pass
`auth: false` to switch the routes off.

The routes below `/api/auth`:

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `login` | Password sign-in |
| `POST` | `register` | Create a user and sign in |
| `POST` | `email-code/send`, `email-code/verify` | Email-first signup and passwordless sign-in |
| `POST` | `passkey/challenge`, `passkey/verify` | Passkey sign-in (email-first or discoverable) |
| `POST` | `logout` | Clear the session |
| `GET` | `me` | Current `OminityAuthState` |
| `POST` | `refresh` | Refresh the OAuth tokens in the session |
| `GET` | `mfa/methods` | Methods of the pending sign-in |
| `POST` | `mfa/send` | Send a code (email, SMS) |
| `POST` | `mfa/validate`, `mfa/recovery/validate` | Complete a pending sign-in |

Ominity limits two-factor codes per user: 5 wrong codes in 15 minutes or 20 a day (method codes and recovery codes
together), and 5 codes sent in 15 minutes. Past that, `mfa/validate` and `mfa/recovery/validate` answer `429`
`MFA_RATE_LIMITED`, and `mfa/send` answers `429` `MFA_SEND_RATE_LIMITED`, with `Retry-After` and
`details.retryAfter` (seconds). A wrong code is still `422`.
| `POST` | `password/forgot`, `password/reset` | Password reset |
| `GET` | `login-activity[/{id}]` | The user's sign-in history |
| `GET` | `social`, `social/{providerId}/start`, `social/{providerId}/callback` | Social sign-in |

## Auth state

```ts
type OminityAuthState =
  | { status: "anonymous" }
  | { status: "mfa_required"; methods: ReadonlyArray<UserMfaMethod> }
  | { status: "authenticated"; user: User; expiresAt: string };
```

`signIn`, `register`, `verifyEmailCode`, `signInWithPasskey`, `verifyMfa`, `verifyRecoveryCode` and `refresh` resolve to this state. `useAuth().status` is
`"loading"` until the first `me` request completes.

## `useAuth`

| Member | |
| --- | --- |
| `status`, `ready` | Auth status; `ready` once it is known |
| `user`, `expiresAt` | The SDK `User` and session expiry when authenticated, otherwise `null` |
| `mfaMethods` | Methods that can complete a pending sign-in |
| `pending`, `error` | Any auth request in flight; the last failure as `OminityActionError` |
| `signIn({ email, password })` | Password sign-in |
| `register({ firstName, email, password, lastName? })` | Create the user and sign in |
| `sendEmailCode(email)` | Email a 6-digit sign-in or signup code; resolves to `{ expiresAt, resendAvailableAt }` |
| `verifyEmailCode({ email, code })` | Sign in with the code; a signup code creates the user |
| `checkPasskeys(email)` | Whether this email can sign in with a passkey here; resolves to `{ hasPasskeys }` |
| `signInWithPasskey({ email?, conditional?, signal? })` | Open the browser's passkey prompt and sign in (no MFA step) |
| `signOut()` | End the session |
| `sendMfaCode(method)` | Send a code for `email` or `sms` |
| `verifyMfa(method, code)`, `verifyRecoveryCode(code)` | Complete a pending sign-in |
| `requestPasswordReset({ email, redirectUrl })` | Send a reset link to `redirectUrl` |
| `resetPassword({ email, token, password })` | Complete a reset |
| `listSocialProviders()` | Enabled social providers (`id`, `provider`, `name`, `icon`, `isEnabled`) |
| `socialSignInUrl(providerId)` | URL that starts a social sign-in |
| `refresh()` | Reload the state from the server |
| `setUser(user)` | Replace the signed-in user (used by `useUser`) |

```tsx
"use client";

import { useAuth } from "@ominity/next/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const auth = useAuth();
  const router = useRouter();

  async function submit(form: FormData) {
    const state = await auth.signIn({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    router.push(state.status === "mfa_required" ? "/auth/mfa" : "/account");
  }

  return (
    <form action={submit}>
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button disabled={auth.pending}>Sign in</button>
      {auth.error && <p>{auth.error.message}</p>}
    </form>
  );
}
```

## MFA at sign-in

A password or social sign-in of a user with MFA returns `mfa_required`. The session is pending: `me` keeps answering
`mfa_required`, a refresh never completes it, and the SDK gateway, commerce and customer-account routes treat the
browser as signed out until `verifyMfa` or `verifyRecoveryCode` succeeds. Login activity is recorded only then.

```tsx
const auth = useAuth();

if (auth.status === "mfa_required") {
  // auth.mfaMethods: [{ method: "authenticator", … }, { method: "email", … }] (the methods this user turned on)
  await auth.sendMfaCode("email");
  await auth.verifyMfa("email", code); // or auth.verifyRecoveryCode("ABC-123")
}
```

A social sign-in that still needs the second factor redirects to `auth.socialLoginMfaPath` (falling back to the
success path) with `socialLogin=mfa_required`.

## Email codes (signup and passwordless sign-in)

```ts
await auth.sendEmailCode(email);
// On the next screen, or on `emailCodePath` with `#email=…&code=…` from the email's link:
const state = await auth.verifyEmailCode({ email, code });
```

`sendEmailCode` answers the same whether or not the email has an account: Ominity emails a sign-in code to existing
users and a signup code to anyone else (`POST /v1/users/email-codes`, with the API key). A signup code creates the user
with a verified email and no password, and empty names. The email's link always points to `emailCodePath` on
`siteUrl`; a link from the request is never used. Codes expire after 15 minutes and allow five attempts.

Requirements in Ominity: the `user_signup_code` and `user_login_code` email templates (Settings → Notifications) and
the `email_code` grant on the auth client (added to user password clients by default). A user with MFA still gets
`mfa_required`.

The link carries the code in the URL fragment, so the verify page reads it with JavaScript and should not submit on
load: mail scanners open links. Fill the code in and let the user confirm.

## Passkeys

Users sign in with a passkey kept by their browser, phone or password manager. Ominity only runs passkey ceremonies
on the channel's own domains (Settings → Channels → Domains), so add each origin the site runs on, including
`http://localhost:3000` for development. A channel's optional passkey domain (for example `example.com`) lets
`app.example.com` and `shop.example.com` share passkeys.

Email first: ask for the email, check it, then offer the passkey or another way in.

```tsx
const auth = useAuth();

const { hasPasskeys } = await auth.checkPasskeys(email);
if (hasPasskeys) {
  // Opens the prompt right away: the challenge from checkPasskeys is reused.
  await auth.signInWithPasskey({ email });
} else {
  await auth.sendEmailCode(email); // or a password field
}
```

Without an email ("Sign in with a passkey"), `signInWithPasskey()` offers any passkey the browser has for the site.
For autofill, give the email field `autocomplete="username webauthn"` and start a conditional sign-in on page load:

```tsx
useEffect(() => {
  const controller = new AbortController();
  isPasskeyAutofillSupported().then((supported) => {
    if (supported) auth.signInWithPasskey({ conditional: true, signal: controller.signal }).catch(() => {});
  });
  return () => controller.abort();
}, []);
```

- `checkPasskeys` answers `false` for an unknown email and for a user without passkeys alike. It is limited per
  email and per visitor IP; past that the routes answer `429` `PASSKEY_RATE_LIMITED`.
- Closing the prompt rejects with code `PASSKEY_CANCELLED` (not stored in `error`), an email without passkeys with
  `NO_PASSKEYS`, an answer Ominity doesn't accept with `401` `INVALID_PASSKEY`, and a site that isn't one of the
  channel's domains with `422` `PASSKEY_NOT_AVAILABLE`.
- A passkey with user verification is already two factors: the sign-in never answers `mfa_required`.
- Requirements in Ominity: the `passkey` grant on the auth client (added to user password clients by default), and the
  site's origin among the channel's domains.

Add and manage passkeys on the account page with `usePasskeys()`:

```tsx
const { passkeys, addPasskey, renamePasskey, removePasskey, pending, error } = usePasskeys();
await addPasskey("MacBook"); // the name is optional; it defaults to the provider (iCloud Keychain, …)
```

Adding needs a recent sign-in: after ten minutes `addPasskey` rejects with code `passkey.reauthentication_required`,
so ask the user to sign in again first. `isPasskeySupported()` tells whether the browser can use passkeys at all.

## Password reset

```ts
await auth.requestPasswordReset({
  email,
  redirectUrl: new URL("/auth/reset-password", window.location.origin).toString(),
});

// On the reset page, with the token and email from the link:
await auth.resetPassword({ email, token, password });
```

## Social sign-in

```tsx
const providers = await auth.listSocialProviders();

{providers.map((provider) => (
  <a key={provider.id} href={auth.socialSignInUrl(provider.id)}>Continue with {provider.name}</a>
))}
```

The callback consumes the one-time code, creates the session and redirects with `socialLogin=success` (or to the
MFA path with `socialLogin=mfa_required`), or to the
failure path with `socialLogin=error` and `socialError` (`SOCIAL_ACCOUNT_NOT_LINKED`, `SOCIAL_LOGIN_USER_MISMATCH`,
`SOCIAL_LOGIN_USER_UNAVAILABLE` or `SOCIAL_LOGIN_FAILED`). Only provider accounts already linked to an Ominity user
can sign in; they are never matched to a user by email. The API key is used only on the server to issue the linked
user's token.

## `useUser`

The signed-in user's own settings, through the SDK with the user's session (`users/{self}/**` on the gateway).

| Member | |
| --- | --- |
| `user`, `ready`, `pending`, `error` | As in `useAuth`, plus shared state for these actions |
| `update(body)` | `UserUpdateInput` (profile fields or password); returns the updated `User` |
| `mfaMethods`, `mfaLoading`, `refreshMfa()` | The user's `UserMfaMethod`s |
| `mfaMethods` | The methods the channel offers, each with `isEnabled` for this user; empty when none are offered |
| `enableMfa(method, { phone })` | Starts enabling an offered method. `authenticator` returns `details.qrCode` (image), `details.uri` (`otpauth://`) and `details.secret`; `sms` needs `phone` (E.164). Send email and SMS codes with `sendMfaCode` |
| `confirmMfa(method, code)` | Confirms the method; resolves `true` when the code was valid |
| `disableMfa(method, proof?)` | Turns a method off. A method that is on needs `proof`: `{ code }` (a current code of this method; send one first for email and SMS) or `{ recoveryCode }` |
| `sendMfaCode(method)` | Sends a code (email, SMS) |
| `recoveryCodes()` | `UserRecoveryCode`s, masked (`••••••K7`) |
| `regenerateRecoveryCodes(proof?)` | New codes, returned in full this once. With MFA on it needs `proof`: `{ method, code }` or `{ recoveryCode }` |

Wrong proof counts against the same per-user limit as signing in; failures reject with an `OminityActionError`
(`status` 422 and `reason` `mfa.verification_failed` for a wrong code, 429 with `details.retryAfter` past the limit).

```tsx
"use client";

import type { UserMfaMethod } from "@ominity/api-typescript/models/identity/user-mfa-method";
import { useUser } from "@ominity/next/react";
import { useState } from "react";

export function AuthenticatorSetup() {
  const profile = useUser();
  const [setup, setSetup] = useState<UserMfaMethod | null>(null);
  const [code, setCode] = useState("");

  if (!setup) return <button onClick={async () => setSetup(await profile.enableMfa("authenticator"))}>Set up</button>;

  return (
    <div>
      {setup.details?.qrCode && <img src={setup.details.qrCode} alt="Scan with your authenticator app" />}
      <input value={code} onChange={(event) => setCode(event.target.value)} />
      <button disabled={profile.pending} onClick={() => void profile.confirmMfa("authenticator", code)}>Confirm</button>
    </div>
  );
}
```

## `usePasskeys`

The signed-in user's passkeys, through the SDK with the user's session (`users/{self}/passkeys` on the gateway).

| Member | |
| --- | --- |
| `passkeys`, `loading`, `refresh()` | The user's `UserPasskey`s (name, provider, synced, last used), newest first |
| `pending`, `error` | Shared state for these actions |
| `addPasskey(name?)` | Create a passkey on this device (or a phone, through the browser's prompt) and add it |
| `renamePasskey(id, name)`, `removePasskey(id)` | Rename or remove one; the user can still sign in with an emailed code |

## `useLoginActivity`

The user's sign-in history as SDK `UserLogin`s, newest first, with the paginated query result of
[`useOminitySdkPaginatedQuery`](sdk.md#paginated-lists).

```tsx
const activity = useLoginActivity({ pageSize: 10 });

activity.items.map((login) => `${login.browser} · ${login.ipAddress} · ${login.createdAt}`);
```

Successful password, registration and linked social sign-ins are recorded automatically, with the IP address and user
agent of the request. Token refreshes and session restores are not. A failed recording never fails the sign-in; pass
`onLoginActivityError` to report it, or `loginActivityEnabled: false` to turn recording off.

## Server-side helpers

For custom server flows, `@ominity/next/auth` keeps the lower-level pieces:

- `createAuthClient({ sdk, debug })`: OAuth2 grants (`issueToken`, `issuePasswordToken`, `issueRefreshToken`,
  `issueUserAccessToken`), MFA methods and recovery codes, login activity (`recordUserLogin`, `listUserLogins`,
  `getUserLogin`), OAuth accounts, user customers and password reset;
- `createAuthSession`, `sealAuthSession`, `unsealAuthSession` and `isAuthSessionExpired` for signed sessions;
- `readOminityAuthSession` and `createOminityUserAccessSdk` to call the API as the signed-in user from your own
  route handlers.

`@ominity/next/auth/server` exports each auth route factory separately
(`createOminityAuthLoginRouteHandler`, `createOminityAuthSocialRouteHandlers`, …) for projects that want their own
route files. `@ominity/next/next` has the cookie helpers `readAuthSessionCookie`, `writeAuthSessionCookie` and
`clearAuthSessionCookie`.

## Security

- The browser never receives the OAuth client secret, the API key, or the user's access and refresh tokens.
- Use a long, random `authSessionSecret` and the same one for every route that reads the session.
- With `devTool` on, auth requests stay out of the Dev Tool request log, because their bodies hold passwords and
  tokens.
