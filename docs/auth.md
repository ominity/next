# Auth guide

`@ominity/next/auth` provides a server-first auth client on top of `@ominity/api-typescript@^1.4.5`.

## Scope

- OAuth2 token issuance (`issueToken`, `issuePasswordToken`, `issueRefreshToken`)
- user access token issuance (`issueUserAccessToken`)
- MFA methods (list/get/enable/disable/send/validate)
- recovery codes (list/regenerate/validate)
- user OAuth accounts and user customers
- user login activity recording, listing, and detail retrieval
- password reset link + password update
- signed session payload helpers (`sealAuthSession` / `unsealAuthSession`)

## Create the auth client

```ts
import { createAuthClient } from "@ominity/next/auth";

export const authClient = createAuthClient({
  sdk: {
    serverURL: process.env.OMINITY_API_URL ?? "",
    security: {
      apiKey: process.env.OMINITY_API_KEY ?? "",
    },
  },
  debug: {
    enabled: process.env.NODE_ENV !== "production",
  },
});
```

## OAuth2 flows

```ts
const token = await authClient.issuePasswordToken({
  username: "john@example.com",
  password: "secret",
  clientId: process.env.OMINITY_OAUTH_CLIENT_ID ?? "",
  clientSecret: process.env.OMINITY_OAUTH_CLIENT_SECRET ?? "",
});

const refreshed = await authClient.issueRefreshToken({
  refreshToken: token.refreshToken ?? "",
  clientId: process.env.OMINITY_OAUTH_CLIENT_ID ?? "",
  clientSecret: process.env.OMINITY_OAUTH_CLIENT_SECRET ?? "",
});
```

For non-password grants, use `issueToken` and pass explicit grant parameters.

## MFA and recovery

```ts
const methods = await authClient.listUserMfaMethods({ userId: 7 });
await authClient.sendUserMfaCode({ userId: 7, method: "totp" });
await authClient.validateUserMfaCode({ userId: 7, method: "totp", code: "123456" });

const codes = await authClient.listUserRecoveryCodes({ userId: 7 });
await authClient.validateUserRecoveryCode({ userId: 7, code: "abc-123" });
```

## Login activity

The standard password login, registration auto-login, and social-provider
callback handlers record successful interactive sign-ins automatically. They
resolve the IP address and user agent from the server request and authenticate
the activity request with the user access token stored in the encrypted session.
Token refreshes and session restoration do not create login records.

Activity recording is enabled by default. A recording failure does not reject an
otherwise valid login. Connect the error callback to application monitoring when
you need operational visibility:

```ts
const authConfig = {
  ominityBaseUrl: process.env.OMINITY_API_URL,
  authClientId: process.env.OMINITY_OAUTH_CLIENT_ID,
  authClientSecret: process.env.OMINITY_OAUTH_CLIENT_SECRET,
  authSessionSecret: process.env.OMINITY_AUTH_SESSION_SECRET,
  onLoginActivityError(error: unknown) {
    console.error("Could not record login activity", error);
  },
};
```

Add one optional catch-all route to serve both the list and item endpoints:

```ts
// app/api/auth/login-activity/[[...path]]/route.ts
import { createOminityAuthLoginActivityRouteHandlers } from "@ominity/next/auth/server";
import { authConfig } from "@/lib/ominity-auth";

export const { GET } = createOminityAuthLoginActivityRouteHandlers(authConfig);
```

The browser never supplies a user ID or access token. The route reads both from
the encrypted HttpOnly session, so it can only return the current user’s records.
The collection accepts `page`, `limit`, `sort`, `id`, `ipAddress`, and `location`.
Results default to newest first and include pagination metadata.

For custom server flows, the lower-level auth client exposes all three operations:

```ts
await authClient.recordUserLogin({
  userId: 7,
  ipAddress: "203.0.113.10",
  userAgent: "Browser user agent",
});

const activity = await authClient.listUserLogins({
  userId: 7,
  page: 1,
  limit: 20,
  sort: "-created_at",
});

const login = await authClient.getUserLogin({ userId: 7, loginId: 42 });
```

Client components can load and render activity without implementing request or
pagination state:

```tsx
"use client";

import { useOminityLoginActivity } from "@ominity/next/auth/react";

export function LoginActivity() {
  const { items, page, loading, error, refresh, get } =
    useOminityLoginActivity({ limit: 20 });

  // Render items in the project’s own design.
}
```

## Social-provider login

Add one optional catch-all route for provider discovery, starting OAuth, and
completing its callback:

```ts
// app/api/auth/social/[[...path]]/route.ts
import { createOminityAuthSocialRouteHandlers } from "@ominity/next/auth/server";
import { authConfig } from "@/lib/ominity-auth";

export const { GET } = createOminityAuthSocialRouteHandlers({
  ...authConfig,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  socialLoginSuccessPath: "/account",
  socialLoginFailurePath: "/login",
});
```

The route exposes:

- `GET /api/auth/social` — enabled providers for the branded login UI
- `GET /api/auth/social/{providerId}/start` — creates the provider redirect and
  sends the browser to it
- `GET /api/auth/social/{providerId}/callback?code=...` — consumes the one-time
  code, creates the encrypted user session, records login activity, and redirects
  to the configured success or failure page

A login button can be a normal same-origin link:

```tsx
<a href={`/api/auth/social/${provider.id}/start`}>
  Continue with {provider.name}
</a>
```

The callback accepts only provider accounts already linked to an Ominity user.
An unlinked provider identity redirects with
`socialError=SOCIAL_ACCOUNT_NOT_LINKED`; it is never matched to an existing user
by email automatically. The super-admin API key is used only by the server route
to issue the linked user's access token, and the browser receives only the
encrypted HttpOnly session cookie.

## Password reset

```ts
await authClient.sendPasswordResetLink({
  email: "john@example.com",
  redirectUrl: "https://app.example.com/reset",
});

await authClient.resetPassword({
  email: "john@example.com",
  token: "reset-token",
  password: "new-password",
});
```

## Signed sessions and cookies

Use signed session payloads for cookie integrity.

```ts
import { createAuthSession, sealAuthSession, unsealAuthSession } from "@ominity/next/auth";

const session = createAuthSession(token, { userId: 7 });
const signed = await sealAuthSession(session, {
  secret: process.env.AUTH_SESSION_SECRET ?? "",
});
const parsed = await unsealAuthSession(signed, {
  secret: process.env.AUTH_SESSION_SECRET ?? "",
});
```

`@ominity/next/next` also exposes cookie helpers:

- `writeAuthSessionCookie` (async, signs by default when `sessionSecret` is set)
- `readAuthSessionCookie` (async, validates signature when `sessionSecret` is set)
- `clearAuthSessionCookie`

## Security recommendations

- keep auth operations server-side (Route Handlers / Server Actions)
- expose login activity through the session-bound route handler
- do not expose OAuth client secrets to client bundles
- prefer signed cookies (`sessionSecret`) over unsigned payload cookies
- use long, random session secrets (32+ chars)
- treat password grant as legacy-friendly and scope it tightly
