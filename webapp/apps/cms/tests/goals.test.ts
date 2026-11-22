// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// CMS-GOALS-001 to 004: the Goals tab (PRD: AI-native goals).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { createToken, systemActor } from "../src/auth/tokens";
import { auditLog, searchConsoleState, searchDaily, trackedLinks, trafficDaily, trafficSiteDaily, trafficSourceDaily, trafficState } from "../src/db/schema";
import { progressOf } from "../src/goals/metrics";
import { createDraft, publishPost } from "../src/posts/service";
import { LocalObjectStore } from "../src/storage/object-store";
import { createTestDatabase, serverUrl } from "./database";
import { credentials, ownerSession, validPost } from "./fixtures";

test("CMS-GOALS-004 pace projects forward from the days measured, never into days without numbers; position is better lower", () => {
  // Umami counts from 21 November: 30 page views in 10 days, 31 days left in the quarter.
  const counted = { value: 30, from: "2026-11-21", to: "2026-11-30", taggedOnly: false };
  expect(progressOf("pageviews", counted, { from: "2026-10-01", to: "2026-12-31" }, 100)).toEqual({ value: 30, share: 0.3, projected: 123, onTrack: true });
  // Rates are not projected.
  expect(progressOf("ctr", { ...counted, value: 0.05 }, { from: "2026-10-01", to: "2026-12-31" }, 0.04).projected).toBe(0.05);
  expect(progressOf("position", { ...counted, value: 8 }, { from: "2026-10-01", to: "2026-12-31" }, 5)).toMatchObject({ share: 0.625, onTrack: false });
  expect(progressOf("pageviews", { value: null, from: null, to: null, taggedOnly: false }, { from: "2026-10-01", to: "2026-12-31" }, 10).value).toBeNull();
});

describe.skipIf(!serverUrl)("goals", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  let owner = "";
  let agent = "";
  let post = "";

  beforeAll(async () => {
    database = await createTestDatabase();
    const cms = { db: database.db, media: new LocalObjectStore(await mkdtemp(join(tmpdir(), "hush-cms-goals-"))) };
    app = createApp(cms);
    owner = await ownerSession(database.db);
    agent = await createToken(database.db, { name: "hush-seo", scopes: ["posts:read", "posts:write"] }, systemActor("test"));
    const draft = await createDraft(cms.db, validPost({ slug: "dictate-on-mac", keyword: "dictate on mac" }), systemActor("test"));
    post = (await publishPost(cms, draft.id, systemActor("test"))).id;
    const db = database.db;
    await db.insert(searchConsoleState).values({ id: 1, importedAt: new Date(), importedFrom: "2025-07-24", importedThrough: "2026-11-28" });
    await db.insert(searchDaily).values([
      { postId: post, date: "2026-07-15", impressions: 100, clicks: 2, position: 10 },
      { postId: post, date: "2026-10-10", impressions: 200, clicks: 4, position: 8 },
      { postId: post, date: "2026-11-20", impressions: 100, clicks: 6, position: 6 },
    ]);
    await db.insert(trafficState).values({ id: 1, importedAt: new Date(), importedFrom: "2026-11-21", importedThrough: "2026-11-30" });
    await db.insert(trafficDaily).values([
      { postId: post, date: "2026-11-21", pageviews: 10, downloads: 1 },
      { postId: post, date: "2026-11-30", pageviews: 20, downloads: 1 },
    ]);
    await db.insert(trafficSiteDaily).values([{ date: "2026-11-21", pageviews: 40, downloads: 3 }]);
    await db.insert(trafficSourceDaily).values([
      { date: "2026-11-25", path: "/blog/dictate-on-mac", postId: post, pageType: "post", channel: "organicSocial", source: "reddit", medium: "social", campaign: "launch", content: "", pageviews: 5, downloads: 1 },
      { date: "2026-11-25", path: "/", postId: null, pageType: "home", channel: "direct", source: "", medium: "", campaign: "", content: "", pageviews: 9, downloads: 0 },
    ]);
    await db.insert(trackedLinks).values({ name: "Anna", path: "/", sharedOn: "creator", source: "creator-anna", medium: "social", campaign: "launch", content: "", createdBy: "github:owner" });
  });
  afterAll(async () => { await database.drop(); });

  const call = async (method: string, path: string, body?: unknown, credential = agent) => {
    const response = await app.request(path, { method, headers: { ...credentials(credential), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: response.status === 204 ? {} : await response.json() as Record<string, any> };
  };

  test("CMS-GOALS-001 the catalog offers only what the CMS measures and the values that occur in its data", async () => {
    const { body } = await call("GET", "/v1/goals/catalog");
    expect(body.metrics.map((metric: { name: string }) => metric.name)).toEqual(["impressions", "clicks", "ctr", "position", "pageviews", "downloads", "conversion"]);
    expect(body.posts).toEqual([{ id: post, title: expect.any(String), path: "/blog/dictate-on-mac" }]);
    expect(body).toMatchObject({ channels: ["direct", "organicSocial"], pageTypes: ["home", "post"], campaigns: ["launch"] });
    // A tracked link's source counts before its first visit.
    expect(body.sources).toEqual(["creator-anna", "reddit"]);
    expect(body.coverage).toEqual({ search: { from: "2025-07-24", to: "2026-11-28" }, traffic: { from: "2026-11-21", to: "2026-11-30" } });
  });

  test("CMS-GOALS-002 an agent's proposal names only catalog values, gets its baseline from the data, and waits as a draft", async () => {
    const refused = async (keyResult: Record<string, unknown>) => (await call("POST", "/v1/goals", { quarter: "2026-Q4", title: "x", keyResults: [{ title: "kr", target: 10, ...keyResult }] }));
    expect((await refused({ kind: "measured", metric: "pageviews", scope: { source: "myspace" } })).body.error.message).toContain("does not occur in the CMS's data");
    expect((await refused({ kind: "measured", metric: "clicks", scope: { channel: "organicSocial" } })).body.error.message).toContain("knows only pages");
    expect((await refused({ kind: "measured", metric: "downloads", scope: { pageType: "home" } })).status).toBe(422);
    expect((await refused({ kind: "measured", metric: "pageviews", scope: { postId: "00000000-0000-4000-8000-000000000000" } })).status).toBe(422);
    expect((await refused({ kind: "manual", metric: "pageviews" })).status).toBe(422);
    expect((await refused({ kind: "measured", metric: "revenue" })).status).toBe(400);

    const proposed = await call("POST", "/v1/goals", { quarter: "2026-Q4", title: "Become the answer for private Mac dictation", keyResults: [
      { title: "Google impressions for the post", kind: "measured", metric: "impressions", scope: { postId: post }, target: 600 },
      { title: "Page views of the post", kind: "measured", metric: "pageviews", scope: { postId: post }, target: 100 },
      { title: "Reddit launch downloads", kind: "measured", metric: "downloads", scope: { source: "reddit", campaign: "launch" }, target: 5 },
      { title: "Average position of the post", kind: "measured", metric: "position", scope: { postId: post }, target: 5 },
      { title: "Partner articles published", kind: "manual", target: 3 },
    ] });
    expect(proposed.status).toBe(201);
    expect(proposed.body).toMatchObject({ status: "draft", createdBy: "token:hush-seo", period: { from: "2026-10-01", to: "2026-12-31" } });
    const [impressions, pageviews, reddit, position, manual] = proposed.body.keyResults;
    // Q3 is fully covered by Search Console: its 100 impressions are the baseline. Umami starts on 21 November: no baseline.
    expect(impressions).toMatchObject({ baseline: 100, measured: { value: 300, from: "2026-10-01", to: "2026-11-28", taggedOnly: false } });
    expect(impressions.progress.projected).toBeCloseTo(300 + (300 / 59) * 33, 6);
    expect(pageviews).toMatchObject({ baseline: null, measured: { value: 30, from: "2026-11-21", to: "2026-11-30" }, progress: { projected: 123, onTrack: true } });
    expect(reddit).toMatchObject({ measured: { value: 1, taggedOnly: true } });
    expect(position.measured.value).toBeCloseTo((200 * 8 + 100 * 6) / 300, 6);
    expect(position.progress.onTrack).toBe(false);
    expect(manual).toMatchObject({ kind: "manual", metric: null, measured: null, progress: { value: null } });
    expect((await database.db.select().from(auditLog)).map((entry) => entry.action)).toContain("goal.proposed");
  });

  test("CMS-GOALS-003 only the owner approves, archives and checks in; the owner's own goals are active at once", async () => {
    const { body } = await call("GET", "/v1/goals?quarter=2026-Q4");
    const draft = body.objectives[0];
    expect((await call("POST", `/v1/goals/${draft.id}/approve`)).status).toBe(403);
    expect((await call("POST", `/v1/goals/${draft.id}/approve`, undefined, owner)).status).toBe(204);
    expect((await call("POST", `/v1/goals/${draft.id}/approve`, undefined, owner)).status).toBe(404);
    const manual = draft.keyResults.find((keyResult: { kind: string }) => keyResult.kind === "manual");
    expect((await call("PUT", `/v1/goals/key-results/${manual.id}/value`, { value: 1 })).status).toBe(403);
    expect((await call("PUT", `/v1/goals/key-results/${manual.id}/value`, { value: 1 }, owner)).status).toBe(204);
    // A measured key result takes its value from the data only.
    const measured = draft.keyResults.find((keyResult: { kind: string }) => keyResult.kind === "measured");
    expect((await call("PUT", `/v1/goals/key-results/${measured.id}/value`, { value: 999 }, owner)).status).toBe(404);
    const after = (await call("GET", "/v1/goals?quarter=2026-Q4")).body.objectives[0];
    expect(after).toMatchObject({ status: "active", approvedBy: "github:owner" });
    expect(after.keyResults.find((keyResult: { kind: string }) => keyResult.kind === "manual").progress).toMatchObject({ value: 1, share: 1 / 3 });

    const own = await call("POST", "/v1/goals", { quarter: "2026-Q4", title: "Grow the home page", keyResults: [{ title: "Site page views", kind: "measured", metric: "pageviews", target: 500 }] }, owner);
    expect(own.body).toMatchObject({ status: "active", keyResults: [{ measured: { value: 40 } }] });
    expect((await call("DELETE", `/v1/goals/${own.body.id}`, undefined, owner)).status).toBe(204);
    expect((await call("GET", "/v1/goals?quarter=2026-Q4")).body.objectives).toHaveLength(1);
    expect((await database.db.select().from(auditLog)).map((entry) => entry.action)).toEqual(expect.arrayContaining(["goal.approved", "goal.checked_in", "goal.created", "goal.archived"]));
  });
});
