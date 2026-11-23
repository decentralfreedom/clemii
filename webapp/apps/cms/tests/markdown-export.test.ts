// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// CMS-BACKUP-003: the nightly Markdown export (PRD R15) holds every post, as
// the file the website and `hush-cms posts pull` use, and a manifest; it is
// kept like the database backups and never touches them.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { parseArticle } from "@clemii/article/file";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { systemActor } from "../src/auth/tokens";
import { backupKey, databaseBackups, listBackups } from "../src/backups/backups";
import { exportMarkdown, markdownExports } from "../src/backups/markdown-export";
import { createDraft, publishPost } from "../src/posts/service";
import { postFile } from "../src/site/export";
import { LocalObjectStore } from "../src/storage/object-store";
import { createTestDatabase } from "./database";
import { validPost } from "./fixtures";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => { database = await createTestDatabase(); });
afterAll(async () => { await database.drop(); });

test("CMS-BACKUP-003 every post, drafts too, lands as Markdown with a manifest; old exports go, database backups stay", async () => {
  const actor = systemActor("test");
  const media = new LocalObjectStore(await mkdtemp(join(tmpdir(), "hush-cms-export-media-")));
  const live = await createDraft(database.db, validPost({ slug: "live-post", keyword: "live post" }), actor);
  const published = await publishPost({ db: database.db, media }, live.id, actor);
  const draft = await createDraft(database.db, { ...validPost({ slug: "half-written", keyword: "half written" }), lang: "de" }, actor);

  const store = new LocalObjectStore(await mkdtemp(join(tmpdir(), "hush-cms-export-")));
  const now = new Date("2026-12-31T02:00:00.000Z");
  const old = new Date(now.getTime() - 40 * 86_400_000);
  await store.put(backupKey(markdownExports, old), new Uint8Array([1]), "application/gzip");
  await store.put(backupKey(databaseBackups, old), new Uint8Array([2]), "application/octet-stream");

  const result = await exportMarkdown(database.db, store, 30, now);
  expect(result).toMatchObject({ key: "markdown/2026-12-31T02-00-00-000Z.tar.gz", posts: 2, removed: [backupKey(markdownExports, old)] });
  expect(await listBackups(store, markdownExports)).toEqual([result.key]);
  expect(await listBackups(store)).toEqual([backupKey(databaseBackups, old)]);

  const files = await new Bun.Archive(await store.get(result.key) as Uint8Array).files();
  expect([...files.keys()].sort()).toEqual(["de/half-written.md", "en/live-post.md", "posts.json"]);
  // The live post is exactly the file the website builds from.
  expect(await files.get("en/live-post.md")!.text()).toBe(postFile(published));
  // A draft is a valid article file marked as a draft.
  const parsed = parseArticle(await files.get("de/half-written.md")!.text());
  expect(parsed.problems).toEqual([]);
  expect(parsed.article?.front).toMatchObject({ slug: "half-written", lang: "de", draft: true });
  const manifest = JSON.parse(await files.get("posts.json")!.text());
  expect(manifest).toMatchObject({
    exportedAt: now.toISOString(),
    posts: [
      { id: draft.id, path: "de/half-written.md", status: "draft", publishedAt: null, media: [] },
      { id: live.id, path: "en/live-post.md", status: "published", publishedAt: published.publishedAt!.toISOString(), media: [] },
    ],
  });
});
