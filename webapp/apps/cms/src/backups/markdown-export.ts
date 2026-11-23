// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The nightly Markdown export (PRD R15): every post, drafts and scheduled ones
// too, as the hush-seo Markdown file `hush-cms posts pull` writes
// (<lang>/<slug>.md), in one gzipped tar in the backup bucket, kept as long
// as the database backups. Readable without the CMS or PostgreSQL, so the
// writing survives even a backup that will not restore. posts.json lists each
// file with its post's status, dates and images; the images themselves stay
// in the media bucket under their SHA-256 (src/media/service.ts) instead of
// being copied every night.
import { formatArticle, type FrontMatter } from "@clemii/article/file";
import type { Database } from "../db/client";
import { listMedia } from "../media/service";
import { editableFields, listPosts, type Post } from "../posts/service";
import type { ObjectStore } from "../storage/object-store";
import { backupKey, pruneBackups, type BackupSeries } from "./backups";

export const markdownExports: BackupSeries = { prefix: "markdown/", extension: ".tar.gz" };

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The post as a hush-seo file, as `hush-cms posts pull` writes it: a post
 * that is not live is marked draft, and one never published carries the day
 * it was created, so the same post always gives the same file.
 */
export function archiveFile(post: Post) {
  const { markdown, ...fields } = editableFields(post);
  const published = isoDay(post.publishedAt ?? post.createdAt);
  const front: FrontMatter = {
    ...fields, published, updated: [published, isoDay(post.updatedAt)].sort().at(-1)!,
    schema: ["BlogPosting"], draft: post.status !== "published",
  };
  return formatArticle({ front, body: markdown });
}

/** Every post's file and the manifest, from one repeatable-read snapshot. */
export function markdownArchive(db: Database, now = new Date()) {
  return db.transaction(async (tx) => {
    const posts = (await listPosts(tx, {})).sort((a, b) => `${a.lang}/${a.slug}`.localeCompare(`${b.lang}/${b.slug}`));
    const files: Record<string, string> = {};
    const manifest = [];
    for (const post of posts) {
      const path = `${post.lang}/${post.slug}.md`;
      files[path] = archiveFile(post);
      const media = await listMedia(tx, post.id);
      manifest.push({
        id: post.id, path, status: post.status,
        publishedAt: post.publishedAt?.toISOString() ?? null, updatedAt: post.updatedAt.toISOString(),
        media: media.map((row) => ({ name: row.name, sha256: row.sha256, contentType: row.contentType })),
      });
    }
    files["posts.json"] = `${JSON.stringify({ exportedAt: now.toISOString(), posts: manifest }, null, 2)}\n`;
    return { files, posts: posts.length };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

/** Writes tonight's export to the backup bucket and drops the ones older than keepDays, always keeping the newest. */
export async function exportMarkdown(db: Database, store: ObjectStore, keepDays: number, now = new Date()) {
  const { files, posts } = await markdownArchive(db, now);
  const bytes = await new Bun.Archive(files, { compress: "gzip" }).bytes();
  const key = backupKey(markdownExports, now);
  await store.put(key, bytes, "application/gzip");
  return { key, posts, bytes: bytes.byteLength, removed: await pruneBackups(store, keepDays, now, markdownExports) };
}
