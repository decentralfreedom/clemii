// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The blog's analytics (GET /v1/blog): Google and Umami over the same days,
// the days both have, posts only, most downloads first.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { systemActor } from "../src/auth/tokens";
import { searchConsoleState, searchDaily, trafficDaily, trafficState } from "../src/db/schema";
import { createDraft, publishPost } from "../src/posts/service";
import { LocalObjectStore } from "../src/storage/object-store";
import { createTestDatabase, serverUrl } from "./database";
import { credentials, ownerSession, validPost } from "./fixtures";

describe.skipIf(!serverUrl)("CMS blog analytics", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  let owner = "";
  let first = "", second = "";

  beforeAll(async () => {
    database = await createTestDatabase();
    const cms = { db: database.db, media: new LocalObjectStore(await mkdtemp(join(tmpdir(), "hush-cms-blog-"))) };
    app = createApp(cms);
    owner = await ownerSession(database.db);
    const actor = systemActor("test");
    first = (await createDraft(cms.db, validPost({ slug: "dictate-on-mac", keyword: "dictate on mac" }), actor)).id;
    second = (await createDraft(cms.db, validPost({ slug: "dictate-without-cloud", keyword: "dictate without cloud" }), actor)).id;
    await publishPost(cms, first, actor);
    await publishPost(cms, second, actor);
  });
  afterAll(async () => { await database.drop(); });

  const call = async (path: string) => {
    const response = await app.request(path, { headers: credentials(owner) });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };

  test("CMS-BLOG-001 before Umami shares a day with Search Console, Google's numbers stand alone over its own days, and page views and downloads are unknown, not zero", async () => {
    await database.db.insert(searchConsoleState).values({ id: 1, importedFrom: "2026-11-01", importedThrough: "2026-11-19", incompleteFrom: "2026-11-18" });
    // Umami starts after Google's last day (it started counting later, and Google lags).
    await database.db.insert(trafficState).values({ id: 1, importedFrom: "2026-11-21", importedThrough: "2026-11-21" });
    await database.db.insert(searchDaily).values([
      { postId: first, date: "2026-11-03", impressions: 900, clicks: 90, position: 3 },
      { postId: first, date: "2026-11-10", impressions: 100, clicks: 5, position: 4 },
      { postId: second, date: "2026-11-19", impressions: 50, clicks: 2, position: 8 },
    ]);
    const { body } = await call("/v1/blog");
    expect(body).toMatchObject({
      from: "2026-11-01", to: "2026-11-19", trafficCounted: false, trafficFrom: "2026-11-21",
      totals: { impressions: 1050, clicks: 97, pageviews: null, downloads: null },
    });
    // Ranked by Google clicks, the only numbers there are.
    expect(body.posts.map((post: { postId: string }) => post.postId)).toEqual([first, second]);
    expect(body.posts[0]).toMatchObject({ clicks: 95, pageviews: null, downloads: null });
  });

  test("CMS-BLOG-002 counts only the days both sources have, posts only, most downloads first", async () => {
    // Search Console has 1 to 19 November (it lags), Umami 5 to 21 November: the blog counts 5 to 19 November.
    await database.db.update(trafficState).set({ importedFrom: "2026-11-05", importedThrough: "2026-11-21" });
    await database.db.insert(trafficDaily).values([
      { postId: first, date: "2026-11-10", pageviews: 10, downloads: 1 },
      { postId: second, date: "2026-11-15", pageviews: 4, downloads: 2 },
      { postId: first, date: "2026-11-20", pageviews: 99, downloads: 9 },
    ]);
    const { body } = await call("/v1/blog");
    expect(body).toMatchObject({ from: "2026-11-05", to: "2026-11-19", preliminaryFrom: "2026-11-18", trafficCounted: true, totals: { impressions: 150, clicks: 7, pageviews: 14, downloads: 3 } });
    // The post with the most downloads leads, though the other had more readers and clicks.
    expect(body.posts.map((post: { postId: string }) => post.postId)).toEqual([second, first]);
    expect(body.posts[1]).toMatchObject({ impressions: 100, clicks: 5, pageviews: 10, downloads: 1 });
    // The days add up to the totals and the posts to the days.
    const sum = (rows: Array<Record<string, number>>, key: string) => rows.reduce((total, row) => total + row[key]!, 0);
    for (const key of ["impressions", "clicks", "pageviews", "downloads"]) {
      expect(sum(body.days, key)).toBe(body.totals[key]);
      expect(sum(body.posts, key)).toBe(body.totals[key]);
    }
  });

  test("CMS-BLOG-003 a shorter range counts back from the last shared day", async () => {
    const { body } = await call("/v1/blog?days=3");
    expect(body).toMatchObject({ from: "2026-11-17", to: "2026-11-19", totals: { impressions: 50, clicks: 2, pageviews: 0, downloads: 0 } });
    expect(body.posts).toEqual([expect.objectContaining({ postId: second, clicks: 2, pageviews: 0 })]);
  });
});
