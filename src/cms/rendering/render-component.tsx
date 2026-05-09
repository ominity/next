import type { CmsPageComponent } from "../types.js";
import type { CmsRenderable, CmsRenderer } from "./types.js";

export function renderCmsComponent<TContext>(
  component: CmsPageComponent,
  renderer: CmsRenderer<TContext>,
): CmsRenderable {
  return renderer.renderComponent(component);
}
