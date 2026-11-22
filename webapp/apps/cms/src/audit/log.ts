// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The audit log (PRD R13): who or which token changed what, and when. Every
// change writes its entry in its own transaction, so an entry exists exactly
// when the change does. Reads go only to the owner (routes/audit.ts).
import { and, desc, eq, sql } from "drizzle-orm";
import type { Actor } from "../auth/tokens";
import type { Database } from "../db/client";
import { auditLog } from "../db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type AuditAction = (typeof auditLog.$inferInsert)["action"];
export type AuditEntry = typeof auditLog.$inferSelect;

/** What a change touched: a post or a token by id, named as it is now. */
export type AuditTarget = { subject: string; postId?: string; tokenId?: string; revisionId?: string };

export async function recordAudit(tx: Transaction | Database, actor: Actor, action: AuditAction, target: AuditTarget) {
  await tx.insert(auditLog).values({
    action, actor: actor.name, actorTokenId: actor.tokenId, actorGithubUserId: actor.githubUserId, ...target,
  });
}

export async function recordAudits(tx: Transaction, actor: Actor, action: AuditAction, targets: AuditTarget[]) {
  if (!targets.length) return;
  await tx.insert(auditLog).values(targets.map((target) => ({
    action, actor: actor.name, actorTokenId: actor.tokenId, actorGithubUserId: actor.githubUserId, ...target,
  })));
}

/**
 * A page of the log, newest first. `before` is the id of the previous page's
 * last entry; the comparison runs in the database, at its full timestamp
 * precision, so no entry is skipped or repeated.
 */
export async function listAudit(db: Database, options: { limit: number; before?: string; postId?: string; area?: "posts" | "access" }) {
  const { before, postId, area } = options;
  return db.select().from(auditLog)
    .where(and(
      postId ? eq(auditLog.postId, postId) : undefined,
      // Posts are post.*; access is tokens, CLI sign-ins and the owner's sign-ins.
      // Tracked links are content work, beside posts; access is tokens, devices and sign-ins.
      area === "posts" ? sql`(${auditLog.action}::text like 'post.%' or ${auditLog.action}::text like 'link.%')` : undefined,
      area === "access" ? sql`${auditLog.action}::text not like 'post.%' and ${auditLog.action}::text not like 'link.%'` : undefined,
      before ? sql`(${auditLog.at}, ${auditLog.id}) < (select at, id from audit_log where id = ${before})` : undefined,
    ))
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(options.limit);
}
