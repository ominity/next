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
| `GET` | `/api/customer-accounts/customer` | Load the active customer account |
| `PATCH` | `/api/customer-accounts/customer` | Update active customer details |
| `GET/POST` | `/api/customer-accounts/addresses` | List or create addresses |
| `GET/PATCH/DELETE` | `/api/customer-accounts/addresses/{id}` | Load, update, or remove an address |
| `GET` | `/api/customer-accounts/groups[/{id}]` | List or load customer groups |
| `GET` | `/api/customer-accounts/mandates[/{id}]` | List or load mandates |
| `GET/POST` | `/api/customer-accounts/payments` | List or create payments |
| `GET` | `/api/customer-accounts/payments/{id}` | Load a payment |
| `GET/POST` | `/api/customer-accounts/orders` | List or place orders |
| `GET` | `/api/customer-accounts/orders/{id}` | Load an order |
| `GET` | `/api/customer-accounts/invoices[/{id}]` | List or load invoices |
| `GET` | `/api/customer-accounts/invoices/{id}/pdf` | Download an invoice PDF |
| `GET` | `/api/customer-accounts/subscriptions` | List subscriptions |
| `GET/DELETE` | `/api/customer-accounts/subscriptions/{id}` | Load or cancel a subscription |
| `GET` | `/api/customer-accounts/subscriptions/{id}/transition-products[/{productId}]` | List or load transition products |

The active customer ID is stored in an HttpOnly, `SameSite=Lax` cookie. The
cookie is only a preference: switching validates the membership through
Ominity, context loading removes stale selections, and each team operation is
authorized again by the backend with the user's OAuth access token.

`basePath`, the active-customer cookie name and lifetime, the invitation page
path, and the invitation accept URL resolver are configurable. By default,
invitation emails link to `/account/invitations/{token}` on `siteUrl`.

The route factory only exposes backend workflows that have complete behavior.
Mandate mutation, payment deletion, order update/deletion, direct subscription
creation, subscription pause/resume, and manual renewal remain absent until the
corresponding backend domain operations are implemented.

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

## Load account resources

`useOminityCustomerAccounts()` exposes the configured `client`. Its nested
`customer`, `addresses`, `groups`, `mandates`, `payments`, `orders`, `invoices`,
and `subscriptions` clients use the active account selected by the server. A
browser never supplies a customer ID, user access token, or API key.

Use `useOminityCustomerQuery` for account-bound data. It cancels superseded
loads, reloads after an account switch, and never exposes data returned for the
previous account. The optional permission is an early UI check; the route and
Ominity API both authorize the request again.

```tsx
"use client";

import { CUSTOMER_PERMISSIONS } from "@ominity/next/customer-accounts";
import { useOminityCustomerQuery } from "@ominity/next/customer-accounts/react";

export function Orders() {
  const orders = useOminityCustomerQuery(
    ({ client, signal }) => client.orders.list(
      { page: 1, limit: 25, sort: "-created_at", include: "invoice,payments" },
      { signal },
    ),
    { permission: CUSTOMER_PERMISSIONS.ordersView },
  );

  // Render orders.data, orders.loading, orders.error and orders.refresh.
}
```

Mutations use the same typed client and accept `AbortSignal` or custom headers.
Pass an `Idempotency-Key` for operations where the application needs retry-safe
creation.

```tsx
const { client, can } = useOminityCustomerAccounts();

if (can(CUSTOMER_PERMISSIONS.addressesManage)) {
  await client.addresses.create(address, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
}
```

The package re-exports the SDK's original `Customer`, `Address`, `Order`,
`Invoice`, `Payment`, `Mandate`, `Subscription`, `Product`, and operation input
types. It does not create prefixed copies or alternate wire models.

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
