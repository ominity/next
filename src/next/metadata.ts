import { buildCmsMetadata } from "../cms/seo/index.js";
import type { CmsMetadataInput, CmsPage } from "../cms/types.js";
import type { NextMetadata } from "./types.js";

export function buildNextMetadata(input: CmsMetadataInput): NextMetadata {
  return buildCmsMetadata(input);
}

export function buildNextMetadataFromPage(
  page: CmsPage,
  options: Omit<CmsMetadataInput, "page"> = {},
): NextMetadata {
  return buildNextMetadata({
    ...options,
    page,
  });
}

