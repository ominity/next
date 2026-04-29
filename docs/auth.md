# Auth guide

`@ominity/next/auth` provides a server-first auth client on top of `@ominity/api-typescript@^1.1.1`.

## Scope

- OAuth2 token issuance (`issueToken`, `issuePasswordToken`, `issueRefreshToken`)
- user access token issuance (`issueUserAccessToken`)
- MFA methods (list/get/enable/disable/send/validate)
- recovery codes (list/regenerate/validate)
- user OAuth accounts and user customers
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
- do not expose OAuth client secrets to client bundles
- prefer signed cookies (`sessionSecret`) over unsigned payload cookies
- use long, random session secrets (32+ chars)
- treat password grant as legacy-friendly and scope it tightly
