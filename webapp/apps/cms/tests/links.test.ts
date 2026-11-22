// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// CMS-LINKS-001 to 003: tracked links (PRD: tracked links).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { createToken, systemActor } from "../src/auth/tokens";
import { auditLog, trafficSourceDaily, trafficState } from "../src/db/schema";
import { createDraft, publishPost } from "../src/posts/service";
import { LocalObjectStore } from "../src/storage/object-store";
import { createTestDatabase, serverUrl } from "./database";
import { credentials, ownerSession, validPost } from "./fixtures";

describe.skipIf(!serverUrl)("tracked links", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  let owner = "";
  let reader = "";
  let post = "";

  beforeAll(async () => {
    database = await createTestDatabase();
    const cms = { db: database.db, media: new LocalObjectStore(await mkdtemp(join(tmpdir(), "hush-cms-links-"))) };
    app = createApp(cms, { siteUrl: "https://behu.sh" });
    owner = await ownerSession(database.db);
    reader = await createToken(database.db, { name: "reader", scopes: ["posts:read"] }, systemActor("test"));
    const draft = await createDraft(cms.db, validPost({ slug: "dictate-on-mac", keyword: "dictate on mac" }), systemActor("test"));
    post = (await publishPost(cms, draft.id, systemActor("test"))).id;
  });
  afterAll(async () => { await database.drop(); });

  const call = async (method: string, path: string, body?: unknown, credential = owner) => {
    const response = await app.request(path, { method, headers: { ...credentials(credential), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };

  test("CMS-LINKS-001 makes a link whose tags follow from where it is shared, with the whole address to share", async () => {
    const reddit = await call("POST", "/v1/links", { name: "r/macapps launch post", path: "/blog/dictate-on-mac", sharedOn: "reddit", campaign: "launch-2026-12" });
    expect(reddit).toMatchObject({ status: 201, body: {
      path: "/blog/dictate-on-mac", postId: post, source: "reddit", medium: "social", campaign: "launch-2026-12", content: "",
      query: "?utm_source=reddit&utm_medium=social&utm_campaign=launch-2026-12",
      url: "https://behu.sh/blog/dictate-on-mac?utm_source=reddit&utm_medium=social&utm_campaign=launch-2026-12",
    } });
    // A creator's own name is the source; the home page is a destination too.
    const creator = await call("POST", "/v1/links", { name: "Anna's video", path: "/", sharedOn: "creator", who: "creator-anna", campaign: "launch-2026-12", content: "video-description" });
    expect(creator.body).toMatchObject({ source: "creator-anna", medium: "social", postId: null, url: "https://behu.sh/?utm_source=creator-anna&utm_medium=social&utm_campaign=launch-2026-12&utm_content=video-description" });
    expect((await database.db.select().from(auditLog)).filter((entry) => entry.action === "link.created")).toHaveLength(2);
  });

  test("CMS-LINKS-002 keeps the tags clean: fixed places, lowercase words, one link per page and tags", async () => {
    expect((await call("POST", "/v1/links", { name: "x", path: "/", sharedOn: "creator", campaign: "launch" })).status).toBe(422);
    expect((await call("POST", "/v1/links", { name: "x", path: "/", sharedOn: "creator", who: "Anna Smith", campaign: "launch" })).status).toBe(422);
    expect((await call("POST", "/v1/links", { name: "x", path: "/", sharedOn: "reddit", campaign: "Launch 2026" })).status).toBe(400);
    expect((await call("POST", "/v1/links", { name: "x", path: "/", sharedOn: "myspace", campaign: "launch" })).status).toBe(400);
    expect((await call("POST", "/v1/links", { name: "x", path: "https://evil.example/", sharedOn: "reddit", campaign: "launch" })).status).toBe(422);
    expect((await call("POST", "/v1/links", { name: "x", path: "//evil.example/", sharedOn: "reddit", campaign: "launch" })).status).toBe(422);
    const again = await call("POST", "/v1/links", { name: "the same again", path: "/blog/dictate-on-mac", sharedOn: "reddit", campaign: "launch-2026-12" });
    expect(again).toMatchObject({ status: 409, body: { error: { code: "link_exists" } } });
    // Reading needs posts:read, making a link posts:write.
    expect((await call("POST", "/v1/links", { name: "x", path: "/", sharedOn: "reddit", campaign: "other" }, reader)).status).toBe(403);
    expect((await call("GET", "/v1/links", undefined, reader)).status).toBe(200);
  });

  test("CMS-LINKS-003 lists each link with its page views and downloads, and archives one without losing its numbers", async () => {
    await database.db.insert(trafficState).values({ id: 1, importedAt: new Date(), importedFrom: "2026-11-15", importedThrough: "2026-11-21" });
    await database.db.insert(trafficSourceDaily).values([
      { date: "2026-11-20", path: "/blog/dictate-on-mac", postId: post, pageType: "post", channel: "organicSocial", source: "reddit", medium: "social", campaign: "launch-2026-12", content: "", pageviews: 12, downloads: 3 },
      { date: "2026-11-21", path: "/blog/dictate-on-mac", postId: post, pageType: "post", channel: "organicSocial", source: "reddit", medium: "social", campaign: "launch-2026-12", content: "", pageviews: 5, downloads: 1 },
      // Same tags on another page: not this link's.
      { date: "2026-11-21", path: "/", postId: null, pageType: "home", channel: "organicSocial", source: "reddit", medium: "social", campaign: "launch-2026-12", content: "", pageviews: 7, downloads: 0 },
    ]);
    const { body } = await call("GET", "/v1/links?days=7", undefined, reader);
    expect(body).toMatchObject({ from: "2026-11-15", to: "2026-11-21" });
    const reddit = body.links.find((link: { source: string }) => link.source === "reddit");
    expect(reddit).toMatchObject({ pageviews: 17, downloads: 4 });
    expect(body.links.find((link: { source: string }) => link.source === "creator-anna")).toMatchObject({ pageviews: 0, downloads: 0 });

    expect((await call("DELETE", `/v1/links/${reddit.id}`)).body).toMatchObject({ id: reddit.id, archivedAt: expect.any(String), pageviews: 0 });
    expect((await call("GET", "/v1/links")).body.links.map((link: { source: string }) => link.source)).toEqual(["creator-anna"]);
    expect((await call("GET", "/v1/links?archived=true&days=7")).body.links.find((link: { id: string }) => link.id === reddit.id)).toMatchObject({ pageviews: 17 });
    expect((await call("DELETE", `/v1/links/${reddit.id}`)).status).toBe(404);
    expect((await database.db.select().from(auditLog)).filter((entry) => entry.action === "link.archived")).toHaveLength(1);
  });
});
