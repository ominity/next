# Customer accounts and teams

A signed-in user belongs to one or more customer accounts: the SDK's `CustomerUser` memberships, each with its
`customer`, role and permissions. A consumer with one personal account and a business user with several work the
same way. `OminityProvider` loads the memberships and keeps one of them active; the hooks in `@ominity/next/react`
read the active account's data through the SDK gateway with the user's own token:

- `useCustomer`, `usePermission`, `<Can>`: the active account and permission checks;
- `useOrders`, `useInvoices`, `useSubscriptions`, `useSubscription`, `useAddresses`: its resources;
- `useOminityCustomerAccounts`: team members, invitations and roles.

Everything they return is an `@ominity/api-typescript` model (`CustomerUser`, `Customer`, `Order`, `Invoice`,
`Subscription`, `SubscriptionChange`, `Address`, …). Anything without a hook is the SDK itself, see
[below](#anything-else-the-sdk).

## Setup

The customer-account routes are part of `createOminityRouteHandlers` (see the
[README](../README.md#one-route-file-for-every-server-route)). Their options sit at the top level of the config:

| Option | |
| --- | --- |
| `activeCustomerCookieName`, `activeCustomerCookieMaxAgeSeconds` | The active-account cookie |
| `invitationAcceptPath` | Invitation page on `siteUrl`. Defaults to `/account/invitations/{token}` |
| `resolveInvitationAcceptUrl({ request, customerId, email })` | Builds the invitation link, e.g. per locale |

Pass `customerAccounts: false` to switch the routes off. On the browser side, `OminityProvider` takes
`customerAccounts={{ teamPageSize, autoLoadTeam, clientOptions }}`: the team page size (default 100, at most 250),
whether to load the team when the active membership has `commerce.users.view` (default `true`), and the client's
`basePath` (default `/api/customer-accounts`).

The active customer id is stored in an HttpOnly, `SameSite=Lax` cookie. It is only a preference: switching validates
the membership through Ominity, a stale selection is dropped, and Ominity authorizes every request again with the
user's access token. The browser never sends a customer id that the server trusts.

The routes below `/api/customer-accounts`:

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/` | Memberships and the active account |
| `POST` | `switch` | Switch the active account |
| `GET` | `members`, `roles`, `permissions` | Team members, assignable roles, translated permission metadata |
| `PATCH/DELETE` | `members/{userId}` | Assign a role, remove a member |
| `GET/POST` | `invitations` | List or create (and email) invitations |
| `GET/DELETE` | `invitations/{id}` | Load or revoke an invitation |
| `POST` | `invitations/inspect`, `invitations/accept` | Inspect a token (public), accept as the signed-in user |

The routes for `customer`, `addresses`, `groups`, `mandates`, `payments`, `orders`, `invoices` and `subscriptions`
still exist for the deprecated resource clients on `useOminityCustomerAccounts().client`. The hooks below use the
SDK instead.

## `useCustomer`

| Member | |
| --- | --- |
| `ready`, `loading`, `error` | First load; later reloads and switches; the last failure |
| `memberships` | Every `CustomerUser` of the user |
| `membership`, `customer`, `customerId` | The active membership, its `Customer` and id |
| `switchTo(customerId)`, `refresh()` | |
| `can(permission)`, `canAll(required)`, `canAny(required)` | Permission checks on the active membership |

```tsx
"use client";

import { useCustomer } from "@ominity/next/react";

export function AccountSwitcher() {
  const accounts = useCustomer();
  if (!accounts.ready || accounts.memberships.length < 2) return null;

  return (
    <select
      value={accounts.customerId ?? ""}
      disabled={accounts.loading}
      onChange={(event) => void accounts.switchTo(Number(event.target.value))}
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

Switching clears the previous account's data; the account hooks reload for the new one and never show data loaded for
the previous account.

## Permissions

`usePermission(required, mode?)` and `<Can permission={…} mode? fallback?>` check the active membership. Owners have
every permission; for other members the role is the source of truth. These checks shape the UI only: Ominity checks
every request itself.

```tsx
import { CUSTOMER_PERMISSIONS, Can } from "@ominity/next/react";

<Can permission={CUSTOMER_PERMISSIONS.usersManage} fallback={<p>Ask an owner to invite colleagues.</p>}>
  <InviteForm />
</Can>
```

`CUSTOMER_PERMISSIONS` holds the standard keys (`customerView`, `customerManage`, `addressesView`,
`addressesManage`, `usersView`, `usersManage`, `ordersView`, `ordersPlace`, `invoicesView`, `paymentsView`,
`paymentsManage`, `subscriptionsView`, `subscriptionsManage`, `mandatesView`, `mandatesManage`). Any other registered
permission string works too.

## Orders, invoices and addresses

`useOrders` and `useInvoices` return the paginated query result of
[`useOminitySdkPaginatedQuery`](sdk.md#paginated-lists) (`items`, `count`, `hasNext`, `loadMore`, …). They take its
options plus `sort` (default `-createdAt`), `include` and `filter`, and only load when the active membership has the matching view permission.

```tsx
"use client";

import { useInvoices } from "@ominity/next/react";

export function Invoices() {
  const invoices = useInvoices({ pageSize: 10, mode: "append" });

  return (
    <>
      {invoices.items.map((invoice) => (
        <button key={invoice.id} disabled={invoices.pending} onClick={() => void invoices.download(invoice)}>
          {invoice.number} (PDF)
        </button>
      ))}
      {invoices.hasNext && <button onClick={invoices.loadMore}>Show more</button>}
    </>
  );
}
```

- `useOrders()` adds `get(id, include?)`.
- `useInvoices()` adds `get(id)`, `downloadPdf(id)` (bytes), `download(invoice)` (saves `{number}.pdf`), `pending`
  and `actionError`.
- `useAddresses()` returns `addresses`, `loading`, `ready`, `error`, `refresh`, `pending`, `actionError` and
  `create(data)`, `update(id, data)`, `remove(id)`, with SDK `AddressInput` and `AddressUpdateInput`.

## Subscriptions

`useSubscriptions(options)` lists the active account's subscriptions (including `product` and `interval` by default);
`useSubscription(id)` loads one as `subscription`. Both have the same actions, which follow the API's quote-then-confirm
flow and reload the subscription afterwards:

| Action | |
| --- | --- |
| `transitions(subscriptionId)` | Plans it can change to (`SubscriptionTransition`), each with its price |
| `quoteChange(subscriptionId, toOfferId, timing?)` | Prices an upgrade or downgrade; returns a `SubscriptionChange` |
| `confirmChange(subscriptionId, quoteId)` | Confirms the quote before its `quoteExpiresAt` |
| `withdrawChange(subscriptionId, changeId)` | Withdraws a scheduled change, or an unpaid immediate upgrade |
| `quoteCancellation(subscriptionId, timing?)` | Quotes the cancellation: date, notice period, minimum term |
| `confirmCancellation(subscriptionId, quoteId)` | |
| `revokeCancellation(subscriptionId)` | Keeps a subscription whose cancellation is scheduled |
| `setPaused(subscriptionId, paused)` | |

`timing` is `"immediate"` or `"period_end"`; without it the API's policy decides. `pending` and `actionError` cover the
actions.

```tsx
"use client";

import type { SubscriptionChange } from "@ominity/api-typescript/models";
import { useSubscription } from "@ominity/next/react";
import { useState } from "react";

export function CancelSubscription({ id }: { id: number }) {
  const { subscription, quoteCancellation, confirmCancellation, pending } = useSubscription(id);
  const [quote, setQuote] = useState<SubscriptionChange | null>(null);
  if (!subscription) return null;

  return quote ? (
    <div>
      <p>Ends on {quote.effectiveAt}. {quote.warnings.join(", ")}</p>
      <button disabled={pending} onClick={() => void confirmCancellation(id, quote.id)}>Confirm</button>
    </div>
  ) : (
    <button disabled={pending} onClick={async () => setQuote(await quoteCancellation(id))}>Cancel subscription</button>
  );
}
```

## Anything else: the SDK

Payments, mandates, customer groups, the customer itself and every endpoint added to the SDK later are available
through the customer SDK hooks, with the active customer filled in:

```tsx
import { CUSTOMER_PERMISSIONS, useCustomer, useOminityCustomerSdkQuery, useOminitySdk } from "@ominity/next/react";

const payments = useOminityCustomerSdkQuery(
  (sdk, { customerId, signal }) => sdk.commerce.customerPayments.list({ customerId, limit: 10 }, { signal }),
  { permission: CUSTOMER_PERMISSIONS.paymentsView },
);

const sdk = useOminitySdk();
const { customerId } = useCustomer();
await sdk.commerce.customers.update({ id: customerId as number, data: { name: "Acme Ltd" } });
```

See [`docs/sdk.md`](sdk.md) for the query, paginated query and mutation hooks.

## Team and invitations

`useOminityCustomerAccounts()` (also exported from `@ominity/next/react`) holds the team of the active account:
`members`, `invitations`, `roles` and `permissionCatalog` (SDK `Paginated<CustomerUser>`, …), `teamLoading` and
`teamErrors` per resource, and the actions `loadMembers`, `loadInvitations`, `loadRoles`, `loadPermissions`,
`refreshTeam`, `createInvitation`, `updateMemberRole`, `removeMember` and `revokeInvitation`.

```tsx
"use client";

import { CUSTOMER_PERMISSIONS, Can, useOminityCustomerAccounts } from "@ominity/next/react";

export function Team() {
  const accounts = useOminityCustomerAccounts();
  const roleId = accounts.roles?.items.find((role) => role.isAssignable)?.id ?? 0;

  return (
    <section>
      {accounts.members?.items.map((member) => (
        <p key={member.userId}>{member.firstName} {member.lastName} · {member.role?.name}</p>
      ))}
      <Can permission={CUSTOMER_PERMISSIONS.usersManage}>
        <button
          disabled={accounts.isMutationPending("invite")}
          onClick={() => void accounts.createInvitation({ email: "colleague@example.com", roleId })}
        >
          Invite
        </button>
      </Can>
    </section>
  );
}
```

`isMutationPending(key)` takes `switch`, `invite`, `accept-invitation`, `member:{userId}:role`,
`member:{userId}:remove` or `invitation:{id}:revoke`. Failures are `CustomerAccountsError`s with `status`, `code` and
validation details.

The roles endpoint lists the roles assignable in the channel; an empty channel selection means every assignable role.
Managing the role catalogue itself is an admin task and not exposed here.

### Accepting an invitation

Inspection is public, so an invitation page can show the customer, role, expiry and whether an account must be
created. Acceptance always needs the normal signed-in session.

```tsx
const accounts = useOminityCustomerAccounts();
const invitation = await accounts.inspectInvitation(token);

const result = invitation.requiresAccountCreation
  ? await accounts.registerAndAcceptInvitation(token, { firstName, lastName, email: invitation.email, password })
  : await accounts.signInAndAcceptInvitation(token, { email: invitation.email, password });

if (result.status === "requires-mfa") {
  // Complete MFA with useAuth().verifyMfa, then call accounts.acceptInvitation(token).
}
```

The result is `accepted` (with the new `membership`), `requires-mfa` (with the `methods`) or `requires-sign-in`. Both
helpers check the submitted email first and Ominity checks the signed-in user's email again on acceptance. There is no
invitation-specific signup endpoint.
