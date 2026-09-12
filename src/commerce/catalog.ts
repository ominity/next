import { Ominity, type OminityOptions } from "@ominity/api-typescript";
import type { Paginated } from "@ominity/api-typescript/models";
import type { Category } from "@ominity/api-typescript/models/commerce/category";
import type { Product } from "@ominity/api-typescript/models/commerce/product";
import type { ProductOffer } from "@ominity/api-typescript/models/commerce/product-offer";

export interface CommerceCatalogProduct {
  readonly product: Product;
  readonly offers: ReadonlyArray<ProductOffer>;
}

export interface CommerceCatalogListInput {
  readonly language?: string;
  readonly page?: number;
  readonly limit?: number;
  readonly maxPages?: number;
}

export interface CommerceCatalogOptions {
  readonly sdk: OminityOptions;
  readonly defaultLimit?: number;
  readonly cacheTtlMs?: number;
  readonly offerConcurrency?: number;
}

export interface CommerceCatalog {
  listProducts(input?: CommerceCatalogListInput): Promise<ReadonlyArray<CommerceCatalogProduct>>;
  listCategories(input?: CommerceCatalogListInput): Promise<ReadonlyArray<Category>>;
  clear(): void;
}

interface TimedPromise<T> {
  readonly expiresAt: number;
  readonly value: Promise<T>;
}

function createSdk(options: CommerceCatalogOptions, language: string | undefined): Ominity {
  return new Ominity({
    ...options.sdk,
    ...(language ? { language } : {}),
  });
}

async function listCatalogPages<T>(input: {
  readonly startPage: number;
  readonly maxPages: number;
  readonly loadPage: (page: number) => Promise<Paginated<T>>;
}): Promise<ReadonlyArray<T>> {
  const items: T[] = [];

  for (let offset = 0; offset < input.maxPages; offset += 1) {
    const response = await input.loadPage(input.startPage + offset);
    items.push(...response.items);
    if (!response.hasNext || response.items.length === 0) {
      break;
    }
  }

  return items;
}

async function mapConcurrently<TInput, TOutput>(input: {
  readonly items: ReadonlyArray<TInput>;
  readonly concurrency: number;
  readonly map: (item: TInput) => Promise<TOutput>;
}): Promise<ReadonlyArray<TOutput>> {
  const output: TOutput[] = new Array(input.items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(1, input.concurrency), input.items.length) },
    async () => {
      while (nextIndex < input.items.length) {
        const index = nextIndex;
        nextIndex += 1;
        output[index] = await input.map(input.items[index]!);
      }
    },
  );
  await Promise.all(workers);
  return output;
}

function cached<T>(
  cache: Map<string, TimedPromise<T>>,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const current = cache.get(key);
  if (current && current.expiresAt > Date.now()) {
    return current.value;
  }

  const value = load().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  if (ttlMs > 0) {
    cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  }
  return value;
}

/**
 * Server-side catalog loader that returns the SDK's Product, ProductOffer and
 * Category models unchanged. It intentionally performs no wire-model
 * normalization; the TypeScript SDK remains the contract owner.
 */
export function createCommerceCatalog(options: CommerceCatalogOptions): CommerceCatalog {
  const productCache = new Map<string, TimedPromise<ReadonlyArray<CommerceCatalogProduct>>>();
  const categoryCache = new Map<string, TimedPromise<ReadonlyArray<Category>>>();
  const cacheTtlMs = options.cacheTtlMs ?? 300_000;

  return {
    async listProducts(input: CommerceCatalogListInput = {}) {
      const limit = input.limit ?? options.defaultLimit ?? 100;
      const maxPages = input.maxPages ?? 20;
      const startPage = input.page ?? 1;
      const key = JSON.stringify([input.language ?? "", startPage, limit, maxPages]);

      return cached(productCache, key, cacheTtlMs, async () => {
        const sdk = createSdk(options, input.language);
        const products = await listCatalogPages({
          startPage,
          maxPages,
          loadPage: (page) => sdk.commerce.products.list({ page, limit }),
        });

        return mapConcurrently({
          items: products,
          concurrency: options.offerConcurrency ?? 8,
          map: async (product) => ({
            product,
            offers: await listCatalogPages({
              startPage: 1,
              maxPages,
              loadPage: (page) => sdk.commerce.products.listOffers({
                id: product.id,
                page,
                limit,
              }),
            }),
          }),
        });
      });
    },

    async listCategories(input: CommerceCatalogListInput = {}) {
      const limit = input.limit ?? options.defaultLimit ?? 100;
      const maxPages = input.maxPages ?? 20;
      const startPage = input.page ?? 1;
      const key = JSON.stringify([input.language ?? "", startPage, limit, maxPages]);

      return cached(categoryCache, key, cacheTtlMs, () => {
        const sdk = createSdk(options, input.language);
        return listCatalogPages({
          startPage,
          maxPages,
          loadPage: (page) => sdk.commerce.categories.list({ page, limit }),
        });
      });
    },

    clear() {
      productCache.clear();
      categoryCache.clear();
    },
  };
}
