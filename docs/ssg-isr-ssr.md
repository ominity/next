# SSG / ISR / SSR Guide

`@ominity/next` is rendering-mode agnostic.

## SSG

Use `generateCmsStaticParams` to produce route params from CMS routes.

```ts
import { generateCmsStaticParams } from "@ominity/next/next";

export async function generateStaticParams() {
  const routes = await cmsClient.getRoutes();
  return generateCmsStaticParams({
    routes,
    routing,
    catchAllParam: "slug",
  });
}
```

## ISR

Use the same static params flow and set route-level `revalidate` in Next.

No package-level global mode is imposed.

## SSR

Skip static params and resolve/fetch at request time using:

- `fetchCmsPageForParams`
- `resolveDraftMode` (when needed)

## Client Components with SSG/ISR

A page can stay SSG/ISR compatible while rendering client blocks:

- route and page remain server-side App Router files
- only specific registry entries are Client Components

This keeps payloads efficient and hydration scoped.

## Draft / preview

Use `resolveDraftMode` to combine explicit preview overrides with Next draft mode.

