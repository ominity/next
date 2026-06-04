import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTrackingPageMetadata,
  buildTrackingResourceRelation,
} from "../dist/next/tracking.js";

test("buildTrackingResourceRelation normalizes a cms page relation", () => {
  const relation = buildTrackingResourceRelation(
    {
      resource: "page",
      id: 42,
      slug: "about",
      title: "About",
      type: "landing",
    },
    {
      locale: "en",
      path: "/about",
      canonicalPath: "/en/about",
      url: "https://shop.example.com/en/about",
      route: {
        resource: "route",
        name: "page",
        locale: "en",
        parameters: {
          id: 42,
          slug: "about",
        },
      },
    },
  );

  assert.deepEqual(relation, {
    resource: "page",
    id: 42,
    locale: "en",
    slug: "about",
    title: "About",
    type: "landing",
    path: "/about",
    canonicalPath: "/en/about",
    url: "https://shop.example.com/en/about",
    route: {
      resource: "route",
      name: "page",
      locale: "en",
      parameters: {
        id: 42,
        slug: "about",
      },
    },
  });
});

test("buildTrackingPageMetadata creates origin and related resources payload", () => {
  const metadata = buildTrackingPageMetadata({
    origin: {
      resource: "page",
      id: 42,
      slug: "about",
    },
    related: [
      {
        resource: "channel",
        id: "web",
        title: "Website",
      },
    ],
    metadata: {
      site: "wizzou.com",
    },
  });

  assert.deepEqual(metadata, {
    site: "wizzou.com",
    origin_resource: {
      resource: "page",
      id: 42,
      slug: "about",
    },
    related_resources: [
      {
        resource: "channel",
        id: "web",
        title: "Website",
      },
    ],
  });
});
