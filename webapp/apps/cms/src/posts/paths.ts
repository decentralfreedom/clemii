// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Which post a page address belongs to, for numbers that come by URL (Search
// Console now, Umami for the funnel): its current page and every page it had
// before a slug or language change, from its revisions, so a post's history
// follows it. Only the path counts, never the host, so the domain may change.
import { blogPath, type BlogLanguage } from "@hush/article/taxonomy";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { postRevisions, posts } from "../db/schema";

/** A page address reduced to its path, without query, fragment or trailing slash. */
export function pagePathOf(address: string) {
  let path: string;
  try {
    path = new URL(address, "https://site.invalid").pathname;
  } catch {
    return undefined;
  }
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** Every page path any post has had, to its post; a post's current page wins over another's old one. */
export async function postPathIndex(db: Pick<Database, "select" | "selectDistinct">) {
  const earlier = await db.selectDistinct({
    id: postRevisions.postId,
    lang: sql<string>`${postRevisions.snapshot}->>'lang'`,
    slug: sql<string>`${postRevisions.snapshot}->>'slug'`,
  }).from(postRevisions);
  const current = await db.select({ id: posts.id, lang: posts.lang, slug: posts.slug }).from(posts);
  const index = new Map<string, string>();
  for (const { id, lang, slug } of [...earlier, ...current]) {
    if (lang && slug) index.set(blogPath(lang as BlogLanguage, slug), id);
  }
  return index;
}
