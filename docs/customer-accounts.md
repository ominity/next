# Customer accounts and teams

The customer account module supplies the application behavior while the
storefront owns its markup and styling. It uses the customer membership, role,
permission, and invitation models from `@ominity/api-typescript` without local
wire-model copies.

## Add the App Router endpoint

Create one optional catch-all route:

```ts
// app/api/customer-accounts/[[...path]]/route.ts
import { createOminityCustomerAccountsRouteHandlers } from "@ominity/next/customer-accounts/server";

const handlers = createOminityCustomerAccountsRouteHandlers({
  ominityBaseUrl: process.env.OMINITY_API_URL,
  channelId: process.env.OMINITY_CHANNEL_ID,
  authClientId: process.env.OMINITY_AUTH_CLIENT_ID,
  authClientSecret: process.env.OMINITY_AUTH_CLIENT_SECRET,
  authSessionSecret: process.env.OMINITY_AUTH_SESSION_SECRET,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnv: process.env.NODE_ENV,
  resolveLanguage: (request) => request.headers.get("x-locale") ?? "en",
});

export const { GET, POST, PATCH, DELETE } = handlers;
```

The default route surface is:

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/customer-accounts` | List memberships and resolve the active account |
| `POST` | `/api/customer-accounts/switch` | Validate membership and switch the active account |
| `GET` | `/api/customer-accounts/members` | List members of the active account |
| `PATCH` | `/api/customer-accounts/members/{userId}` | Assign a member role |
| `DELETE` | `/api/customer-accounts/members/{userId}` | Remove a member |
| `GET` | `/api/customer-accounts/invitations` | List invitations |
| `POST` | `/api/customer-accounts/invitations` | Create and email an invitation |
| `GET` | `/api/customer-accounts/invitations/{id}` | Load one invitation |
| `DELETE` | `/api/customer-accounts/invitations/{id}` | Revoke an invitation |
| `POST` | `/api/customer-accounts/invitations/inspect` | Publicly inspect an email token |
| `POST` | `/api/customer-accounts/invitations/accept` | Accept as the authenticated user |
| `GET` | `/api/customer-accounts/roles` | List roles assignable through the channel |
| `GET` | `/api/customer-accounts/permissions` | Load translated permission metadata |

The active customer ID is stored in an HttpOnly, `SameSite=Lax` cookie. The
cookie is only a preference: switching validates the membership through
Ominity, context loading removes stale selections, and each team operation is
authorized again by the backend with the user's OAuth access token.

`basePath`, the active-customer cookie name and lifetime, the invitation page
path, and the invitation accept URL resolver are configurable. By default,
invitation emails link to `/account/invitations/{token}` on `siteUrl`.

## Add the headless React state

The customer account provider belongs inside `OminityAuthProvider`:

```tsx
"use client";

import { OminityAuthProvider } from "@ominity/next/auth/react";
import { OminityCustomerAccountsProvider } from "@ominity/next/customer-accounts/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <OminityAuthProvider>
      <OminityCustomerAccountsProvider teamPageSize={100}>
        {children}
      </OminityCustomerAccountsProvider>
    </OminityAuthProvider>
  );
}
```

The provider loads account context when auth becomes ready. It loads the first
team page when the active membership has `commerce.users.view`. Set
`autoLoadTeam={false}` to load team resources only on a team page.

Account switching and resource loads discard stale responses when a user
switches again before an earlier request completes. `teamErrors` is stored per
resource, so a failed invitation request does not hide successfully loaded
members or roles.

## Render an account switcher

```tsx
"use client";

import { useOminityCustomerAccounts } from "@ominity/next/customer-accounts/react";

export function AccountSwitcher() {
  const accounts = useOminityCustomerAccounts();

  if (!accounts.ready || accounts.memberships.length < 2) return null;

  return (
    <select
      value={accounts.activeCustomerId ?? ""}
      disabled={accounts.isMutationPending("switch")}
      onChange={(event) => void accounts.switchCustomer(Number(event.target.value))}
    >
      {accounts.memberships.map((membership) => (
        <option key={membership.customerId} value={membership.customerId}>
          {membership.customer?.name ?? `Account ${membership.customerId}`}
        </option>
      ))}
    </select>
  );
}
```

Switching updates the shared context, clears data belonging to the previous
account, and triggers a fresh team load when enabled.

## Render team actions from permissions

Roles remain authoritative for permissions. UI checks improve the experience;
the Ominity API remains the authorization boundary.

```tsx
"use client";

import { CUSTOMER_PERMISSIONS } from "@ominity/next/customer-accounts";
import {
  CustomerPermissionBoundary,
  useOminityCustomerAccounts,
} from "@ominity/next/customer-accounts/react";

export function Team() {
  const accounts = useOminityCustomerAccounts();

  return (
    <section>
      <ul>
        {accounts.members?.items.map((member) => (
          <li key={member.userId}>
            {member.firstName} {member.lastName} - {member.role?.name}
          </li>
        ))}
      </ul>

      <CustomerPermissionBoundary required={CUSTOMER_PERMISSIONS.usersManage}>
        <button
          type="button"
          onClick={() => void accounts.createInvitation({
            email: "colleague@example.com",
            roleId: accounts.roles?.items[0]?.id ?? 0,
          })}
        >
          Invite user
        </button>
      </CustomerPermissionBoundary>
    </section>
  );
}
```

Use `can`, `canAll`, `canAny`, `useCustomerPermission`, or
`CustomerPermissionBoundary` with any registered customer permission string.
`CUSTOMER_PERMISSIONS` contains the standard commerce keys, including
`commerce.users.manage`; modules can add their own keys without a package
change.

The roles endpoint exposes the roles assignable for the active channel. An
empty channel role selection means all assignable roles. Creating, editing, and
deleting the global role catalogue stays in the admin permission domain and is
therefore not exposed through these customer OAuth routes.

## Complete invitations through normal auth

Inspection is public so an invitation page can show the customer, role, expiry,
and whether account creation is required. Acceptance always requires the normal
authenticated user session.

```tsx
const accounts = useOminityCustomerAccounts();

const invitation = await accounts.inspectInvitation(token);

if (invitation.requiresAccountCreation) {
  const result = await accounts.registerAndAcceptInvitation(token, {
    firstName: "Jamie",
    lastName: "Doe",
    email: invitation.email,
    password,
  });

  if (result.status === "requires-sign-in") {
    // Render the normal sign-in form, then call acceptInvitation(token).
  }
}
```

For existing users, `signInAndAcceptInvitation(token, credentials)` uses the
normal sign-in route. It returns `requires-mfa` when the regular MFA flow must
finish first; call `acceptInvitation(token)` after MFA validation. Both helpers
check the submitted email before authentication, and Ominity verifies the
authenticated user's email again when accepting.

There is no invitation-specific signup endpoint. Projects can render their
existing sign-in, registration, and MFA components around these outcomes.

## Loading, mutations, and errors

`ready` describes initial account-context loading and `loading` covers later
context refreshes or switching. `teamLoading` covers the combined team load.
Every resource can also be paged independently with `loadMembers`,
`loadInvitations`, and `loadRoles`.

Mutation keys make buttons easy to disable without a project-owned request
state machine:

- `switch`
- `invite`
- `accept-invitation`
- `member:{userId}:role`
- `member:{userId}:remove`
- `invitation:{id}:revoke`

Failures use `CustomerAccountsError`, which exposes the safe response message,
HTTP status, stable code, validation details, and authentication,
authorization, validation, and retryability helpers.
