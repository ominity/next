import { CmsRegistryError } from "../cms/errors.js";
import type {
  CmsComponentDefinition,
  CmsComponentImplementation,
  CmsRegistry,
} from "./types.js";

export function defineCmsComponent<TContext>(
  key: string,
  component: CmsComponentImplementation<TContext>,
): CmsComponentDefinition<TContext> {
  const trimmedKey = key.trim();
  if (trimmedKey.length === 0) {
    throw new CmsRegistryError("CMS component key cannot be empty", {
      code: "INVALID_ARGUMENT",
      details: {
        key,
      },
    });
  }

  return {
    key: trimmedKey,
    component,
  };
}

function normalizeDefinitions<TContext>(
  components:
    | ReadonlyArray<CmsComponentDefinition<TContext>>
    | Readonly<Record<string, CmsComponentImplementation<TContext>>>,
): ReadonlyArray<CmsComponentDefinition<TContext>> {
  if (Array.isArray(components)) {
    return components;
  }

  return Object.entries(components).map(([key, component]) => defineCmsComponent(key, component));
}

export function createCmsRegistry<TContext>(
  components:
    | ReadonlyArray<CmsComponentDefinition<TContext>>
    | Readonly<Record<string, CmsComponentImplementation<TContext>>>,
): CmsRegistry<TContext> {
  const definitions = normalizeDefinitions(components);
  const entries = new Map<string, CmsComponentDefinition<TContext>>();

  for (const definition of definitions) {
    if (entries.has(definition.key)) {
      throw new CmsRegistryError(`Duplicate CMS component key: ${definition.key}`, {
        code: "REGISTRY_DUPLICATE_KEY",
        details: {
          key: definition.key,
        },
      });
    }

    entries.set(definition.key, definition);
  }

  return {
    entries,
    get(key: string) {
      return entries.get(key);
    },
    has(key: string) {
      return entries.has(key);
    },
  };
}

