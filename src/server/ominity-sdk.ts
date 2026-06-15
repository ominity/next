import { Ominity } from "@ominity/api-typescript";
import type { OminityOptions } from "@ominity/api-typescript";

type HookContextLike = {
  options?: Record<string, unknown>;
};

type BeforeCreateRequestLike = (
  context: HookContextLike,
  input: unknown,
) => unknown;

type HooksLike = {
  beforeCreateRequest?: BeforeCreateRequestLike;
  __ominityContextOptionsPatched?: boolean;
};

type OminityWithInternals = Ominity & {
  _options?: Record<string, unknown> & {
    hooks?: HooksLike;
  };
};

function patchHookContextOptions(sdk: Ominity): Ominity {
  const sdkWithInternals = sdk as OminityWithInternals;
  const hooks = sdkWithInternals._options?.hooks;
  if (!hooks || typeof hooks.beforeCreateRequest !== "function") {
    return sdk;
  }

  if (hooks.__ominityContextOptionsPatched === true) {
    return sdk;
  }

  const original = hooks.beforeCreateRequest.bind(hooks) as (
    context: HookContextLike,
    input: unknown,
  ) => unknown;

  (hooks as unknown as { beforeCreateRequest: BeforeCreateRequestLike }).beforeCreateRequest = (
    context: HookContextLike,
    input: unknown,
  ) => {
    const contextOptions = typeof context?.options === "object" && context.options !== null
      ? context.options
      : {};

    return original({
      ...(context ?? {}),
      options: {
        ...(sdkWithInternals._options ?? {}),
        ...contextOptions,
      },
    }, input);
  };

  hooks.__ominityContextOptionsPatched = true;
  return sdk;
}

export function createPatchedOminitySdk(options: OminityOptions): Ominity {
  return patchHookContextOptions(new Ominity(options));
}
