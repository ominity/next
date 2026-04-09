# Component Registry Guide

The registry is where each website maps CMS component keys to real React components.

## Define components

```ts
import { createCmsRegistry, defineCmsComponent } from "@ominity/next/rendering";

import { Hero } from "@/components/cms/hero";
import { Carousel } from "@/components/cms/carousel";

export const cmsRegistry = createCmsRegistry([
  defineCmsComponent("hero", Hero),
  defineCmsComponent("carousel", Carousel),
]);
```

## Component props

Each registered component receives:

- `component`: normalized `CmsPageComponent`
- `context`: page/locale/path/preview render context
- `renderer`: helper for nested rendering

## Duplicate key detection

`createCmsRegistry` throws typed `CmsRegistryError` when duplicate keys are registered.

This fails fast in development and prevents hard-to-debug render ambiguity.

## Missing component handling

Configure renderer fallback behavior per page render:

- ignore unknown blocks
- throw to catch content-model drift early
- custom fallback for editor-friendly placeholders

