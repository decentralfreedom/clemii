// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Page views and downloads from Umami (PRD R11), per post and for the whole
// site, over the last `days` complete days the CMS has, or since a day: the
// visit and download steps of the funnel after Google's impressions and
// clicks. Page views count every visit, not only those from Google, and only
// visitors who did not ask not to be tracked (DNT, GPC).
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { requireScope, type AuthVariables } from "../auth/tokens";
import type { Database } from "../db/client";
import { trafficDaily, trafficSiteDaily } from "../db/schema";
import { getPost } from "../posts/service";
import { clampedStart } from "../search/analytics";
import { readTrafficState } from "../traffic/import";
import { errorSchema, validationHook } from "./errors";

const trafficDaySchema = z.object({
  date: z.iso.date().describe("A US Pacific day, as Search Console's"),
  pageviews: z.number().int(),
  downloads: z.number().int().describe("Downloads started from these pages"),
}).openapi("TrafficDay");

const trafficSchema = z.object({
  from: z.iso.date().nullable().describe("The first day in the window; null until the first import"),
  to: z.iso.date().nullable().describe("The last complete day imported"),
  importedAt: z.iso.datetime().nullable(),
  totals: z.object({ pageviews: z.number().int(), downloads: z.number().int() }),
  days: z.array(trafficDaySchema).describe("Only days with numbers; a day in the window without one had none"),
}).openapi("Traffic");

const rangeQuery = z.object({
  days: z.coerce.number().int().min(1).max(3650).default(28),
  since: z.iso.date().optional(),
});

const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });

async function trafficWindow(db: Database, span: number, since?: string) {
  const state = await readTrafficState(db);
  const to = state?.importedThrough ?? null;
  const coverage = state?.importedFrom ?? null;
  const importedAt = state?.importedAt?.toISOString() ?? null;
  if (!to || !coverage) return { from: null, to: null, importedAt };
  return { from: clampedStart(coverage, to, span, since), to, importedAt };
}

const totalsOf = (days: Array<{ pageviews: number; downloads: number }>) =>
  days.reduce((sum, day) => ({ pageviews: sum.pageviews + day.pageviews, downloads: sum.downloads + day.downloads }), { pageviews: 0, downloads: 0 });

export function trafficRoutes(db: Database) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({ defaultHook: validationHook });
  app.use("/v1/traffic", requireScope(db, "posts:read"));
  app.use("/v1/posts/:id/traffic", requireScope(db, "posts:read"));
  const errors = {
    401: json(errorSchema, "Missing or invalid token"),
    403: json(errorSchema, "The token lacks posts:read"),
    422: json(errorSchema, "Invalid query"),
  };

  app.openapi(createRoute({
    method: "get", path: "/v1/posts/{id}/traffic", operationId: "getPostTraffic", tags: ["Posts"], security: [{ bearer: [] }],
    description: "A post's page views and downloads from Umami, per US Pacific day, at every address the post has had.",
    request: { params: z.object({ id: z.uuid() }), query: rangeQuery },
    responses: { 200: json(trafficSchema, "The post's traffic"), 404: json(errorSchema, "No such post"), ...errors },
  }), async (context) => {
    const { id } = context.req.valid("param");
    const { days: span, since } = context.req.valid("query");
    await getPost(db, id);
    const { from, to, importedAt } = await trafficWindow(db, span, since);
    if (!from || !to) return context.json({ from, to, importedAt, totals: totalsOf([]), days: [] }, 200);
    const days = await db.select({ date: trafficDaily.date, pageviews: trafficDaily.pageviews, downloads: trafficDaily.downloads })
      .from(trafficDaily).where(and(eq(trafficDaily.postId, id), gte(trafficDaily.date, from), lte(trafficDaily.date, to)))
      .orderBy(asc(trafficDaily.date));
    return context.json({ from, to, importedAt, totals: totalsOf(days), days }, 200);
  });

  app.openapi(createRoute({
    method: "get", path: "/v1/traffic", operationId: "getSiteTraffic", tags: ["Posts"], security: [{ bearer: [] }],
    description: "The whole site's page views and downloads from Umami, per US Pacific day: every page, the home and release pages too.",
    request: { query: rangeQuery },
    responses: { 200: json(trafficSchema, "The site's traffic"), ...errors },
  }), async (context) => {
    const { days: span, since } = context.req.valid("query");
    const { from, to, importedAt } = await trafficWindow(db, span, since);
    if (!from || !to) return context.json({ from, to, importedAt, totals: totalsOf([]), days: [] }, 200);
    const days = await db.select({ date: trafficSiteDaily.date, pageviews: trafficSiteDaily.pageviews, downloads: trafficSiteDaily.downloads })
      .from(trafficSiteDaily).where(and(gte(trafficSiteDaily.date, from), lte(trafficSiteDaily.date, to)))
      .orderBy(asc(trafficSiteDaily.date));
    return context.json({ from, to, importedAt, totals: totalsOf(days), days }, 200);
  });

  return app;
}
