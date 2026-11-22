// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Search Console journeys (docs/user-journeys/cms.md, PRD R12): the scheduler
// imports Google's numbers per post and day; the admin and agents read them.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { createToken, systemActor } from "../src/auth/tokens";
import { loadConfig, type SearchConsoleConfig } from "../src/config";
import { auditLog, postRevisions, searchDaily, searchConsoleState, searchQueries } from "../src/db/schema";
import { pagePathOf } from "../src/posts/paths";
import { createDraft, publishPost, updatePost } from "../src/posts/service";
import { searchConsoleClient, type QueryRow, type SearchRow } from "../src/search/console";
import { changeFrom, pacificDay, previousPeriod, totalsOf } from "../src/search/analytics";
import { importSearchConsole, searchImportDue } from "../src/search/import";
import { LocalObjectStore } from "../src/storage/object-store";
import { createTestDatabase, serverUrl } from "./database";
import { credentials, ownerSession, validPost } from "./fixtures";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config: SearchConsoleConfig = {
  site: "sc-domain:behu.sh",
  key: { clientEmail: "search-console@hush-test.iam.gserviceaccount.com", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), tokenUri: "https://oauth2.googleapis.com/token" },
};

/** Google, as far as the CMS uses it: the token endpoint, sites.list and searchanalytics.query. */
function fakeGoogle(rows: (start: string, end: string) => SearchRow[], options: { fail?: boolean; queries?: (start: string, end: string) => QueryRow[] } = {}) {
  const calls: Array<{ url: string; body: string }> = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    calls.push({ url, body });
    if (options.fail) return new Response("{}", { status: 503 });
    if (url === config.key.tokenUri) return Response.json({ access_token: "google-token", expires_in: 3600 });
    if (url.endsWith("/sites")) return Response.json({ siteEntry: [{ siteUrl: "sc-domain:behu.sh", permissionLevel: "siteRestrictedUser" }] });
    const { startDate, endDate, startRow, rowLimit, dimensions } = JSON.parse(body) as { startDate: string; endDate: string; startRow: number; rowLimit: number; dimensions: string[] };
    // Google answers for the requested days only.
    const inRange = <Row extends SearchRow>(all: Row[]) => all.filter((row) => row.date >= startDate && row.date <= endDate);
    if (dimensions.includes("query")) {
      const page = inRange(options.queries?.(startDate, endDate) ?? []).slice(startRow, startRow + rowLimit);
      return Response.json({ rows: page.map(({ page: address, query, date, impressions, clicks, position }) => ({ keys: [address, query, date], impressions, clicks, position })) });
    }
    const page = inRange(rows(startDate, endDate)).slice(startRow, startRow + rowLimit);
    return Response.json({ rows: page.map(({ page: address, date, impressions, clicks, position }) => ({ keys: [address, date], impressions, clicks, position })) });
  };
  return { calls, client: searchConsoleClient(config, fetcher) };
}

describe("Search Console client", () => {
  test("CMS-SEARCH-001 signs in as the service account the documented way, read-only and for at most an hour", async () => {
    const { calls, client } = fakeGoogle(() => []);
    expect(await client.canRead()).toBe(true);
    const assertion = new URLSearchParams(calls[0]!.body).get("assertion")!;
    const [header, claims, signature] = assertion.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const payload = JSON.parse(Buffer.from(claims!, "base64url").toString());
    expect(payload).toMatchObject({ iss: config.key.clientEmail, aud: config.key.tokenUri, scope: "https://www.googleapis.com/auth/webmasters.readonly" });
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(3600);
    expect(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature!, "base64url"))).toBe(true);
    // The token is reused while it lasts.
    await client.canRead();
    expect(calls.filter((call) => call.url === config.key.tokenUri)).toHaveLength(1);
  });

  test("reads every page of rows", async () => {
    const many = Array.from({ length: 25_003 }, (_, index) => ({ page: `https://behu.sh/blog/post-${index}`, date: "2026-11-01", impressions: 1, clicks: 0, position: 9 }));
    const { calls, client } = fakeGoogle(() => many);
    expect(await client.pageDays("2026-11-01", "2026-11-01")).toHaveLength(25_003);
    expect(calls.filter((call) => call.url.includes("searchAnalytics")).map((call) => JSON.parse(call.body).startRow)).toEqual([0, 25_000]);
    // Queries come through the same paged reader, with the query as a dimension.
    expect((await client.pageQueryDays("2026-11-01", "2026-11-01"))).toEqual([]);
  });

  test("addresses reduce to their path, whatever the host", () => {
    expect(pagePathOf("https://behu.sh/blog/dictate-on-mac/")).toBe("/blog/dictate-on-mac");
    expect(pagePathOf("https://clemii.com/de/blog/diktieren?utm=x#top")).toBe("/de/blog/diktieren");
    expect(pagePathOf("https://behu.sh/")).toBe("/");
  });
});

describe("Search analytics rules", () => {
  test("CMS-SEARCH-006 compares only valid periods, with enough impressions, on Search Console's days", () => {
    // Summed, the position weighted by impressions, the CTR from the sums.
    expect(totalsOf([{ impressions: 300, clicks: 6, position: 6 }, { impressions: 100, clicks: 4, position: 10 }]))
      .toEqual({ impressions: 400, clicks: 10, ctr: 0.025, position: 7 });
    expect(totalsOf([])).toEqual({ impressions: 0, clicks: 0, ctr: 0, position: null });
    // The period before, of equal length, only when the CMS has numbers for all of it.
    expect(previousPeriod("2026-11-01", "2026-11-28", "2025-07-24")).toEqual({ from: "2026-10-04", to: "2026-10-31" });
    expect(previousPeriod("2025-07-24", "2026-11-20", "2025-07-24")).toBeUndefined();
    // A change needs 100 impressions in both periods; CTR in percentage points, position in ranks.
    const now = { impressions: 300, clicks: 9, ctr: 0.03, position: 6 };
    const change = changeFrom(now, { impressions: 200, clicks: 2, ctr: 0.01, position: 9 })!;
    expect(change).toMatchObject({ impressions: 0.5, clicks: 3.5, position: -3 });
    expect(change.ctrPoints).toBeCloseTo(2, 10);
    expect(changeFrom(now, { impressions: 99, clicks: 2, ctr: 0.02, position: 9 })).toBeNull();
    expect(changeFrom(now, undefined)).toBeNull();
    // A moment late on a UTC day is still the day before in US Pacific time.
    expect(pacificDay(new Date("2026-11-15T07:30:00.000Z"))).toBe("2026-11-14");
    expect(pacificDay(new Date("2026-11-15T09:00:00.000Z"))).toBe("2026-11-15");
  });
});

describe("Search Console configuration", () => {
  const key = JSON.stringify({ type: "service_account", client_email: config.key.clientEmail, private_key: config.key.privateKey });
  test("is off without the key, defaults to the website's domain property, and never echoes the key", () => {
    expect(loadConfig({ NODE_ENV: "test", CMS_DATABASE_URL: "postgres://x/y" }).searchConsole).toBeUndefined();
    expect(loadConfig({ NODE_ENV: "test", CMS_DATABASE_URL: "postgres://x/y", CMS_SEARCH_CONSOLE_KEY: key, CMS_SEARCH_CONSOLE_SITE: "sc-domain:behu.sh" }).searchConsole?.site)
      .toBe("sc-domain:behu.sh");
    const secret = "not json, but secret-looking-value";
    let message = "";
    try { loadConfig({ NODE_ENV: "test", CMS_DATABASE_URL: "postgres://x/y", CMS_SEARCH_CONSOLE_KEY: secret }); } catch (error) { message = String(error); }
    expect(message).toContain("CMS_SEARCH_CONSOLE_KEY");
    expect(message).not.toContain("secret-looking-value");
    expect(() => loadConfig({ NODE_ENV: "test", CMS_DATABASE_URL: "postgres://x/y", CMS_SEARCH_CONSOLE_KEY: key })).toThrow(/CMS_SEARCH_CONSOLE_SITE/);
  });
});

describe.skipIf(!serverUrl)("CMS Search Console import", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  let cms: { db: Awaited<ReturnType<typeof createTestDatabase>>["db"]; media: LocalObjectStore };
  let owner = "";
  let moved = "";
  let german = "";

  beforeAll(async () => {
    database = await createTestDatabase();
    cms = { db: database.db, media: new LocalObjectStore(await mkdtemp(join(tmpdir(), "hush-cms-search-"))) };
    app = createApp(cms);
    owner = await ownerSession(database.db);
    const actor = systemActor("test");
    // A post that went live at one address and moved to another; its history follows it.
    const post = await createDraft(cms.db, validPost({ slug: "dictate-on-mac-old", keyword: "dictate on mac" }), actor);
    await publishPost(cms, post.id, actor);
    moved = (await updatePost(cms, post.id, { slug: "dictate-on-mac" }, { name: "github:owner", githubUserId: 1 })).id;
    german = (await createDraft(cms.db, validPost({ lang: "de", slug: "diktieren-am-mac", keyword: "diktieren am mac" }), actor)).id;
  });
  afterAll(async () => { await database.drop(); });

  const call = async (path: string, credential = owner) => {
    const response = await app.request(path, { headers: credentials(credential) });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };

  test("CMS-SEARCH-002 the first import loads Google's history per post and day, at every address the post had", async () => {
    const now = new Date("2026-11-22T06:00:00.000Z");
    const { calls, client } = fakeGoogle(() => [
      { page: "https://behu.sh/blog/dictate-on-mac-old", date: "2026-11-01", impressions: 100, clicks: 4, position: 10 },
      { page: "https://behu.sh/blog/dictate-on-mac/", date: "2026-11-01", impressions: 300, clicks: 6, position: 6 },
      { page: "https://behu.sh/blog/dictate-on-mac?ref=x", date: "2026-11-19", impressions: 50, clicks: 1, position: 8 },
      { page: "https://behu.sh/de/blog/diktieren-am-mac", date: "2026-11-19", impressions: 20, clicks: 0, position: 15 },
      { page: "https://behu.sh/", date: "2026-11-19", impressions: 70, clicks: 3, position: 2 },
    ]);
    const result = await importSearchConsole(database.db, client, now);
    // One web-search day per request, as Google's guide advises, from 16 months back to today.
    const pageDays = calls.filter((entry) => entry.url.includes("searchAnalytics") && !entry.body.includes('"query"')).map((entry) => JSON.parse(entry.body));
    expect(pageDays.every((request) => request.startDate === request.endDate && request.type === "web" && request.dataState === "all")).toBe(true);
    expect(pageDays.map((request) => request.startDate).sort()).toEqual(expect.arrayContaining(["2025-07-24", "2026-11-22"]));
    expect(pageDays).toHaveLength(487);
    expect(pageDays[0]).toMatchObject({ dimensions: ["page", "date"] });
    expect(result).toMatchObject({ through: "2026-11-19", rows: 5, postDays: 3, otherPages: ["/"] });
    const rows = await database.db.select().from(searchDaily);
    // Two addresses of one post on one day: summed, the position weighted by impressions (100×10 + 300×6) / 400.
    expect(rows.find((row) => row.postId === moved && row.date === "2026-11-01")).toMatchObject({ impressions: 400, clicks: 10, position: 7 });
    expect(rows.find((row) => row.postId === german)).toMatchObject({ date: "2026-11-19", impressions: 20, position: 15 });
  });

  test("CMS-SEARCH-003 later imports re-read the last days and replace Google's preliminary numbers; failures retry hourly", async () => {
    const { calls, client } = fakeGoogle(() => [
      { page: "https://behu.sh/blog/dictate-on-mac", date: "2026-11-19", impressions: 80, clicks: 2, position: 7.5 },
      { page: "https://behu.sh/blog/dictate-on-mac", date: "2026-11-21", impressions: 10, clicks: 0, position: 9 },
    ]);
    const later = new Date("2026-11-23T06:00:00.000Z");
    expect(await searchImportDue(database.db, later)).toBe(true);
    await importSearchConsole(database.db, client, later);
    const refreshed = calls.filter((entry) => entry.url.includes("searchAnalytics") && !entry.body.includes('"query"')).map((entry) => JSON.parse(entry.body).startDate).sort();
    expect([refreshed[0], refreshed.at(-1), refreshed.length]).toEqual(["2026-11-09", "2026-11-23", 15]);
    const day = (await database.db.select().from(searchDaily)).find((row) => row.postId === moved && row.date === "2026-11-19");
    expect(day).toMatchObject({ impressions: 80, clicks: 2, position: 7.5 });
    expect((await database.db.select().from(searchConsoleState))[0]).toMatchObject({ importedThrough: "2026-11-21" });
    expect(await searchImportDue(database.db, new Date("2026-11-23T12:00:00.000Z"))).toBe(false);

    // Google fails: the import throws, keeps the numbers and the last success, and waits an hour.
    const failing = fakeGoogle(() => [], { fail: true }).client;
    const nextDay = new Date("2026-11-24T06:00:00.000Z");
    expect(await searchImportDue(database.db, nextDay)).toBe(true);
    await expect(importSearchConsole(database.db, failing, nextDay)).rejects.toThrow(/refused the service account/);
    const [state] = await database.db.select().from(searchConsoleState);
    expect(state!.importedAt!.toISOString()).toBe(later.toISOString());
    expect(await searchImportDue(database.db, new Date("2026-11-24T06:30:00.000Z"))).toBe(false);
    expect(await searchImportDue(database.db, new Date("2026-11-24T07:01:00.000Z"))).toBe(true);
  });

  test("an import without the first day of its history (as #144 left it) is due again at once, not the next day", async () => {
    const [before] = await database.db.select().from(searchConsoleState);
    await database.db.update(searchConsoleState).set({ importedFrom: null, importedAt: new Date("2026-11-24T06:00:00.000Z"), attemptedAt: new Date("2026-11-24T06:00:00.000Z") });
    expect(await searchImportDue(database.db, new Date("2026-11-24T06:30:00.000Z"))).toBe(false);
    expect(await searchImportDue(database.db, new Date("2026-11-24T07:01:00.000Z"))).toBe(true);
    await database.db.update(searchConsoleState).set({ importedFrom: before!.importedFrom, importedAt: before!.importedAt, attemptedAt: before!.attemptedAt });
  });

  test("CMS-SEARCH-004 the admin and agents read a post's numbers over the days Search Console has", async () => {
    const reader = await createToken(database.db, { name: "hush-seo", scopes: ["posts:read"] }, systemActor("test"));
    const { status, body } = await call(`/v1/posts/${moved}/search?days=28`, reader);
    expect(status).toBe(200);
    expect(body).toMatchObject({ from: "2026-10-25", to: "2026-11-21" });
    expect(body.days.map((day: { date: string }) => day.date)).toEqual(["2026-11-01", "2026-11-19", "2026-11-21"]);
    // Totals weight the position by impressions: (400×7 + 80×7.5 + 10×9) / 490.
    expect(body.totals.impressions).toBe(490);
    expect(body.totals.clicks).toBe(12);
    expect(body.totals.ctr).toBeCloseTo(12 / 490, 6);
    expect(body.totals.position).toBeCloseTo((400 * 7 + 80 * 7.5 + 10 * 9) / 490, 6);
    expect(body.importedAt).toBe("2026-11-23T06:00:00.000Z");
    // From a given day, as the admin's "Year to date" and "All time".
    const since = (await call(`/v1/posts/${moved}/search?since=2026-11-10`, reader)).body;
    expect(since).toMatchObject({ from: "2026-11-10", to: "2026-11-21", totals: { impressions: 90 } });
    // "All time" starts where the numbers start (the first import's history), never before: no numbers is not zero.
    const allTime = (await call(`/v1/posts/${moved}/search?since=2020-01-01`, reader)).body;
    expect(allTime).toMatchObject({ from: "2025-07-24", totals: { impressions: 490 } });
    expect((await database.db.select().from(searchConsoleState))[0]).toMatchObject({ importedFrom: "2025-07-24" });
    expect((await call("/v1/posts/00000000-0000-4000-8000-000000000000/search")).status).toBe(404);
    expect((await call(`/v1/posts/${moved}/search`, "none")).status).toBe(401);
  });

  test("CMS-SEARCH-005 imports the searches each post was found for, replacing the refreshed days as Google has them now", async () => {
    const queries = (date: string, extra: QueryRow[] = []): QueryRow[] => [
      { page: "https://behu.sh/blog/dictate-on-mac-old", query: "dictate on mac", date, impressions: 60, clicks: 2, position: 9 },
      { page: "https://behu.sh/blog/dictate-on-mac", query: "dictate on mac", date, impressions: 40, clicks: 1, position: 4 },
      { page: "https://behu.sh/blog/dictate-on-mac", query: "mac dictation offline", date, impressions: 30, clicks: 0, position: 12 },
      { page: "https://behu.sh/", query: "hush app", date, impressions: 50, clicks: 5, position: 1 },
      ...extra,
    ];
    const first = fakeGoogle(() => [{ page: "https://behu.sh/blog/dictate-on-mac", date: "2026-11-21", impressions: 130, clicks: 3, position: 7 }], {
      queries: () => queries("2026-11-21", [{ page: "https://behu.sh/blog/dictate-on-mac", query: "preliminary query", date: "2026-11-21", impressions: 5, clicks: 0, position: 20 }]),
    });
    const result = await importSearchConsole(database.db, first.client, new Date("2026-11-25T06:00:00.000Z"));
    expect(result).toMatchObject({ queryRows: 5, postQueryDays: 3 });
    // Two addresses of one post for one query: summed, the position weighted (60×9 + 40×4) / 100.
    const stored = await database.db.select().from(searchQueries);
    expect(stored.find((row) => row.query === "dictate on mac")).toMatchObject({ postId: moved, impressions: 100, clicks: 3, position: 7 });
    expect(stored.map((row) => row.query).sort()).toEqual(["dictate on mac", "mac dictation offline", "preliminary query"]);

    // Google drops the preliminary query once the day is final: the next import removes it too.
    const second = fakeGoogle(() => [{ page: "https://behu.sh/blog/dictate-on-mac", date: "2026-11-21", impressions: 130, clicks: 3, position: 7 }], {
      queries: () => queries("2026-11-21"),
    });
    await importSearchConsole(database.db, second.client, new Date("2026-11-26T06:00:00.000Z"));
    expect((await database.db.select().from(searchQueries)).map((row) => row.query).sort()).toEqual(["dictate on mac", "mac dictation offline"]);

    const { body } = await call(`/v1/posts/${moved}/search/queries?days=28&limit=1`);
    expect(body).toMatchObject({ to: "2026-11-21", queries: [{ query: "dictate on mac", impressions: 100, clicks: 3 }] });
    expect(body.queries[0].position).toBeCloseTo(7, 6);
    expect(body.queries[0].ctr).toBeCloseTo(0.03, 6);
  });

  test("CMS-SEARCH-007 marks the days a post went live or changed its title, description or content, on Search Console's days", async () => {
    const revisions = async () => database.db.select().from(postRevisions).where(eq(postRevisions.postId, moved)).orderBy(asc(postRevisions.createdAt));
    const slugChange = (await revisions()).at(-1)!;
    await updatePost(cms, moved, { title: "How to dictate on a Mac without the cloud, the 2026 guide" }, { name: "github:owner", githubUserId: 1 });
    const titleChange = (await revisions()).at(-1)!;
    // The audit entries as they would have been written on those days.
    await database.db.insert(auditLog).values([
      { action: "post.published", actor: "github:owner", postId: moved, subject: "x", at: new Date("2026-11-15T07:30:00.000Z") },
      { action: "post.edited", actor: "github:owner", postId: moved, subject: "x", revisionId: slugChange.id, at: new Date("2026-11-17T12:00:00.000Z") },
      { action: "post.edited", actor: "token:hush-seo", postId: moved, subject: "x", revisionId: titleChange.id, at: new Date("2026-11-18T12:00:00.000Z") },
    ]);
    const { body } = await call(`/v1/posts/${moved}/search?days=28`);
    expect(body.markers).toEqual([
      { date: "2026-11-14", kind: "published", changes: [], actor: "github:owner" },
      { date: "2026-11-18", kind: "edited", changes: ["title"], actor: "token:hush-seo" },
    ]);
    // Too few impressions in the earlier period for a valid change.
    expect(body.previous).toMatchObject({ from: "2026-09-27", to: "2026-10-24" });
    expect(body.change).toBeNull();
    const { body: searches } = await call(`/v1/posts/${moved}/search/queries?days=28`);
    expect(searches.queries.map((query: { query: string; striking: boolean }) => [query.query, query.striking]))
      .toEqual([["dictate on mac", false], ["mac dictation offline", true]]);
  });
});
