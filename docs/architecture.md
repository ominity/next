# Architecture Overview

`@ominity/next` is structured as a reusable CMS integration core, not a website theme.

## Layers

1. **CMS layer (`src/cms`)**
   - wraps `@ominity/api-typescript`
   - fetches pages/routes/menus/locales
   - normalizes unstable API payloads into stable internal models
   - provides routing and locale utilities
   - provides CMS-focused metadata helpers

2. **Rendering layer (`src/rendering`)**
   - accepts project component registry
   - centralizes recursive render logic
   - handles nested component values in fields and child trees
   - keeps fallback behavior configurable

3. **Next integration layer (`src/next`)**
   - route param resolution helpers
   - page fetch helpers based on route resolution
   - static params and sitemap helpers
   - draft-mode utilities

4. **Forms layer (`src/forms`)**
   - reusable client form renderer for Ominity form definitions
   - submission handler for App Router API routes
   - form response normalization + optional adapter-based SDK integration
   - theme + component override surfaces (shadcn-friendly)

## Design principles

- **Server-first** by default
- **Client boundaries only where needed** (interactive blocks can be Client Components)
- **Explicit API surface** (small, documented helpers)
- **No project assumptions** (no built-in website UI components)
- **Strong boundaries** between data normalization, rendering, and framework glue

## Data flow

1. App route receives `params`
2. Route resolver matches incoming path to a CMS route + locale
3. CMS client fetches page by localized path
4. Normalizer produces stable `CmsPage`
5. Renderer resolves registry entries and renders nested components recursively
6. Metadata/sitemap helpers derive SEO output from normalized page/route data

## Why normalize early

Ominity API responses can evolve. Normalizing once at the boundary keeps:

- renderer and route helpers stable
- downstream project code predictable
- debugging simpler (clear input/output contracts)
