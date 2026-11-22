// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// A post's Google Search Console numbers (PRD R12), for the admin and for
// agents choosing what to write or improve next (the hush-seo skill reads them
// here, never from Google). The window ends on the last day the import has, as
// Search Console lags two to three days; days without impressions are absent.
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { requireScope, type AuthVariables } from "../auth/tokens";
import type { Database } from "../db/client";
import { searchDaily } from "../db/schema";
import { getPost } from "../posts/service";
import { readSearchState } from "../search/import";
import { errorSchema, validationHook } from "./errors";

const daySchema = z.object({
  date: z.iso.date().describe("Search Console's day, in US Pacific time"),
  impressions: z.number().int(),
  clicks: z.number().int(),
  position: z.number().describe("Average position, weighted by impressions"),
}).openapi("SearchDay");

const searchSchema = z.object({
  from: z.iso.date().nullable(),
  to: z.iso.date().nullable().describe("The last day Search Console has numbers for"),
  importedAt: z.iso.datetime().nullable().describe("When the CMS last read Search Console; null until the first import"),
  totals: z.object({
    impressions: z.number().int(),
    clicks: z.number().int(),
    ctr: z.number().describe("Clicks per impression, 0 to 1"),
    position: z.number().nullable().describe("Average position over the window, weighted by impressions; null without impressions"),
  }),
  days: z.array(daySchema),
}).openapi("PostSearch");

const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });

export function searchRoutes(db: Database) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({ defaultHook: validationHook });
  app.use("/v1/posts/:id/search", requireScope(db, "posts:read"));

  app.openapi(createRoute({
    method: "get", path: "/v1/posts/{id}/search", operationId: "getPostSearch", tags: ["Posts"], security: [{ bearer: [] }],
    description: "The post's Google Search Console numbers: impressions, clicks and position per day and in total, over the last `days` days Search Console has (28 by default).",
    request: {
      params: z.object({ id: z.uuid() }),
      query: z.object({ days: z.coerce.number().int().min(1).max(486).default(28) }),
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
    const { days: span } = context.req.valid("query");
    await getPost(db, id);
    const state = await readSearchState(db);
    const to = state?.importedThrough ?? null;
    const from = to ? new Date(Date.parse(to) - (span - 1) * 86_400_000).toISOString().slice(0, 10) : null;
    const days = to && from
      ? await db.select({ date: searchDaily.date, impressions: searchDaily.impressions, clicks: searchDaily.clicks, position: searchDaily.position })
        .from(searchDaily)
        .where(and(eq(searchDaily.postId, id), gte(searchDaily.date, from), lte(searchDaily.date, to)))
        .orderBy(asc(searchDaily.date))
      : [];
    const impressions = days.reduce((sum, day) => sum + day.impressions, 0);
    const clicks = days.reduce((sum, day) => sum + day.clicks, 0);
    const weighted = days.reduce((sum, day) => sum + day.position * day.impressions, 0);
    return context.json({
      from, to,
      importedAt: state?.importedAt?.toISOString() ?? null,
      totals: { impressions, clicks, ctr: impressions ? clicks / impressions : 0, position: impressions ? weighted / impressions : null },
      days,
    }, 200);
  });

  return app;
}
