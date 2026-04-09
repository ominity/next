import { createElement } from "react";

import { CmsRenderError } from "../cms/errors.js";
import type { CmsPageComponent } from "../cms/types.js";
import type {
  CmsRenderable,
  CmsRenderer,
  CmsRendererOptions,
  CreateCmsRendererInput,
  MissingComponentBehavior,
  UnsupportedValueBehavior,
} from "./types.js";
import {
  collectNestedComponents,
  flattenRenderResult,
  isCmsPageComponent,
  isPrimitiveRenderable,
} from "./utils.js";

function resolveUnsupportedValue<TContext>(
  behavior: UnsupportedValueBehavior<TContext>,
  value: unknown,
  context: TContext,
): CmsRenderable {
  if (typeof behavior === "function") {
    return behavior(value, context);
  }

  if (behavior === "stringify") {
    return JSON.stringify(value);
  }

  if (behavior === "throw") {
    throw new CmsRenderError("Encountered unsupported value while rendering CMS component", {
      details: {
        value,
      },
    });
  }

  return null;
}

function resolveMissingComponent<TContext>(
  behavior: MissingComponentBehavior<TContext>,
  component: CmsPageComponent,
  context: TContext,
): CmsRenderable {
  if (typeof behavior === "function") {
    return behavior(component, context);
  }

  if (behavior === "throw") {
    throw new CmsRenderError(`CMS component is not registered: ${component.key}`, {
      details: {
        key: component.key,
        type: component.type,
      },
    });
  }

  return null;
}

function defaultRendererOptions<TContext>(): Required<CmsRendererOptions<TContext>> {
  return {
    unsupportedValue: "ignore",
    missingComponent: "ignore",
  };
}

function firstRenderable(values: ReadonlyArray<unknown>): unknown {
  if (values.length === 0) {
    return null;
  }

  if (values.length === 1) {
    return values[0] ?? null;
  }

  return values;
}

export function createCmsRenderer<TContext>(input: CreateCmsRendererInput<TContext>): CmsRenderer<TContext> {
  const options = {
    ...defaultRendererOptions<TContext>(),
    ...input.options,
  };

  const renderComponent = (component: CmsPageComponent, renderer: CmsRenderer<TContext>): CmsRenderable => {
    const definition = input.registry.get(component.key) ?? input.registry.get(component.type);
    if (!definition) {
      return resolveMissingComponent(options.missingComponent, component, input.context);
    }

    return createElement(definition.component, {
      component,
      context: input.context,
      renderer,
    });
  };

  const renderUnknown = (value: unknown, renderer: CmsRenderer<TContext>): CmsRenderable => {
    if (typeof value === "undefined" || value === null) {
      return null;
    }

    if (isPrimitiveRenderable(value)) {
      return value;
    }

    if (isCmsPageComponent(value)) {
      return renderComponent(value, renderer);
    }

    if (Array.isArray(value)) {
      const rendered = value.flatMap((item) => flattenRenderResult(renderUnknown(item, renderer)));
      return firstRenderable(rendered);
    }

    if (typeof value === "object") {
      const nested = collectNestedComponents(value).map((component) => renderComponent(component, renderer));
      const flattened = nested.flatMap((entry) => flattenRenderResult(entry));
      if (flattened.length > 0) {
        return firstRenderable(flattened);
      }

      return resolveUnsupportedValue(options.unsupportedValue, value, input.context);
    }

    return resolveUnsupportedValue(options.unsupportedValue, value, input.context);
  };

  const renderer: CmsRenderer<TContext> = {
    render(value: unknown): CmsRenderable {
      return renderUnknown(value, renderer);
    },
    renderComponent(component: CmsPageComponent): CmsRenderable {
      return renderComponent(component, renderer);
    },
    renderChildren(component: CmsPageComponent): CmsRenderable {
      const renderedChildren = component.children.map((child) => renderComponent(child, renderer));
      const flattened = renderedChildren.flatMap((entry) => flattenRenderResult(entry));
      return firstRenderable(flattened);
    },
  };

  return renderer;
}

