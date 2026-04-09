import type { CmsPageComponent, CmsRenderContext } from "../cms/types.js";

export type CmsRenderable = unknown;

export interface CmsRenderer<TContext = CmsRenderContext> {
  render(value: unknown): CmsRenderable;
  renderComponent(component: CmsPageComponent): CmsRenderable;
  renderChildren(component: CmsPageComponent): CmsRenderable;
}

export interface CmsComponentRenderProps<TContext = CmsRenderContext> {
  readonly component: CmsPageComponent;
  readonly context: TContext;
  readonly renderer: CmsRenderer<TContext>;
}

export type CmsComponentImplementation<TContext = CmsRenderContext> = (
  props: CmsComponentRenderProps<TContext>,
) => CmsRenderable;

export interface CmsComponentDefinition<TContext = CmsRenderContext> {
  readonly key: string;
  readonly component: CmsComponentImplementation<TContext>;
}

export interface CmsRegistry<TContext = CmsRenderContext> {
  readonly entries: ReadonlyMap<string, CmsComponentDefinition<TContext>>;
  get(key: string): CmsComponentDefinition<TContext> | undefined;
  has(key: string): boolean;
}

export type UnsupportedValueBehavior<TContext = CmsRenderContext> =
  | "ignore"
  | "stringify"
  | "throw"
  | ((value: unknown, context: TContext) => CmsRenderable);

export type MissingComponentBehavior<TContext = CmsRenderContext> =
  | "ignore"
  | "throw"
  | ((component: CmsPageComponent, context: TContext) => CmsRenderable);

export interface CmsRendererOptions<TContext = CmsRenderContext> {
  readonly unsupportedValue?: UnsupportedValueBehavior<TContext>;
  readonly missingComponent?: MissingComponentBehavior<TContext>;
}

export interface CreateCmsRendererInput<TContext = CmsRenderContext> {
  readonly registry: CmsRegistry<TContext>;
  readonly context: TContext;
  readonly options?: CmsRendererOptions<TContext>;
}

