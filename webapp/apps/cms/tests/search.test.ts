// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Search Console journeys (docs/user-journeys/cms.md, PRD R12): the scheduler
// imports Google's numbers per post and day; the admin and agents read them.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { createToken, systemActor } from "../src/auth/tokens";
import { loadConfig, type SearchConsoleConfig } from "../src/config";
import { searchDaily, searchConsoleState } from "../src/db/schema";
import { pagePathOf } from "../src/posts/paths";
import { createDraft, publishPost, updatePost } from "../src/posts/service";
import { searchConsoleClient, type SearchRow } from "../src/search/console";
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
function fakeGoogle(rows: (start: string, end: string) => SearchRow[], options: { fail?: boolean } = {}) {
  const calls: Array<{ url: string; body: string }> = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    calls.push({ url, body });
    if (options.fail) return new Response("{}", { status: 503 });
    if (url === config.key.tokenUri) return Response.json({ access_token: "google-token", expires_in: 3600 });
    if (url.endsWith("/sites")) return Response.json({ siteEntry: [{ siteUrl: "sc-domain:behu.sh", permissionLevel: "siteRestrictedUser" }] });
    const { startDate, endDate, startRow, rowLimit } = JSON.parse(body) as { startDate: string; endDate: string; startRow: number; rowLimit: number };
    const page = rows(startDate, endDate).slice(startRow, startRow + rowLimit);
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
  });

  test("addresses reduce to their path, whatever the host", () => {
    expect(pagePathOf("https://behu.sh/blog/dictate-on-mac/")).toBe("/blog/dictate-on-mac");
    expect(pagePathOf("https://clemii.com/de/blog/diktieren?utm=x#top")).toBe("/de/blog/diktieren");
    expect(pagePathOf("https://behu.sh/")).toBe("/");
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
    expect(JSON.parse(calls.find((entry) => entry.url.includes("searchAnalytics"))!.body)).toMatchObject({
      startDate: "2025-07-24", endDate: "2026-11-22", dimensions: ["page", "date"], dataState: "all",
    });
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
    expect(JSON.parse(calls.find((entry) => entry.url.includes("searchAnalytics"))!.body)).toMatchObject({ startDate: "2026-11-09", endDate: "2026-11-23" });
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
    expect((await call("/v1/posts/00000000-0000-4000-8000-000000000000/search")).status).toBe(404);
    expect((await call(`/v1/posts/${moved}/search`, "none")).status).toBe(401);
  });
});
