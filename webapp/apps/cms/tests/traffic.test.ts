// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// CMS-TRAFFIC-001 to 003: page views and downloads from Umami (PRD R11). The
// fake answers as Umami 3.5.0 does (recorded from a running instance: page
// views as strings in metrics/expanded, downloads as "download" events with
// the page they started from).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { createToken, systemActor } from "../src/auth/tokens";
import { loadConfig, type UmamiConfig } from "../src/config";
import { trafficDaily, trafficSiteDaily } from "../src/db/schema";
import { createDraft, publishPost, updatePost } from "../src/posts/service";
import { LocalObjectStore } from "../src/storage/object-store";
import { importTraffic, readTrafficState, trafficImportDue } from "../src/traffic/import";
import { pacificDayRange, umamiClient } from "../src/traffic/umami";
import { createTestDatabase, serverUrl } from "./database";
import { credentials, ownerSession, validPost } from "./fixtures";

const config: UmamiConfig = {
  url: "https://umami.example", websiteId: "3ab8b1b7-1382-423a-b0f1-89c1a992d0b3", apiKey: "umami-api-key",
  access: { clientId: "access-id.access", clientSecret: "access-secret" },
};

type Event = { day: string; path: string; download?: boolean };

/** Umami 3.5.0 over a list of events, each on a US Pacific day. */
function fakeUmami(events: Event[], options: { createdAt?: string; redirect?: boolean } = {}) {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  const dayOf = (startAt: number) => events.filter((event) => pacificDayRange(event.day).startAt === startAt);
  const fetcher = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    if (options.redirect) return new Response(null, { status: 302, headers: { location: "https://team.cloudflareaccess.com/cdn-cgi/access/login" } });
    if (url.pathname === `/api/websites/${config.websiteId}`) return Response.json({ id: config.websiteId, createdAt: options.createdAt ?? "2026-11-20T10:00:00.000Z" });
    const startAt = Number(url.searchParams.get("startAt"));
    expect(Number(url.searchParams.get("endAt"))).toBe(pacificDayRange(dayOf(startAt)[0]?.day ?? new Date(startAt).toISOString().slice(0, 10)).endAt);
    const limit = Number(url.searchParams.get("limit") ?? url.searchParams.get("pageSize"));
    if (url.pathname.endsWith("/metrics/expanded")) {
      expect(url.searchParams.get("type")).toBe("path");
      const views = new Map<string, number>();
      for (const event of dayOf(startAt)) if (!event.download) views.set(event.path, (views.get(event.path) ?? 0) + 1);
      const offset = Number(url.searchParams.get("offset"));
      return Response.json([...views].slice(offset, offset + limit).map(([name, count]) => ({ name, pageviews: String(count), visitors: 1, visits: 1, bounces: 0, totaltime: 0 })));
    }
    if (url.pathname.endsWith("/events")) {
      expect(url.searchParams.get("event")).toBe("download");
      const page = Number(url.searchParams.get("page"));
      const downloads = dayOf(startAt).filter((event) => event.download).map((event) => ({ urlPath: event.path, eventName: "download", eventType: 2 }));
      return Response.json({ data: downloads.slice((page - 1) * limit, page * limit), count: downloads.length, page, pageSize: limit });
    }
    return new Response("{}", { status: 404 });
  };
  return { calls, client: umamiClient(config, fetcher) };
}

describe("Umami configuration and client", () => {
  const base = { NODE_ENV: "test", CMS_DATABASE_URL: "postgres://x/y" };
  test("is off without a URL, needs the website and key, takes an Access token only whole, never echoes secrets", () => {
    expect(loadConfig(base).umami).toBeUndefined();
    const on = { ...base, CMS_UMAMI_URL: "https://umami.example/", CMS_UMAMI_WEBSITE_ID: config.websiteId, CMS_UMAMI_API_KEY: "secret-api-key" };
    expect(loadConfig(on).umami).toEqual({ url: "https://umami.example", websiteId: config.websiteId, apiKey: "secret-api-key" });
    expect(() => loadConfig({ ...on, CMS_UMAMI_API_KEY: "" })).toThrow("CMS_UMAMI_API_KEY");
    expect(() => loadConfig({ ...on, CMS_UMAMI_WEBSITE_ID: "behu.sh" })).toThrow("CMS_UMAMI_WEBSITE_ID");
    expect(() => loadConfig({ ...on, CMS_UMAMI_URL: "http://umami.example" })).toThrow("HTTPS");
    let message = "";
    try { loadConfig({ ...on, CMS_UMAMI_ACCESS_CLIENT_SECRET: "secret-access-value" }); } catch (error) { message = String(error); }
    expect(message).toContain("CMS_UMAMI_ACCESS_CLIENT_ID");
    expect(message).not.toContain("secret-access-value");
  });

  test("CMS-TRAFFIC-001 reads a US Pacific day's page views and downloads per page, every page of them, with the Access token", async () => {
    // Daylight saving time ends on 1 November 2026: that Pacific day has 25 hours.
    expect(pacificDayRange("2026-11-01")).toEqual({ startAt: Date.parse("2026-11-01T07:00:00.000Z"), endAt: Date.parse("2026-11-02T07:59:59.999Z") });
    const many: Event[] = Array.from({ length: 501 }, (_, index) => ({ day: "2026-11-21", path: `/page-${index}` }));
    const downloads: Event[] = Array.from({ length: 501 }, () => ({ day: "2026-11-21", path: "/blog/a", download: true }));
    const { calls, client } = fakeUmami([...many, ...downloads, { day: "2026-11-21", path: "/blog/a" }]);
    const rows = await client.day("2026-11-21");
    expect(rows).toHaveLength(502);
    expect(rows.find((row) => row.path === "/blog/a")).toEqual({ path: "/blog/a", pageviews: 1, downloads: 501 });
    expect(calls.every(({ headers }) => headers.get("authorization") === "Bearer umami-api-key"
      && headers.get("cf-access-client-id") === "access-id.access" && headers.get("cf-access-client-secret") === "access-secret")).toBe(true);
    // Two pages of each.
    expect(calls.filter(({ url }) => url.pathname.endsWith("/metrics/expanded"))).toHaveLength(2);
    expect(calls.filter(({ url }) => url.pathname.endsWith("/events"))).toHaveLength(2);
    // Cloudflare Access answering with its sign-in is an error that names the setting, never data.
    expect(fakeUmami([], { redirect: true }).client.day("2026-11-21")).rejects.toThrow("CMS_UMAMI_ACCESS_CLIENT_ID");
  });
});

describe.skipIf(!serverUrl)("CMS Umami import", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  let owner = "";
  let moved = "";

  beforeAll(async () => {
    database = await createTestDatabase();
    const cms = { db: database.db, media: new LocalObjectStore(await mkdtemp(join(tmpdir(), "hush-cms-traffic-"))) };
    app = createApp(cms);
    owner = await ownerSession(database.db);
    const actor = systemActor("test");
    const post = await createDraft(cms.db, validPost({ slug: "dictate-on-mac-old", keyword: "dictate on mac" }), actor);
    await publishPost(cms, post.id, actor);
    moved = (await updatePost(cms, post.id, { slug: "dictate-on-mac" }, { name: "github:owner", githubUserId: 1 })).id;
  });
  afterAll(async () => { await database.drop(); });

  const call = async (path: string, credential = owner) => {
    const response = await app.request(path, { headers: credentials(credential) });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };

  test("CMS-TRAFFIC-002 imports every complete day since Umami's website was created, per post at every address it had, and the site", async () => {
    // 22 November, 05:00 UTC is still the 21st in US Pacific time: the last complete day is the 20th.
    const now = new Date("2026-11-22T05:00:00.000Z");
    const events: Event[] = [
      { day: "2026-11-20", path: "/blog/dictate-on-mac-old" },
      { day: "2026-11-20", path: "/blog/dictate-on-mac" },
      { day: "2026-11-20", path: "/blog/dictate-on-mac", download: true },
      { day: "2026-11-20", path: "/" },
      { day: "2026-11-20", path: "/", download: true },
      { day: "2026-11-21", path: "/blog/dictate-on-mac" },
    ];
    expect(await trafficImportDue(database.db, now)).toBe(true);
    const { client } = fakeUmami(events, { createdAt: "2026-11-19T10:00:00.000Z" });
    const result = await importTraffic(database.db, client, now);
    expect(result).toMatchObject({ from: "2026-11-19", through: "2026-11-20", days: 2, otherPages: ["/"] });
    expect(await database.db.select().from(trafficDaily)).toEqual([{ postId: moved, date: "2026-11-20", pageviews: 2, downloads: 1 }]);
    // Every page counts for the site, and a day without any is zero, not missing: Umami was counting.
    expect(await database.db.select().from(trafficSiteDaily)).toEqual([
      { date: "2026-11-19", pageviews: 0, downloads: 0 },
      { date: "2026-11-20", pageviews: 3, downloads: 2 },
    ]);
    expect(await trafficImportDue(database.db, now)).toBe(false);

    // The next day re-reads the day before for late events and adds the new one; the last day never moves back.
    const later = new Date("2026-11-23T09:00:00.000Z");
    expect(await trafficImportDue(database.db, new Date(later.getTime()))).toBe(true);
    const next = await importTraffic(database.db, fakeUmami([...events, { day: "2026-11-21", path: "/blog/dictate-on-mac", download: true }]).client, later);
    // From the 19th (the day before the 20th) through the 22nd.
    expect(next).toMatchObject({ through: "2026-11-22", days: 4 });
    expect(await readTrafficState(database.db)).toMatchObject({ importedFrom: "2026-11-19", importedThrough: "2026-11-22" });
  });

  test("CMS-TRAFFIC-003 the API gives a post's and the site's page views and downloads over complete days the CMS has", async () => {
    const reader = await createToken(database.db, { name: "traffic-reader", scopes: ["posts:read"] }, systemActor("test"));
    const post = await call(`/v1/posts/${moved}/traffic?days=7`, reader);
    expect(post).toMatchObject({ status: 200, body: { from: "2026-11-19", to: "2026-11-22", totals: { pageviews: 3, downloads: 2 } } });
    expect(post.body.days).toEqual([
      { date: "2026-11-20", pageviews: 2, downloads: 1 },
      { date: "2026-11-21", pageviews: 1, downloads: 1 },
    ]);
    const site = await call("/v1/traffic?since=2026-11-21", reader);
    expect(site.body).toMatchObject({ from: "2026-11-21", to: "2026-11-22", totals: { pageviews: 1, downloads: 1 } });
    expect((await call("/v1/traffic", "none")).status).toBe(401);
    expect((await call("/v1/posts/00000000-0000-4000-8000-000000000000/traffic")).status).toBe(404);
  });
});
