// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// A post's Google Search Console numbers (PRD R12), for the admin and for
// agents choosing what to write or improve next (the hush-seo skill reads them
// here, never from Google). The window ends on the last day the import has, as
// Search Console lags two to three days; days without impressions are absent.
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { requireScope, type AuthVariables } from "../auth/tokens";
import type { Database } from "../db/client";
import { searchDaily, searchQueries } from "../db/schema";
import { getPost } from "../posts/service";
import { changeFrom, minimumImpressions, previousPeriod, searchMarkers, searchWindow, totalsOf } from "../search/analytics";
import { errorSchema, validationHook } from "./errors";

export const daySchema = z.object({
  date: z.iso.date().describe("Search Console's day, in US Pacific time"),
  impressions: z.number().int(),
  clicks: z.number().int(),
  position: z.number().describe("Average position, weighted by impressions"),
}).openapi("SearchDay");

export const totalsSchema = z.object({
  impressions: z.number().int(),
  clicks: z.number().int(),
  ctr: z.number().describe("Clicks per impression, 0 to 1"),
  position: z.number().nullable().describe("Average position over the window, weighted by impressions; null without impressions"),
}).openapi("SearchTotals");

const searchSchema = z.object({
  from: z.iso.date().nullable().describe("The first day counted: the requested start, or the first day the CMS has numbers for if that is later"),
  to: z.iso.date().nullable().describe("The last day Search Console has numbers for"),
  importedAt: z.iso.datetime().nullable().describe("When the CMS last read Search Console; null until the first import"),
  preliminaryFrom: z.iso.date().nullable().describe("The first day in the window Google was still counting at the last import: numbers from it on may still change. Null when all are final"),
  totals: totalsSchema,
  previous: z.object({ from: z.iso.date(), to: z.iso.date(), totals: totalsSchema }).nullable()
    .describe("The period of equal length just before; null when it reaches before the first day the CMS has numbers for"),
  change: z.object({
    impressions: z.number().nullable().describe("Relative change, -1 to …; null when the earlier period had none"),
    clicks: z.number().nullable(),
    ctrPoints: z.number().describe("Change in CTR, in percentage points"),
    position: z.number().nullable().describe("Change in average position, in ranks; negative is better"),
  }).nullable().describe(`Against the earlier period; null without one, or when either period has fewer than ${minimumImpressions} impressions`),
  days: z.array(daySchema),
  markers: z.array(z.object({
    date: z.iso.date().describe("The Search Console day (US Pacific) it happened on"),
    kind: z.enum(["published", "scheduled", "unpublished", "edited"]),
    changes: z.array(z.enum(["title", "description", "content"])).describe("For an edit: what it changed"),
    actor: z.string().nullable().describe("Who did it; null for a publication from before the audit log, whose time the post records but not who"),
  })).describe("When the post went live or changed in the window, to read its numbers against"),
}).openapi("PostSearch");

const querySchema = z.object({
  query: z.string(),
  impressions: z.number().int(),
  clicks: z.number().int(),
  ctr: z.number().describe("Clicks per impression, 0 to 1"),
  position: z.number().describe("Average position, weighted by impressions"),
  striking: z.boolean().describe("Within striking distance of the first page: average position 8 to 20"),
}).openapi("SearchQuery");

const queriesSchema = z.object({
  from: z.iso.date().nullable(),
  to: z.iso.date().nullable(),
  importedAt: z.iso.datetime().nullable(),
  queries: z.array(querySchema).describe("Most impressions first. Google leaves out rare queries to protect searchers' privacy, so these add up to less than the post's totals."),
}).openapi("PostSearchQueries");

/** A post's days in from..to, oldest first. */
function postDays(db: Database, id: string, from: string, to: string) {
  return db.select({ date: searchDaily.date, impressions: searchDaily.impressions, clicks: searchDaily.clicks, position: searchDaily.position })
    .from(searchDaily)
    .where(and(eq(searchDaily.postId, id), gte(searchDaily.date, from), lte(searchDaily.date, to)))
    .orderBy(asc(searchDaily.date));
}

const sinceSchema = z.iso.date().optional().describe("Start here instead of counting `days` back, such as the first of the year");

const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });

export function searchRoutes(db: Database) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({ defaultHook: validationHook });
  app.use("/v1/posts/:id/search", requireScope(db, "posts:read"));
  app.use("/v1/posts/:id/search/queries", requireScope(db, "posts:read"));

  app.openapi(createRoute({
    method: "get", path: "/v1/posts/{id}/search", operationId: "getPostSearch", tags: ["Posts"], security: [{ bearer: [] }],
    description: "The post's Google Search Console numbers: impressions, clicks and position per day and in total, over the last `days` days Search Console has (28 by default), or since a day. The CMS keeps every day it imported, also after Google drops it (16 months).",
    request: {
      params: z.object({ id: z.uuid() }),
      query: z.object({ days: z.coerce.number().int().min(1).max(3650).default(28), since: sinceSchema }),
    },
    responses: {
      200: json(searchSchema, "The post's search numbers"),
      401: json(errorSchema, "Missing or invalid token"),
      403: json(errorSchema, "The token lacks posts:read"),
      404: json(errorSchema, "No such post"),
      422: json(errorSchema, "Invalid query"),
    },
  }), async (context) => {
    const { id } = context.req.valid("param");
    const { days: span, since } = context.req.valid("query");
    await getPost(db, id);
    const { from, to, coverage, importedAt, preliminaryFrom } = await searchWindow(db, span, since);
    if (!from || !to || !coverage) {
      return context.json({ from, to, importedAt, preliminaryFrom, totals: totalsOf([]), previous: null, change: null, days: [], markers: [] }, 200);
    }
    const days = await postDays(db, id, from, to);
    const totals = totalsOf(days);
    const earlier = previousPeriod(from, to, coverage);
    const previous = earlier ? { ...earlier, totals: totalsOf(await postDays(db, id, earlier.from, earlier.to)) } : null;
    return context.json({
      from, to, importedAt, preliminaryFrom, totals, previous,
      change: changeFrom(totals, previous?.totals),
      days,
      markers: await searchMarkers(db, id, from, to),
    }, 200);
  });

  app.openapi(createRoute({
    method: "get", path: "/v1/posts/{id}/search/queries", operationId: "getPostSearchQueries", tags: ["Posts"], security: [{ bearer: [] }],
    description: "The Google searches the post was found for over the last `days` days Search Console has (28 by default), most impressions first.",
    request: {
      params: z.object({ id: z.uuid() }),
      query: z.object({
        days: z.coerce.number().int().min(1).max(3650).default(28),
        since: sinceSchema,
        limit: z.coerce.number().int().min(1).max(500).default(20),
      }),
    },
    responses: {
      200: json(queriesSchema, "The post's search queries"),
      401: json(errorSchema, "Missing or invalid token"),
      403: json(errorSchema, "The token lacks posts:read"),
      404: json(errorSchema, "No such post"),
      422: json(errorSchema, "Invalid query"),
    },
  }), async (context) => {
    const { id } = context.req.valid("param");
    const { days: span, since, limit } = context.req.valid("query");
    await getPost(db, id);
    const window = await searchWindow(db, span, since);
    if (!window.from || !window.to) return context.json({ from: window.from, to: window.to, importedAt: window.importedAt, queries: [] }, 200);
    const impressions = sql<number>`sum(${searchQueries.impressions})::int`;
    const rows = await db.select({
      query: searchQueries.query,
      impressions,
      clicks: sql<number>`sum(${searchQueries.clicks})::int`,
      position: sql<number>`sum(${searchQueries.position} * ${searchQueries.impressions}) / nullif(sum(${searchQueries.impressions}), 0)`,
    }).from(searchQueries)
      .where(and(eq(searchQueries.postId, id), gte(searchQueries.date, window.from), lte(searchQueries.date, window.to)))
      .groupBy(searchQueries.query)
      .orderBy(desc(impressions), asc(searchQueries.query))
      .limit(limit);
    return context.json({
      from: window.from, to: window.to, importedAt: window.importedAt,
      queries: rows.map((row) => {
        const position = Number(row.position ?? 0);
        return { ...row, position, ctr: row.impressions ? row.clicks / row.impressions : 0, striking: position >= 8 && position <= 20 };
      }),
    }, 200);
  });

  return app;
}
