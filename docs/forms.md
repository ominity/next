# Forms Module Guide

`@ominity/next/forms` ports the Ominity forms module used in `lounge-depot.com` into this reusable package.

It gives you:

- a production-ready client form renderer
- a server-side submission handler for App Router route handlers
- typed normalization for form payloads
- optional adapter-based integration for `@ominity/api-typescript-module-forms`
- theme and component override APIs (including shadcn-friendly mapping)

## What to import

```ts
import {
  FormRenderer,
  createFormsClient,
  createOminityFormSubmitHandler,
  createShadcnFormComponents,
  tailwindDefaultTheme,
} from "@ominity/next/forms";
```

## Rendering forms in Client Components

`FormRenderer` is a Client Component and should be nested where interactivity is needed.

```tsx
"use client";

import { FormRenderer } from "@ominity/next/forms";

export function ContactFormClient({ form }: { form: any }) {
  return (
    <FormRenderer
      form={form}
      submitUrl="/api/forms/submit"
      styled
      defaultPhoneCountry="BE"
      onSubmitSuccess={() => {
        // toast / state update
      }}
    />
  );
}
```

This keeps your page/server route SSG/ISR/SSR compatible while isolating form interactivity to a client boundary.

## Server submit route

```ts
import { createOminityFormSubmitHandler } from "@ominity/next/forms";

const submitHandler = createOminityFormSubmitHandler({
  ominityApiKey: process.env.OMINITY_API_KEY ?? "",
  ominityBaseUrl: process.env.OMINITY_API_URL,
  recaptchaSecret: process.env.OMINITY_FORMS_RECAPTCHA_SECRET,
});

export const POST = (request: Request) => submitHandler(request);
```

What this handler does:

- validates request shape
- verifies reCAPTCHA (when configured)
- strips honeypot fields
- enriches metadata (`ip_address`, `user_agent`, `referrer`, locale)
- forwards normalized submissions to Ominity Forms API

## Optional SDK-module adapter strategy

If you use `@ominity/api-typescript-module-forms`, keep this package decoupled by injecting adapters.

### Read operations

```ts
const formsClient = createFormsClient({
  adapter: {
    async getFormById(input) {
      // call your SDK module here
      return sdkForms.getFormById(input.formId, input.include);
    },
  },
});
```

### Submit operations

```ts
const submitHandler = createOminityFormSubmitHandler({
  ominityApiKey: process.env.OMINITY_API_KEY ?? "",
  forwardSubmission: async ({ payload }) => {
    // call SDK module instead of direct HTTP forward
    const result = await sdkForms.createSubmission(payload);
    return { status: 201, body: result };
  },
});
```

## shadcn component integration

You can map shadcn primitives to the form renderer:

```tsx
import {
  createShadcnFormComponents,
  FormRenderer,
  tailwindDefaultTheme,
} from "@ominity/next/forms";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

const components = createShadcnFormComponents({
  Input,
  Textarea,
  Select,
  Checkbox,
  Button,
});

<FormRenderer
  form={form}
  components={components}
  styled
  themeOverride={tailwindDefaultTheme}
/>;
```

## Themes

Built-in theme exports:

- `unstyledTheme`
- `tailwindDefaultTheme`
- `loungeDepotFormTheme` (migration helper)

Use `themeOverride` + `pt` for project-specific styling.

