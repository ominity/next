import Link from "next/link.js";
import { createElement } from "react";

import type {
  CmsLinkResolver,
  CmsLinkTarget,
  ResolveCmsLinkOptions,
} from "../cms/routing/index.js";

export interface LocaleLinkProps {
  readonly resolver: CmsLinkResolver;
  readonly target: CmsLinkTarget;
  readonly locale?: string;
  readonly children?: unknown;
  readonly externalTarget?: string;
  readonly externalRel?: string;
  readonly [key: string]: unknown;
}

export function LocaleLink(props: LocaleLinkProps) {
  const {
    resolver,
    target,
    locale,
    children,
    externalTarget = "_blank",
    externalRel = "noopener noreferrer",
    ...linkProps
  } = props;

  const resolveOptions: ResolveCmsLinkOptions = {
    ...(typeof locale === "string" ? { locale } : {}),
  };

  const resolved = resolver.resolve(target, resolveOptions);
  if (resolved.external) {
    return createElement(
      "a",
      {
        ...linkProps,
        href: resolved.href,
        target: externalTarget,
        rel: externalRel,
      },
      children,
    );
  }

  return createElement(
    Link,
    {
      ...linkProps,
      href: resolved.href,
    },
    children,
  );
}
