import { Fragment, createElement } from "react";

import type { CmsPage } from "../cms/types.js";
import { createCmsRenderer } from "./renderer.js";
import type { CmsRegistry, CmsRenderable, CmsRendererOptions } from "./types.js";
import { flattenRenderResult } from "./utils.js";

export interface RenderCmsPageInput<TContext> {
  readonly page: CmsPage;
  readonly registry: CmsRegistry<TContext>;
  readonly context: TContext;
  readonly options?: CmsRendererOptions<TContext>;
}

export function renderCmsPage<TContext>(input: RenderCmsPageInput<TContext>): CmsRenderable {
  const renderer = createCmsRenderer({
    registry: input.registry,
    context: input.context,
    ...(typeof input.options !== "undefined" ? { options: input.options } : {}),
  });

  const rendered = input.page.components
    .map((component) => renderer.renderComponent(component))
    .flatMap((entry) => flattenRenderResult(entry));

  return createElement(Fragment, null, ...rendered);
}
