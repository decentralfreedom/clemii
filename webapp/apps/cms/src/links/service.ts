// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Tracked links (PRD: tracked links): the links we share, tagged from a fixed
// list so the traffic sources stay clean. Where a link is shared decides its
// utm_source and utm_medium; the campaign and the optional content are short
// lowercase words. The tags are those the website keeps (apps/web
// shared/campaign.ts) and the CMS turns into channels (traffic/channels.ts).
import { and, eq, isNull } from "drizzle-orm";
import type { Actor } from "../auth/tokens";
import { recordAudit } from "../audit/log";
import type { Database } from "../db/client";
import { trackedLinks } from "../db/schema";
import { PostError } from "../posts/errors";
import { pagePathOf, postPathIndex } from "../posts/paths";

/** Where a link can be shared, and the tags that follow from it. */
export const sharedOn = {
  reddit: { source: "reddit", medium: "social" },
  linkedin: { source: "linkedin", medium: "social" },
  x: { source: "x", medium: "social" },
  hackernews: { source: "hackernews", medium: "social" },
  bluesky: { source: "bluesky", medium: "social" },
  youtube: { source: "youtube", medium: "social" },
  newsletter: { source: "newsletter", medium: "email" },
  email: { source: "email", medium: "email" },
  // A creator's or partner's own name becomes the source.
  creator: { source: undefined, medium: "social" },
  partner: { source: undefined, medium: "referral" },
  ad: { source: undefined, medium: "cpc" },
} as const;
export type SharedOn = keyof typeof sharedOn;

/** Lowercase words joined by hyphens, as tags are compared: "Launch" and "launch" would split one campaign in two. */
export const tagPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type NewLink = { name: string; path: string; sharedOn: SharedOn; who?: string; campaign: string; content?: string };

/** The query a link carries, in the order the builder shows them. */
export function linkQuery(link: { source: string; medium: string; campaign: string; content: string }) {
  const query = new URLSearchParams({ utm_source: link.source, utm_medium: link.medium, utm_campaign: link.campaign });
  if (link.content) query.set("utm_content", link.content);
  return `?${query}`;
}

export async function createLink(db: Database, input: NewLink, actor: Actor) {
  // A path on our website only: an address elsewhere would lose its host here and point somewhere else.
  const path = /^\/(?!\/)/.test(input.path.trim()) ? pagePathOf(input.path.trim()) : undefined;
  if (!path) throw new PostError(422, "invalid_link", "The destination must be a path on the website, e.g. /blog/<slug>.");
  const preset = sharedOn[input.sharedOn];
  const who = input.who?.trim().toLowerCase();
  if (preset.source === undefined && !(who && tagPattern.test(who))) {
    throw new PostError(422, "invalid_link", `A link for ${input.sharedOn} names who shares it: lowercase words joined by hyphens, e.g. creator-anna.`);
  }
  const campaign = input.campaign.trim().toLowerCase();
  const content = input.content?.trim().toLowerCase() ?? "";
  for (const [label, value] of [["campaign", campaign], ["content", content]] as const) {
    if (value && !tagPattern.test(value)) throw new PostError(422, "invalid_link", `The ${label} must be lowercase words joined by hyphens, e.g. launch-2026-12.`);
  }
  const postId = (await postPathIndex(db)).get(path) ?? null;
  const row = { name: input.name.trim(), path, postId, sharedOn: input.sharedOn, source: preset.source ?? who!, medium: preset.medium, campaign, content, createdBy: actor.name };
  const duplicate = () => new PostError(409, "link_exists", "A link with these tags to this page exists already: share that one, or set a different content tag.");
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: trackedLinks.id }).from(trackedLinks).where(and(
      eq(trackedLinks.path, path), eq(trackedLinks.source, row.source), eq(trackedLinks.medium, row.medium),
      eq(trackedLinks.campaign, campaign), eq(trackedLinks.content, content),
    ));
    if (existing) throw duplicate();
    const [link] = await tx.insert(trackedLinks).values(row).returning().catch((error: unknown) => {
      // Two requests at once: the unique index decides, with the same answer.
      const code = (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
      throw code === "23505" ? duplicate() : error;
    });
    await recordAudit(tx, actor, "link.created", { subject: `${row.name} (${path}${linkQuery(row)})`, postId: postId ?? undefined });
    return link!;
  });
}

/** Archives a link: it stays in the numbers, but is no longer offered. */
export async function archiveLink(db: Database, id: string, actor: Actor) {
  return db.transaction(async (tx) => {
    const [link] = await tx.update(trackedLinks).set({ archivedAt: new Date() })
      .where(and(eq(trackedLinks.id, id), isNull(trackedLinks.archivedAt))).returning();
    if (!link) throw new PostError(404, "link_not_found", "No such link, or it is archived already.");
    await recordAudit(tx, actor, "link.archived", { subject: `${link.name} (${link.path}${linkQuery(link)})`, postId: link.postId ?? undefined });
    return link;
  });
}
