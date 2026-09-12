import type { Ominity } from "@ominity/api-typescript";
import type { ContentEntry } from "@ominity/api-typescript/models/cms/content-entry";

export interface ListAllCmsContentEntriesInput {
  readonly slug: string;
  readonly pageSize?: number;
  readonly maxPages?: number;
}

/** Loads a bounded SDK content collection without creating a parallel endpoint or model. */
export async function listAllCmsContentEntries<T extends ContentEntry>(
  sdk: Ominity,
  input: ListAllCmsContentEntriesInput,
): Promise<ReadonlyArray<T>> {
  const items: T[] = [];
  const pageSize = input.pageSize ?? 100;
  const maxPages = input.maxPages ?? 20;

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await sdk.cms.content.list<T>({
      slug: input.slug,
      page,
      limit: pageSize,
    });
    items.push(...response.items);

    if (!response.hasNext || response.items.length === 0) {
      break;
    }
  }

  return items;
}
