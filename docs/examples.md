# Examples

## Starter App Integration Example

### `lib/cms.ts`

```ts
import { createCmsClient, createCmsLinkResolver, createRoutingConfig } from "@ominity/next/cms";

export const cmsClient = createCmsClient({
  sdk: {
    serverURL: process.env.OMINITY_API_URL ?? "",
    security: {
      apiKey: process.env.OMINITY_API_KEY ?? "",
    },
    language: "en",
  },
});

export const routing = createRoutingConfig({
  defaultLocale: "en",
  locales: [
    { code: "en", language: "en", default: true },
    { code: "nl", language: "nl" },
  ],
  localeSegmentStrategy: "language",
  canonicalRedirectPolicy: "if-not-canonical",
});

export const linkResolver = createCmsLinkResolver({
  config: routing,
});
```

### `lib/cms-registry.ts`

```ts
import { createCmsRegistry, defineCmsComponent } from "@ominity/next/rendering";

import { HeroBlock } from "@/components/cms/hero-block";
import { RichTextBlock } from "@/components/cms/rich-text-block";
import { SliderBlock } from "@/components/cms/slider-block"; // "use client"

export const cmsRegistry = createCmsRegistry([
  defineCmsComponent("hero", HeroBlock),
  defineCmsComponent("rich_text", RichTextBlock),
  defineCmsComponent("slider", SliderBlock),
]);
```

### `app/[[...slug]]/page.tsx`

```tsx
import { notFound, redirect } from "next/navigation";

import { fetchCmsPageForParams, resolveDraftMode } from "@ominity/next/next";
import { renderCmsPage } from "@ominity/next/rendering";

import { cmsClient, routing } from "@/lib/cms";
import { cmsRegistry } from "@/lib/cms-registry";

export default async function Page({ params }: { params: { slug?: string[] } }) {
  const preview = await resolveDraftMode({ useNextDraftMode: true });
  const routes = await cmsClient.getRoutes({ preview });

  const resolved = await fetchCmsPageForParams({
    client: cmsClient,
    routes,
    params,
    routing,
    preview,
  });

  if (!resolved) {
    notFound();
  }

  if (resolved.route.shouldRedirect) {
    redirect(resolved.route.canonicalPath);
  }

  return renderCmsPage({
    page: resolved.page,
    registry: cmsRegistry,
    context: {
      page: resolved.page,
      locale: resolved.route.locale,
      path: resolved.route.incomingPath,
      preview,
      debug: false,
    },
  });
}
```

### Route-object links

```ts
const href = linkResolver.resolve({
  resource: "route",
  name: "product",
  locale: "nl",
  parameters: {
    sku: "ABC-123",
    slug: "fiets-band",
  },
}).href;
// /nl/p/ABC-123-fiets-band
```

### `app/[[...slug]]/generateStaticParams.ts`

```ts
import { generateCmsStaticParams } from "@ominity/next/next";

import { cmsClient, routing } from "@/lib/cms";

export async function generateStaticParams() {
  const routes = await cmsClient.getRoutes();
  return generateCmsStaticParams({
    routes,
    routing,
  });
}
```

## Forms integration example

### `app/api/forms/submit/route.ts`

```ts
import { createOminityFormSubmitHandler } from "@ominity/next/forms";

const handler = createOminityFormSubmitHandler({
  ominityApiKey: process.env.OMINITY_API_KEY ?? "",
  ominityBaseUrl: process.env.OMINITY_API_URL,
  recaptchaSecret: process.env.OMINITY_FORMS_RECAPTCHA_SECRET,
});

export const POST = (request: Request) => handler(request);
```

### `components/forms/ContactFormClient.tsx`

```tsx
"use client";

import {
  FormRenderer,
  createShadcnFormComponents,
  tailwindDefaultTheme,
} from "@ominity/next/forms";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const components = createShadcnFormComponents({
  Input,
  Textarea,
  Button,
});

export function ContactFormClient({ form }: { form: any }) {
  return (
    <FormRenderer
      form={form}
      submitUrl="/api/forms/submit"
      styled
      themeOverride={tailwindDefaultTheme}
      components={components}
      defaultPhoneCountry="BE"
    />
  );
}
```
