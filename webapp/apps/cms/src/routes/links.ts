// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Tracked links (PRD: tracked links): make a link with campaign tags for a
// place it will be shared, list the links with their page views and tagged
// downloads, and archive one. Reading needs posts:read, changing posts:write.
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, desc, gte, isNull, lte, sql } from "drizzle-orm";
import { requireScope, type AuthVariables } from "../auth/tokens";
import type { Database } from "../db/client";
import { trackedLinks, trafficSourceDaily } from "../db/schema";
import { archiveLink, createLink, linkQuery, sharedOn, tagPattern, type SharedOn } from "../links/service";
import { clampedStart } from "../search/analytics";
import { readTrafficState } from "../traffic/import";
import { errorSchema, validationHook } from "./errors";

const sharedOnValues = Object.keys(sharedOn) as [SharedOn, ...SharedOn[]];

const linkSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  path: z.string(),
  postId: z.uuid().nullable(),
  sharedOn: z.enum(sharedOnValues),
  source: z.string(), medium: z.string(), campaign: z.string(), content: z.string(),
  query: z.string().describe("The tags to append to the page's address, starting with ?"),
  url: z.string().nullable().describe("The whole link to share; null when the CMS does not know the website's address (CMS_SITE_URL)"),
  createdAt: z.iso.datetime(),
  createdBy: z.string(),
  archivedAt: z.iso.datetime().nullable(),
  pageviews: z.number().int().describe("Page views through this link on its page, in the window"),
  downloads: z.number().int().describe("Downloads through this link, in the window"),
}).openapi("TrackedLink");

const newLinkSchema = z.object({
  name: z.string().trim().min(1).max(120).describe("What the link is for, e.g. \"r/macapps launch post\""),
  path: z.string().min(1).max(300).describe("The destination's path on the website"),
  sharedOn: z.enum(sharedOnValues),
  who: z.string().max(60).optional().describe("For creator, partner and ad: their name as lowercase words joined by hyphens"),
  campaign: z.string().max(60).regex(tagPattern, "lowercase words joined by hyphens"),
  content: z.string().max(60).regex(tagPattern, "lowercase words joined by hyphens").optional(),
}).openapi("NewTrackedLink");

const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });

export function linksRoutes(db: Database, siteUrl?: string) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({ defaultHook: validationHook });
  app.use("/v1/links", async (context, next) => requireScope(db, context.req.method === "GET" ? "posts:read" : "posts:write")(context, next));
  app.use("/v1/links/:id", requireScope(db, "posts:write"));
  const errors = { 401: json(errorSchema, "Missing or invalid token"), 403: json(errorSchema, "The token lacks the scope"), 400: json(errorSchema, "Invalid request") };
  const present = (link: typeof trackedLinks.$inferSelect, stats = { pageviews: 0, downloads: 0 }) => ({
    ...link, sharedOn: link.sharedOn as SharedOn, query: linkQuery(link), url: siteUrl ? `${new URL(link.path, siteUrl)}${linkQuery(link)}` : null,
    createdAt: link.createdAt.toISOString(), archivedAt: link.archivedAt?.toISOString() ?? null, ...stats,
  });

  app.openapi(createRoute({
    method: "get", path: "/v1/links", operationId: "listLinks", tags: ["Links"], security: [{ bearer: [] }],
    description: "Tracked links, newest first, with their page views and tagged downloads over the last `days` complete days the CMS has, or since a day.",
    request: { query: z.object({
      days: z.coerce.number().int().min(1).max(3650).default(28), since: z.iso.date().optional(),
      archived: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    }) },
    responses: { 200: json(z.object({ from: z.iso.date().nullable(), to: z.iso.date().nullable(), links: z.array(linkSchema) }).openapi("TrackedLinks"), "The links"), ...errors },
  }), async (context) => {
    const { days: span, since, archived } = context.req.valid("query");
    const links = await db.select().from(trackedLinks).where(archived ? undefined : isNull(trackedLinks.archivedAt)).orderBy(desc(trackedLinks.createdAt), asc(trackedLinks.name));
    const state = await readTrafficState(db);
    const to = state?.importedThrough ?? null;
    const from = to && state?.importedFrom ? clampedStart(state.importedFrom, to, span, since) : null;
    const t = trafficSourceDaily;
    const stats = from && to ? await db.select({
      path: t.path, source: t.source, medium: t.medium, campaign: t.campaign, content: t.content,
      pageviews: sql<number>`sum(${t.pageviews})::int`, downloads: sql<number>`sum(${t.downloads})::int`,
    }).from(t).where(and(gte(t.date, from), lte(t.date, to))).groupBy(t.path, t.source, t.medium, t.campaign, t.content) : [];
    const key = (row: { path: string; source: string; medium: string; campaign: string; content: string }) => [row.path, row.source, row.medium, row.campaign, row.content].join("\n");
    const byKey = new Map(stats.map((row) => [key(row), row]));
    return context.json({ from, to, links: links.map((link) => {
      const row = byKey.get(key(link));
      return present(link, { pageviews: row?.pageviews ?? 0, downloads: row?.downloads ?? 0 });
    }) }, 200);
  });

  app.openapi(createRoute({
    method: "post", path: "/v1/links", operationId: "createLink", tags: ["Links"], security: [{ bearer: [] }],
    description: "Makes a tracked link: where it is shared decides utm_source and utm_medium (creator, partner and ad add `who` as the source); the campaign and optional content are lowercase words joined by hyphens. A link with the same page and tags exists only once.",
    request: { body: { content: { "application/json": { schema: newLinkSchema } }, required: true } },
    responses: { 201: json(linkSchema, "The link"), 409: json(errorSchema, "A link with these tags to this page exists"), 422: json(errorSchema, "Not a valid link"), ...errors },
  }), async (context) => {
    const link = await createLink(db, context.req.valid("json"), context.get("actor"));
    return context.json(present(link), 201);
  });

  app.openapi(createRoute({
    method: "delete", path: "/v1/links/{id}", operationId: "archiveLink", tags: ["Links"], security: [{ bearer: [] }],
    description: "Archives a link: its numbers stay, but it is no longer listed.",
    request: { params: z.object({ id: z.uuid() }) },
    responses: { 200: json(linkSchema, "The archived link"), 404: json(errorSchema, "No such link"), ...errors },
  }), async (context) => {
    const link = await archiveLink(db, context.req.valid("param").id, context.get("actor"));
    return context.json(present(link), 200);
  });

  return app;
}
