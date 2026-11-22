// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// What a post's analytics page shows beside its numbers, worked out here once
// for the admin, the CLI and agents: the change against the period before,
// and the days the post went live or changed. Every comparison is only as
// valid as its data: it is given only when the earlier period lies wholly in
// the days the CMS has numbers for and both periods hold enough impressions
// to mean something; otherwise it is null, never a guess.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { readSearchState } from "./import";
import { auditLog, postRevisions, posts } from "../db/schema";

const dayMs = 86_400_000;
/** Below this many impressions in either period, a change is noise and is not reported. */
export const minimumImpressions = 100;

export type SearchTotals = { impressions: number; clicks: number; ctr: number; position: number | null };
type Day = { impressions: number; clicks: number; position: number };

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Days summed, the position weighted by impressions and the CTR from the sums, never averaged per day. */
export function totalsOf(days: Day[]): SearchTotals {
  const impressions = days.reduce((sum, day) => sum + day.impressions, 0);
  const clicks = days.reduce((sum, day) => sum + day.clicks, 0);
  const weighted = days.reduce((sum, day) => sum + day.position * day.impressions, 0);
  return { impressions, clicks, ctr: impressions ? clicks / impressions : 0, position: impressions ? weighted / impressions : null };
}

/** The period of equal length just before from..to, or undefined when it reaches before the first day the CMS has. */
export function previousPeriod(from: string, to: string, coverage: string) {
  const length = Math.round((Date.parse(to) - Date.parse(from)) / dayMs) + 1;
  const end = Date.parse(from) - dayMs;
  const start = end - (length - 1) * dayMs;
  return isoDay(start) >= coverage ? { from: isoDay(start), to: isoDay(end) } : undefined;
}

/**
 * The change from the earlier period: impressions and clicks in percent (null
 * when the earlier one had none), CTR in percentage points, position in ranks
 * (negative is better). Null when there is no valid earlier period or either
 * period has fewer than `minimumImpressions`.
 */
export function changeFrom(current: SearchTotals, previous: SearchTotals | undefined) {
  if (!previous || current.impressions < minimumImpressions || previous.impressions < minimumImpressions) return null;
  const percent = (now: number, before: number) => (before ? (now - before) / before : null);
  return {
    impressions: percent(current.impressions, previous.impressions),
    clicks: percent(current.clicks, previous.clicks),
    ctrPoints: (current.ctr - previous.ctr) * 100,
    position: current.position !== null && previous.position !== null ? current.position - previous.position : null,
  };
}

/** The Search Console day (US Pacific) a moment falls on, so markers line up with Google's days. */
export const pacificDay = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

const watched = ["title", "description", "markdown"] as const;
const changeNames: Record<(typeof watched)[number], "title" | "description" | "content"> = { title: "title", description: "description", markdown: "content" };

/**
 * The days a post went live, was scheduled or taken down, or had its title,
 * description or content changed, from the audit log; an edit counts only
 * when its revision changed one of those against the revision before it. A
 * publication older than the audit log still shows, from the post's own
 * publication time, with no actor: the CMS knows when, not who.
 */
export async function searchMarkers(db: Database, postId: string, from: string, to: string) {
  const entries = await db.select({ action: auditLog.action, at: auditLog.at, revisionId: auditLog.revisionId, actor: auditLog.actor })
    .from(auditLog)
    .where(and(eq(auditLog.postId, postId), inArray(auditLog.action, ["post.published", "post.scheduled", "post.unpublished", "post.edited"])))
    .orderBy(asc(auditLog.at), asc(auditLog.id));
  const revisions = await db.select({ id: postRevisions.id, snapshot: postRevisions.snapshot })
    .from(postRevisions).where(eq(postRevisions.postId, postId))
    .orderBy(asc(postRevisions.createdAt), asc(postRevisions.id));
  const position = new Map(revisions.map((revision, index) => [revision.id, index]));

  const markers: Array<{ date: string; kind: "published" | "scheduled" | "unpublished" | "edited"; changes: Array<"title" | "description" | "content">; actor: string | null }> = [];
  for (const entry of entries) {
    const date = pacificDay(entry.at);
    if (date < from || date > to) continue;
    const kind = entry.action.slice("post.".length) as (typeof markers)[number]["kind"];
    if (kind !== "edited") { markers.push({ date, kind, changes: [], actor: entry.actor }); continue; }
    const index = entry.revisionId ? position.get(entry.revisionId) : undefined;
    if (index === undefined || index === 0) continue;
    const now = revisions[index]!.snapshot as Record<string, unknown>;
    const before = revisions[index - 1]!.snapshot as Record<string, unknown>;
    const changes = watched.filter((field) => now[field] !== before[field]).map((field) => changeNames[field]);
    if (changes.length) markers.push({ date, kind, changes, actor: entry.actor });
  }
  const [post] = await db.select({ publishedAt: posts.publishedAt, status: posts.status }).from(posts).where(eq(posts.id, postId));
  const published = post?.status === "published" && post.publishedAt ? pacificDay(post.publishedAt) : undefined;
  if (published && published >= from && published <= to && !markers.some((marker) => marker.kind === "published" && marker.date === published)) {
    markers.push({ date: published, kind: "published", changes: [], actor: null });
    markers.sort((a, b) => a.date.localeCompare(b.date));
  }
  return markers;
}

/**
 * The window ending on the last day Search Console has: from `since` when
 * given (as Ghost's "Year to date" and "All time"), else the last `span` days,
 * but never before the first day the CMS has numbers for. Inside it a day
 * without a row had no impressions; before it there are no numbers at all.
 */
export async function searchWindow(db: Database, span: number, since?: string) {
  const state = await readSearchState(db);
  const to = state?.importedThrough ?? null;
  const coverage = state?.importedFrom ?? to;
  if (!to || !coverage) return { from: null, to: null, coverage: null, importedAt: state?.importedAt?.toISOString() ?? null };
  const wanted = since ?? new Date(Date.parse(to) - (span - 1) * 86_400_000).toISOString().slice(0, 10);
  // Never before the first day the CMS has numbers for, and never after the last.
  const start = wanted > coverage ? wanted : coverage;
  const from = start < to ? start : to;
  return { from, to, coverage, importedAt: state?.importedAt?.toISOString() ?? null };
}
