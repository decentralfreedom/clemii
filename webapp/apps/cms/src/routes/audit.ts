// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The audit log (PRD R13) for the admin's History, the owner's only. It grows
// forever, so it is read a page at a time, newest first: the cursor is the id
// of the previous page's last entry, which stays stable while new entries come.
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { listAudit } from "../audit/log";
import { requireOwner, type AuthVariables } from "../auth/tokens";
import type { Database } from "../db/client";
import { auditAction } from "../db/schema";
import { errorSchema, validationHook } from "./errors";

const entrySchema = z.object({
  id: z.uuid(),
  at: z.iso.datetime(),
  action: z.enum(auditAction.enumValues),
  actor: z.string().describe("github:<login> for the owner, token:<name> for a token, or scheduler, import, cms:token for the CMS itself"),
  actorTokenId: z.uuid().nullable().describe("The token that made the change; tells two tokens of one name apart"),
  postId: z.uuid().nullable(),
  tokenId: z.uuid().nullable(),
  revisionId: z.uuid().nullable().describe("The revision the change saved, to see what it changed"),
  subject: z.string().describe("The post's title or the token's name at that moment"),
}).openapi("AuditEntry");

const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });

export function auditRoutes(db: Database) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({ defaultHook: validationHook });
  app.use("/v1/audit", requireOwner(db));

  app.openapi(createRoute({
    method: "get", path: "/v1/audit", operationId: "listAudit", tags: ["Access"], security: [{ bearer: [] }],
    description: "Who or which token changed what, and when: newest first, a page at a time. The owner only.",
    request: {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        cursor: z.uuid().optional().describe("nextCursor of the previous page"),
        postId: z.uuid().optional().describe("Only the entries about this post"),
        area: z.enum(["posts", "access"]).optional().describe("posts: changes to posts; access: tokens, CLI sign-ins and the owner's sign-ins"),
      }),
    },
    responses: {
      200: json(z.object({ entries: z.array(entrySchema), nextCursor: z.string().nullable() }), "A page of the log"),
      401: json(errorSchema, "Not signed in"),
      403: json(errorSchema, "Not the owner"),
      400: json(errorSchema, "Invalid query"),
    },
  }), async (context) => {
    const { limit, cursor, postId, area } = context.req.valid("query");
    const rows = await listAudit(db, { limit: limit + 1, postId, area, before: cursor });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return context.json({
      entries: page.map((row) => ({
        id: row.id, at: row.at.toISOString(), action: row.action, actor: row.actor, actorTokenId: row.actorTokenId,
        postId: row.postId, tokenId: row.tokenId, revisionId: row.revisionId, subject: row.subject,
      })),
      nextCursor: rows.length > limit && last ? last.id : null,
    }, 200);
  });

  return app;
}
