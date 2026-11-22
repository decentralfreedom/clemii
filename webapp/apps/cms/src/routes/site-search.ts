// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The site's Google Search Console numbers for the Analytics dashboard (PRD
// R12): the property's own totals per day (search_site_daily, aggregated by
// property, so they are Google's site totals and not the sum of the posts),
// the change from the period before under the same rules as a post's
// (search/analytics.ts), and the posts that brought the most search traffic.
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { requireScope, type AuthVariables } from "../auth/tokens";
import type { Database } from "../db/client";
import { posts, postRenditions, searchDaily, searchSiteDaily } from "../db/schema";
import { changeFrom, minimumImpressions, previousPeriod, searchWindow, totalsOf } from "../search/analytics";
import { errorSchema, validationHook } from "./errors";
import { daySchema, totalsSchema } from "./search";

const topPostSchema = z.object({
  postId: z.uuid(),
  title: z.string().describe("The article's heading as published, else its title"),
  lang: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "scheduled", "published"]),
  impressions: z.number().int(),
  clicks: z.number().int(),
  ctr: z.number(),
  position: z.number().describe("Average position, weighted by impressions"),
}).openapi("SearchTopPost");

const siteSearchSchema = z.object({
  from: z.iso.date().nullable(),
  to: z.iso.date().nullable(),
  importedAt: z.iso.datetime().nullable(),
  preliminaryFrom: z.iso.date().nullable().describe("The first day in the window Google was still counting at the last import: numbers from it on may still change. Null when all are final"),
  totals: totalsSchema.describe("The property's totals, as Google aggregates a site; not the sum of the posts"),
  previous: z.object({ from: z.iso.date(), to: z.iso.date(), totals: totalsSchema }).nullable(),
  change: z.object({
    impressions: z.number().nullable(), clicks: z.number().nullable(), ctrPoints: z.number(), position: z.number().nullable(),
  }).nullable().describe(`Against the earlier period; null without one, or when either period has fewer than ${minimumImpressions} impressions`),
  days: z.array(daySchema),
  topPosts: z.array(topPostSchema).describe("Posts with the most clicks, then impressions, in the window"),
}).openapi("SiteSearch");

const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });

function siteDays(db: Database, from: string, to: string) {
  return db.select({ date: searchSiteDaily.date, impressions: searchSiteDaily.impressions, clicks: searchSiteDaily.clicks, position: searchSiteDaily.position })
    .from(searchSiteDaily)
    .where(and(gte(searchSiteDaily.date, from), lte(searchSiteDaily.date, to)))
    .orderBy(asc(searchSiteDaily.date));
}

export function siteSearchRoutes(db: Database) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({ defaultHook: validationHook });
  app.use("/v1/search", requireScope(db, "posts:read"));

  app.openapi(createRoute({
    method: "get", path: "/v1/search", operationId: "getSiteSearch", tags: ["Posts"], security: [{ bearer: [] }],
    description: "The site's Google Search Console numbers over the last `days` days Search Console has (28 by default), or since a day: Google's own site totals, the change from the period before, and the posts with the most search clicks.",
    request: {
      query: z.object({
        days: z.coerce.number().int().min(1).max(3650).default(28),
        since: z.iso.date().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(10),
      }),
    },
    responses: {
      200: json(siteSearchSchema, "The site's search numbers"),
      401: json(errorSchema, "Missing or invalid token"),
      403: json(errorSchema, "The token lacks posts:read"),
      422: json(errorSchema, "Invalid query"),
    },
  }), async (context) => {
    const { days: span, since, limit } = context.req.valid("query");
    const { from, to, coverage, importedAt, preliminaryFrom } = await searchWindow(db, span, since);
    if (!from || !to || !coverage) {
      return context.json({ from, to, importedAt, preliminaryFrom, totals: totalsOf([]), previous: null, change: null, days: [], topPosts: [] }, 200);
    }
    const days = await siteDays(db, from, to);
    const totals = totalsOf(days);
    const earlier = previousPeriod(from, to, coverage);
    const previous = earlier ? { ...earlier, totals: totalsOf(await siteDays(db, earlier.from, earlier.to)) } : null;
    const impressions = sql<number>`sum(${searchDaily.impressions})::int`;
    const clicks = sql<number>`sum(${searchDaily.clicks})::int`;
    const top = await db.select({
      postId: searchDaily.postId, impressions, clicks,
      position: sql<number>`sum(${searchDaily.position} * ${searchDaily.impressions}) / nullif(sum(${searchDaily.impressions}), 0)`,
      title: sql<string>`coalesce(${postRenditions.heading}, ${posts.title})`,
      lang: posts.lang, slug: posts.slug, status: posts.status,
    }).from(searchDaily)
      .innerJoin(posts, eq(posts.id, searchDaily.postId))
      .leftJoin(postRenditions, eq(postRenditions.postId, posts.id))
      .where(and(gte(searchDaily.date, from), lte(searchDaily.date, to)))
      .groupBy(searchDaily.postId, posts.title, postRenditions.heading, posts.lang, posts.slug, posts.status)
      .orderBy(desc(clicks), desc(impressions), asc(posts.slug))
      .limit(limit);
    return context.json({
      from, to, importedAt, preliminaryFrom, totals, previous,
      change: changeFrom(totals, previous?.totals),
      days,
      topPosts: top.map((row) => ({ ...row, position: Number(row.position ?? 0), ctr: row.impressions ? row.clicks / row.impressions : 0 })),
    }, 200);
  });

  return app;
}
