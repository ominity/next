# Actions and resource helpers

The actions module removes repeated App Router plumbing while leaving each
project in control of its routes, SDK operation, validation schema, and UI.
It provides three server contexts:

- `createOminityApiKeyAction` creates a server-only SDK client from the Ominity API key.
- `createOminityUserAction` requires the encrypted user session and creates an OAuth SDK client.
- `createOminityCustomerAction` also resolves a valid active membership and can check customer permissions.

Customer and admin permissions remain separate domains. Customer actions use
the permission keys returned on the active role. A future admin action helper
can use the admin permission registry without mixing those keys into customer
memberships.

## Create an active-customer route

Validators use the [Standard Schema](https://standardschema.dev/) interface, so
Zod 4, Valibot, ArkType, and other compatible validators work without an
adapter or a package dependency. A plain validation function is also accepted.

```ts
// app/api/team/invitations/route.ts
import { z } from "zod";
import { CUSTOMER_PERMISSIONS } from "@ominity/next/customer-accounts";
import { createOminityCustomerAction } from "@ominity/next/actions/server";

const config = {
  ominityBaseUrl: process.env.OMINITY_API_URL,
  channelId: process.env.OMINITY_CHANNEL_ID,
  authSessionSecret: process.env.OMINITY_AUTH_SESSION_SECRET,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnv: process.env.NODE_ENV,
};

const invitation = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  roleId: z.number().int().positive(),
  acceptUrl: z.string().url(),
});

export const POST = createOminityCustomerAction({
  config,
  method: "POST",
  permission: CUSTOMER_PERMISSIONS.usersManage,
  body: invitation,
  successStatus: 201,
  idempotency: true,
  error: {
    code: "INVITATION_CREATE_FAILED",
    message: "Could not create the invitation.",
  },
  execute({ sdk, customerId, input, idempotencyKey }) {
    return sdk.commerce.customerUserInvitations.create({
      customerId,
      data: input.body,
    }, idempotencyKey ? {
      headers: { "Idempotency-Key": idempotencyKey },
    } : undefined);
  },
});
```

`permission` requires one key. `everyPermission` requires all supplied keys and
`anyPermission` requires at least one. They can be combined with `authorize`
for resource-level rules:

```ts
authorize({ userId, input }) {
  return userId === input.params.userId;
}
```

The permission check gives the browser an early, stable `403`; the Ominity API
still authorizes the OAuth request and remains the final security boundary.

## Validate route parameters and queries

Route parameters support the synchronous and promised `params` forms used by
Next.js. Repeated query parameters arrive as arrays before validation.

```ts
// app/api/customer-orders/[orderId]/route.ts
import { z } from "zod";
import { CUSTOMER_PERMISSIONS } from "@ominity/next/customer-accounts";
import { createOminityCustomerAction } from "@ominity/next/actions/server";

export const GET = createOminityCustomerAction({
  config,
  method: "GET",
  permission: CUSTOMER_PERMISSIONS.ordersView,
  params: z.object({ orderId: z.string().min(1) }),
  query: z.object({ include: z.string().optional() }),
  execute({ sdk, input }) {
    return sdk.commerce.orders.get(input.params.orderId, {
      ...(input.query.include ? { include: input.query.include } : {}),
    });
  },
});
```

The handler returns schema issues as `422 VALIDATION_FAILED` with
`details.fields`. Invalid JSON returns `400 INVALID_JSON`. Authentication,
authorization, missing-resource, conflict, and upstream validation failures
are normalized to safe `401`, `403`, `404`, `409`, and `422` responses. Raw
unexpected exception messages are never returned.

Use `onError(error, context)` to send the original failure to project logging
or observability. If that callback fails, the action still returns the response
for the original error.

Authenticated `POST`, `PUT`, `PATCH`, and `DELETE` actions check the request
origin by default. All generated JSON responses use `Cache-Control: no-store`.
Set `idempotency: { required: true }` when an operation must receive an
`Idempotency-Key`; the validated key is available in the execution context for
forwarding to the SDK request.

Use `OminityActionHttpError` for an expected, safe domain outcome:

```ts
throw new OminityActionHttpError(
  409,
  "BOOKING_ALREADY_CANCELLED",
  "This booking has already been cancelled.",
);
```

## User and API-key actions

`createOminityUserAction` exposes `sdk`, `session`, `user`, `userId`,
`cookieStore`, and the resolved `language`. It is useful for account data that
does not belong to one customer.

`createOminityApiKeyAction` exposes a server-only API-key SDK and language. Use
it for controlled server routes such as public catalogue reads or operations
with a project-owned authorization callback. Never accept an SDK operation or
path from browser input; define the exact SDK call in `execute`.

For unusual contexts, `createOminityAction` is the lower-level factory. Its
`resolveContext` callback can provide project-owned session or tenancy data
while retaining the same validation, authorization, response, and error flow.

## Call an action from client code

`requestOminityAction` only accepts same-origin paths. It sends JSON, uses
same-origin credentials and no-store caching, supports cancellation and
idempotency keys, and throws `OminityActionError` for structured failures.

```ts
import { requestOminityAction } from "@ominity/next/actions";

const invitation = await requestOminityAction<CustomerUserInvitation>(
  "/api/team/invitations",
  {
    method: "POST",
    body: { email, roleId, acceptUrl },
    idempotencyKey: crypto.randomUUID(),
  },
);
```

For conventional endpoints, create a typed resource client once:

```ts
import { createOminityResourceClient } from "@ominity/next/actions";

export const addresses = createOminityResourceClient<
  Address,
  Paginated<Address>,
  CreateAddressInput,
  UpdateAddressInput
>({ basePath: "/api/customer-addresses" });

await addresses.list({ page: 1, limit: 25 });
await addresses.get(42);
await addresses.create(input);
await addresses.update(42, input);
await addresses.remove(42);
```

The optional `request` method covers resource-specific operations while still
using the same transport, for example
`addresses.request("/42/set-default", { method: "POST" })`.

## Reuse loading and mutation state

The React entry point contains headless hooks. Rendering stays in the project.
Keep loader and action functions stable with `useCallback` or create them at
module scope.

```tsx
"use client";

import { useCallback } from "react";
import { useOminityMutation, useOminityQuery } from "@ominity/next/actions/react";

export function AddressList() {
  const load = useCallback(
    ({ signal }: { signal: AbortSignal }) => addresses.list({}, { signal }),
    [],
  );
  const query = useOminityQuery(load);
  const remove = useOminityMutation((id: number) => addresses.remove(id), {
    onSuccess: () => query.refresh(),
  });

  // Render query.data, query.loading, query.error and remove.pending in the
  // project's own component system.
}
```

Queries cancel superseded requests and ignore stale responses. Mutations keep
the latest result and expose `pending`, `data`, `error`, `execute`, and `reset`.
