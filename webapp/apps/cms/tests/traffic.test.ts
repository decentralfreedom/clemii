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
import { trafficDaily, trafficSiteDaily, trafficSourceDaily } from "../src/db/schema";
import { channelOf, pageTypeOf } from "../src/traffic/channels";
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

/** A page view (or a download) on a US Pacific day, with the referring domain and the link's tags as Umami stores them. */
type Event = { day: string; path: string; download?: boolean; referrer?: string; query?: string };

/** Umami 3.5.0 over a list of events, each on a US Pacific day. */
function fakeUmami(events: Event[], options: { createdAt?: string; redirect?: boolean; breakdownCap?: number; dropSource?: boolean } = {}) {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  const dayOf = (startAt: number) => events.filter((event) => pacificDayRange(event.day).startAt === startAt);
  const fetcher = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    if (options.redirect) return new Response(null, { status: 302, headers: { location: "https://team.cloudflareaccess.com/cdn-cgi/access/login" } });
    if (url.pathname === `/api/websites/${config.websiteId}`) return Response.json({ id: config.websiteId, createdAt: options.createdAt ?? "2026-11-20T10:00:00.000Z" });
    if (url.pathname === "/api/reports/breakdown") {
      // Page views grouped by the fields asked for, as getBreakdown.ts does, at most 500 rows.
      const body = JSON.parse(String(init?.body)) as { websiteId: string; type: string; filters: { path?: string }; parameters: { startDate: string; endDate: string; fields: string[] } };
      expect(body).toMatchObject({ websiteId: config.websiteId, type: "breakdown", parameters: { fields: ["path", "referrer", "utmSource", "utmMedium", "utmCampaign", "utmContent"] } });
      const rows = new Map<string, Record<string, string | null>>();
      const counts = new Map<string, number>();
      for (const event of dayOf(Date.parse(body.parameters.startDate))) {
        if (event.download || (body.filters.path && event.path !== body.filters.path)) continue;
        const tags = new URLSearchParams(event.query ?? "");
        const row = { path: event.path, referrer: event.referrer ?? null, utmSource: tags.get("utm_source"), utmMedium: tags.get("utm_medium"), utmCampaign: tags.get("utm_campaign"), utmContent: tags.get("utm_content") };
        const key = JSON.stringify(row);
        rows.set(key, row);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const all = [...rows].map(([key, row]) => ({ views: String(counts.get(key)), visitors: 1, visits: 1, bounces: 0, totaltime: "0", ...row }));
      return Response.json(all.slice(options.dropSource ? 1 : 0, options.breakdownCap ?? 500));
    }
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
      const downloads = dayOf(startAt).filter((event) => event.download).map((event) => ({ urlPath: event.path, urlQuery: event.query ?? "", eventName: "download", eventType: 2 }));
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
    const { pages: rows, downloads: events } = await client.day("2026-11-21");
    expect(rows).toHaveLength(502);
    expect(rows.find((row) => row.path === "/blog/a")).toEqual({ path: "/blog/a", pageviews: 1, downloads: 501 });
    expect(events).toHaveLength(501);
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

describe("channels", () => {
  const visit = (referrer: string | null, utmSource: string | null = null, utmMedium: string | null = null) => ({ referrer, utmSource, utmMedium });
  test("CMS-TRAFFIC-004 follow Umami's rules, with our own links' tags first", () => {
    expect(channelOf(visit(null))).toBe("direct");
    expect(channelOf(visit("google.com"))).toBe("organicSearch");
    expect(channelOf(visit("duckduckgo.com"))).toBe("organicSearch");
    expect(channelOf(visit("chatgpt.com"))).toBe("ai");
    expect(channelOf(visit("perplexity.ai"))).toBe("ai");
    expect(channelOf(visit("linkedin.com"))).toBe("organicSocial");
    expect(channelOf(visit("news.ycombinator.com"))).toBe("organicSocial");
    expect(channelOf(visit("mail.google.com"))).toBe("organicSearch");
    expect(channelOf(visit("outlook.live.com"))).toBe("email");
    expect(channelOf(visit("youtube.com"))).toBe("video");
    expect(channelOf(visit("github.com"))).toBe("referral");
    // A tagged Reddit link opened in the Reddit app sends no referrer: Umami would say direct, the tags say social.
    expect(channelOf(visit(null, "reddit", "social"))).toBe("organicSocial");
    expect(channelOf(visit(null, "newsletter", "email"))).toBe("email");
    expect(channelOf(visit("example.org", "creator-anna", "social"))).toBe("organicSocial");
    expect(channelOf(visit(null, "partner.example", "referral"))).toBe("referral");
    expect(channelOf(visit("google.com", "google", "cpc"))).toBe("paidSearch");
    expect(channelOf(visit(null, "reddit", "paid_social"))).toBe("paidSocial");
    // A source with a medium no rule knows is shown as other, never guessed.
    expect(channelOf(visit(null, "somewhere", "banner"))).toBe("other");
    expect(pageTypeOf("/", false)).toBe("home");
    expect(pageTypeOf("/de", false)).toBe("home");
    expect(pageTypeOf("/releases/0.1.0-alpha.9", false)).toBe("release");
    expect(pageTypeOf("/blog/x", true)).toBe("post");
    expect(pageTypeOf("/privacy", false)).toBe("other");
  });
});

describe.skipIf(!serverUrl)("CMS Umami sources", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  let owner = "";
  let post = "";

  beforeAll(async () => {
    database = await createTestDatabase();
    const cms = { db: database.db, media: new LocalObjectStore(await mkdtemp(join(tmpdir(), "hush-cms-sources-"))) };
    app = createApp(cms);
    owner = await ownerSession(database.db);
    const actor = systemActor("test");
    const draft = await createDraft(cms.db, validPost({ slug: "dictate-on-mac-old", keyword: "dictate on mac" }), actor);
    await publishPost(cms, draft.id, actor);
    post = (await updatePost(cms, draft.id, { slug: "dictate-on-mac" }, { name: "github:owner", githubUserId: 1 })).id;
  });
  afterAll(async () => { await database.drop(); });

  const call = async (path: string) => {
    const response = await app.request(path, { headers: credentials(owner) });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  const day = "2026-11-20";
  const reddit = "utm_source=reddit&utm_medium=social&utm_campaign=launch";
  const events: Event[] = [
    { day, path: "/blog/dictate-on-mac", referrer: "google.com" },
    { day, path: "/blog/dictate-on-mac", referrer: "google.com" },
    { day, path: "/blog/dictate-on-mac-old", referrer: "chatgpt.com" },
    { day, path: "/blog/dictate-on-mac", query: reddit },
    { day, path: "/blog/dictate-on-mac", query: reddit, download: true },
    { day, path: "/blog/dictate-on-mac", download: true },
    { day, path: "/" },
    { day, path: "/", query: "utm_source=newsletter&utm_medium=email&utm_campaign=december" },
    { day, path: "/releases/0.1.0-alpha.9" },
  ];

  test("CMS-TRAFFIC-005 imports every page's page views and tagged downloads per source, and refuses a day whose sources do not add up", async () => {
    // A read that loses a source row is not stored: the day's sources must equal its page views.
    expect(importTraffic(database.db, fakeUmami(events, { createdAt: "2026-11-20T10:00:00.000Z", dropSource: true }).client, new Date("2026-11-22T05:00:00.000Z")))
      .rejects.toThrow("add up to");
    expect(await database.db.select().from(trafficSourceDaily)).toEqual([]);
    await database.db.delete(trafficSiteDaily);

    await importTraffic(database.db, fakeUmami(events, { createdAt: "2026-11-20T10:00:00.000Z" }).client, new Date("2026-11-22T05:00:00.000Z"));
    const rows = (await database.db.select().from(trafficSourceDaily)).map(({ date: _date, ...row }) => row);
    const blank = { medium: "", campaign: "", content: "", downloads: 0 };
    expect(rows).toEqual(expect.arrayContaining([
      { path: "/blog/dictate-on-mac", postId: post, pageType: "post", channel: "organicSearch", source: "google.com", ...blank, pageviews: 2 },
      // An address the post once had counts for the post.
      { path: "/blog/dictate-on-mac-old", postId: post, pageType: "post", channel: "ai", source: "chatgpt.com", ...blank, pageviews: 1 },
      // The tagged link: its page view and its download on one row; the untagged download is not attributed.
      { path: "/blog/dictate-on-mac", postId: post, pageType: "post", channel: "organicSocial", source: "reddit", medium: "social", campaign: "launch", content: "", pageviews: 1, downloads: 1 },
      { path: "/", postId: null, pageType: "home", channel: "direct", source: "", ...blank, pageviews: 1 },
      { path: "/", postId: null, pageType: "home", channel: "email", source: "newsletter", medium: "email", campaign: "december", content: "", pageviews: 1, downloads: 0 },
      { path: "/releases/0.1.0-alpha.9", postId: null, pageType: "release", channel: "direct", source: "", ...blank, pageviews: 1 },
    ]));
    expect(rows).toHaveLength(6);
  });

  test("CMS-TRAFFIC-005 a day with more than 500 sources is read page by page, so none is cut off", async () => {
    const busy: Event[] = Array.from({ length: 501 }, (_, index) => ({ day: "2026-11-19", path: index % 2 ? "/" : "/blog/dictate-on-mac", referrer: `site-${index}.example` }));
    const { calls, client } = fakeUmami(busy);
    const sources = await client.sources("2026-11-19", ["/", "/blog/dictate-on-mac"]);
    expect(sources).toHaveLength(501);
    expect(calls.filter(({ url }) => url.pathname === "/api/reports/breakdown")).toHaveLength(3);
  });

  test("CMS-TRAFFIC-006 the API groups traffic by channel, source, campaign, page or page type, for the site or one post", async () => {
    const byChannel = await call("/v1/traffic/sources?days=7");
    expect(byChannel.body).toMatchObject({ from: "2026-11-20", to: "2026-11-20", groupBy: "channel", totals: { pageviews: 7, downloads: 1 } });
    expect(byChannel.body.rows).toEqual([
      { channel: "direct", pageviews: 2, downloads: 0 },
      { channel: "organicSearch", pageviews: 2, downloads: 0 },
      expect.objectContaining({ pageviews: 1 }), expect.objectContaining({ pageviews: 1 }), expect.objectContaining({ pageviews: 1 }),
    ]);
    expect(byChannel.body.rows.find((row: { channel: string }) => row.channel === "organicSocial")).toEqual({ channel: "organicSocial", pageviews: 1, downloads: 1 });
    expect((await call(`/v1/traffic/sources?days=7&groupBy=source&postId=${post}`)).body.rows).toEqual([
      { channel: "organicSearch", source: "google.com", pageviews: 2, downloads: 0 },
      expect.objectContaining({ pageviews: 1 }), expect.objectContaining({ pageviews: 1 }),
    ]);
    expect((await call("/v1/traffic/sources?days=7&groupBy=campaign")).body.rows).toEqual(expect.arrayContaining([
      { source: "reddit", medium: "social", campaign: "launch", content: "", pageviews: 1, downloads: 1 },
      { source: "newsletter", medium: "email", campaign: "december", content: "", pageviews: 1, downloads: 0 },
    ]));
    expect((await call("/v1/traffic/sources?days=7&groupBy=pageType")).body.rows).toEqual([
      { pageType: "post", pageviews: 4, downloads: 1 },
      { pageType: "home", pageviews: 2, downloads: 0 },
      { pageType: "release", pageviews: 1, downloads: 0 },
    ]);
    expect((await call("/v1/traffic/sources?days=7&groupBy=page&pageType=home")).body.rows).toEqual([{ path: "/", postId: null, pageType: "home", pageviews: 2, downloads: 0 }]);
    expect((await call("/v1/traffic/sources?groupBy=nonsense")).status).toBe(400);
  });
});

