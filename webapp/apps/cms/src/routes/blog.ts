// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// How the blog drives downloads: its posts' Google impressions and clicks
// (Search Console, by page) and their page views and the downloads that
// started on them (Umami), per US Pacific day and per post. Everything counts
// the same days: those both sources have, so no step compares a different
// period. Before the two share a day (Umami started later and Search Console
// lags), Google's numbers stand alone over its own days and page views and
// downloads are not counted yet: null, never 0. Home and download pages are
// not posts and do not count here.
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, gte, lte, sql } from "drizzle-orm";
import { requireScope, type AuthVariables } from "../auth/tokens";
import type { Database } from "../db/client";
import { posts, searchDaily, trafficDaily } from "../db/schema";
import { clampedStart } from "../search/analytics";
import { readSearchState } from "../search/import";
import { readTrafficState } from "../traffic/import";
import { errorSchema, validationHook } from "./errors";

const counts = {
  impressions: z.number().int(), clicks: z.number().int().describe("Clicks from Google Search"),
  pageviews: z.number().int().nullable().describe("From every source; null before Umami counts these days"),
  downloads: z.number().int().nullable().describe("Downloads started on the post's pages; null before Umami counts these days"),
};

const blogSchema = z.object({
  from: z.iso.date().nullable().describe("The first day in the window: of the days both sources have, or of Search Console's alone before they share one; null without Search Console numbers"),
  to: z.iso.date().nullable(),
  preliminaryFrom: z.iso.date().nullable().describe("The first day Google was still counting at its last import; its numbers may still change"),
  searchImportedAt: z.iso.datetime().nullable(),
  trafficImportedAt: z.iso.datetime().nullable(),
  trafficCounted: z.boolean().describe("Whether page views and downloads count these days; false while Umami has none of them"),
  trafficFrom: z.iso.date().nullable().describe("The first day Umami counts"),
  totals: z.object(counts),
  days: z.array(z.object({ date: z.iso.date(), ...counts })).describe("Only days with numbers; a day in the window without one had none"),
  posts: z.array(z.object({ postId: z.uuid(), title: z.string(), status: z.string(), ...counts })).describe("Every post with numbers in the window, most downloads first"),
}).openapi("BlogAnalytics");

const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });
const zero = { impressions: 0, clicks: 0, pageviews: 0, downloads: 0 };

/**
 * The days both sources have, ending on the earlier last day, as far back as
 * asked; before they share one, Search Console's own days.
 */
export async function blogWindow(db: Database, span: number, since?: string) {
  const [search, traffic] = await Promise.all([readSearchState(db), readTrafficState(db)]);
  const base = {
    searchImportedAt: search?.importedAt?.toISOString() ?? null, trafficImportedAt: traffic?.importedAt?.toISOString() ?? null,
    trafficFrom: traffic?.importedFrom ?? null,
  };
  if (!search?.importedFrom || !search.importedThrough) return { from: null, to: null, preliminaryFrom: null, trafficCounted: false, ...base };
  const shared = traffic?.importedFrom && traffic.importedThrough
    && traffic.importedThrough >= search.importedFrom && search.importedThrough >= traffic.importedFrom;
  const to = shared && traffic.importedThrough! < search.importedThrough ? traffic.importedThrough! : search.importedThrough;
  const coverage = shared && traffic.importedFrom! > search.importedFrom ? traffic.importedFrom! : search.importedFrom;
  const from = clampedStart(coverage, to, span, since);
  const incomplete = search.incompleteFrom;
  const preliminaryFrom = !incomplete || incomplete > to ? null : incomplete < from ? from : incomplete;
  return { from, to, preliminaryFrom, trafficCounted: Boolean(shared), ...base };
}

export function blogRoutes(db: Database) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({ defaultHook: validationHook });
  app.use("/v1/blog", requireScope(db, "posts:read"));

  app.openapi(createRoute({
    method: "get", path: "/v1/blog", operationId: "getBlogAnalytics", tags: ["Posts"], security: [{ bearer: [] }],
    description: "The blog's funnel and every post's part in it: Google impressions and clicks, page views and downloads, over the last `days` days (or since a day) that both Search Console and Umami have.",
    request: { query: z.object({ days: z.coerce.number().int().min(1).max(3650).default(90), since: z.iso.date().optional() }) },
    responses: {
      200: json(blogSchema, "The blog's analytics"),
      401: json(errorSchema, "Missing or invalid token"), 403: json(errorSchema, "The token lacks posts:read"), 400: json(errorSchema, "Invalid query"),
    },
  }), async (context) => {
    const { days: span, since } = context.req.valid("query");
    const window = await blogWindow(db, span, since);
    if (!window.from || !window.to) return context.json({ ...window, totals: { ...zero, pageviews: null, downloads: null }, days: [], posts: [] }, 200);
    const s = searchDaily, t = trafficDaily;
    const counted = window.trafficCounted;
    const [searchDays, trafficDays, searchPosts, trafficPosts, titles] = await Promise.all([
      db.select({ date: s.date, impressions: sql<number>`sum(${s.impressions})::int`, clicks: sql<number>`sum(${s.clicks})::int` })
        .from(s).where(and(gte(s.date, window.from), lte(s.date, window.to))).groupBy(s.date),
      counted ? db.select({ date: t.date, pageviews: sql<number>`sum(${t.pageviews})::int`, downloads: sql<number>`sum(${t.downloads})::int` })
        .from(t).where(and(gte(t.date, window.from), lte(t.date, window.to))).groupBy(t.date) : [],
      db.select({ postId: s.postId, impressions: sql<number>`sum(${s.impressions})::int`, clicks: sql<number>`sum(${s.clicks})::int` })
        .from(s).where(and(gte(s.date, window.from), lte(s.date, window.to))).groupBy(s.postId),
      counted ? db.select({ postId: t.postId, pageviews: sql<number>`sum(${t.pageviews})::int`, downloads: sql<number>`sum(${t.downloads})::int` })
        .from(t).where(and(gte(t.date, window.from), lte(t.date, window.to))).groupBy(t.postId) : [],
      db.select({ id: posts.id, title: posts.title, status: posts.status }).from(posts),
    ]);
    const days = new Map<string, { date: string } & typeof zero>();
    for (const day of [...searchDays, ...trafficDays]) days.set(day.date, { ...(days.get(day.date) ?? { date: day.date, ...zero }), ...day });
    const byPost = new Map<string, typeof zero>();
    for (const row of [...searchPosts, ...trafficPosts]) { const { postId, ...values } = row; byPost.set(postId, { ...(byPost.get(postId) ?? zero), ...values }); }
    const named = new Map(titles.map((post) => [post.id, post]));
    const rows = [...byPost].map(([postId, values]) => ({ postId, title: named.get(postId)?.title ?? "", status: named.get(postId)?.status ?? "draft", ...values }))
      .sort((a, b) => b.downloads - a.downloads || b.pageviews - a.pageviews || b.clicks - a.clicks || a.title.localeCompare(b.title));
    const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    const totals = sortedDays.reduce((sum, day) => ({ impressions: sum.impressions + day.impressions, clicks: sum.clicks + day.clicks, pageviews: sum.pageviews + day.pageviews, downloads: sum.downloads + day.downloads }), zero);
    if (counted) return context.json({ ...window, totals, days: sortedDays, posts: rows }, 200);
    // Umami has none of these days yet: its numbers are unknown, not zero.
    const unknown = { pageviews: null, downloads: null };
    return context.json({
      ...window, totals: { impressions: totals.impressions, clicks: totals.clicks, ...unknown },
      days: sortedDays.map(({ date, impressions, clicks }) => ({ date, impressions, clicks, ...unknown })),
      posts: rows.map(({ postId, title, status, impressions, clicks }) => ({ postId, title, status, impressions, clicks, ...unknown })),
    }, 200);
  });

  return app;
}
