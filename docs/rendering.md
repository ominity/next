# Rendering Model

## Goals

- render CMS component trees recursively
- support nested `page_content_component` values inside fields
- support child components
- allow Server Components and Client Components in one CMS page

## Key API

- `defineCmsComponent(key, component)`
- `createCmsRegistry(definitions)`
- `createCmsRenderer({ registry, context })`
- `renderCmsPage({ page, registry, context })`

## Renderer capabilities

The renderer object passed to each component exposes:

- `render(value)`
  - renders primitives
  - renders nested CMS components in values/arrays/objects
- `renderComponent(component)`
  - renders one specific component
- `renderChildren(component)`
  - renders direct child component tree

## Nested field rendering

Project components can render nested component fields without manual traversal:

```tsx
export function HeroBlock({ component, renderer }) {
  return (
    <section>
      <h1>{component.fields.title}</h1>
      {renderer.render(component.fields.button)}
    </section>
  );
}
```

## Fallback behavior

Renderer options allow explicit behavior when values are unsupported or registry keys are missing:

- ignore
- stringify
- throw
- custom function

This keeps failure mode project-controlled.

## Client Components inside SSG/ISR pages

A CMS page remains server-rendered/prerenderable as long as the route itself is server-side App Router logic.

Interactive blocks can be Client Components in the registry:

- server route + server page shell remains SSG/ISR eligible
- client-only interactivity is isolated to those blocks

