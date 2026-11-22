// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Goals (PRD: the Goals tab, AI-native goals). An agent proposes objectives
// with key results chosen from the catalog: the metrics the CMS can compute
// exactly and the values that occur in its data. The CMS checks every choice,
// reads the baseline from the data, and keeps the proposal as a draft until
// the owner approves it. No number in a goal comes from the proposer.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Caller } from "../auth/tokens";
import { recordAudit } from "../audit/log";
import type { Database } from "../db/client";
import { goalKeyResults, goalObjectives, posts, trackedLinks, trafficSourceDaily } from "../db/schema";
import { PostError } from "../posts/errors";
import { blogPathOf } from "./paths";
import { daysIn, measure, metrics, progressOf, quarterRange, ScopeError, sourceOf, type Metric, type Scope } from "./metrics";
import { readSearchState } from "../search/import";
import { readTrafficState } from "../traffic/import";

export type NewKeyResult = { title: string; kind: "measured" | "manual"; metric?: Metric; scope?: Scope; target: number };
export type NewObjective = { quarter: string; title: string; keyResults: NewKeyResult[] };

const metricInfo: Record<Metric, { label: string; source: string; scopes: string; note?: string }> = {
  impressions: { label: "Google impressions", source: "Google Search Console", scopes: "site or a post" },
  clicks: { label: "Google clicks", source: "Google Search Console", scopes: "site or a post" },
  ctr: { label: "Google click-through rate", source: "Google Search Console", scopes: "site or a post", note: "A share from 0 to 1" },
  position: { label: "Google average position", source: "Google Search Console", scopes: "site or a post", note: "Lower is better" },
  pageviews: { label: "Page views", source: "Umami", scopes: "site, a post, a page type, a channel, a source or a campaign" },
  downloads: { label: "Downloads", source: "Umami", scopes: "site or a post; by channel, source or campaign through tagged links only" },
  conversion: { label: "Downloads per page view", source: "Umami", scopes: "site or a post", note: "A share from 0 to 1" },
};

/** What a key result may measure and the values that occur in the data: nothing outside it can be referenced. */
export async function catalog(db: Database) {
  const [search, traffic] = await Promise.all([readSearchState(db), readTrafficState(db)]);
  const t = trafficSourceDaily;
  const distinct = async (column: typeof t.channel | typeof t.pageType | typeof t.source | typeof t.campaign) =>
    (await db.selectDistinct({ value: column }).from(t).where(sql`${column} <> ''`).orderBy(asc(column)).limit(500)).map((row) => row.value);
  const [channels, pageTypes, sources, campaigns, links, published] = await Promise.all([
    distinct(t.channel), distinct(t.pageType), distinct(t.source), distinct(t.campaign),
    db.select({ source: trackedLinks.source, campaign: trackedLinks.campaign }).from(trackedLinks),
    db.select({ id: posts.id, title: posts.title, lang: posts.lang, slug: posts.slug }).from(posts).where(eq(posts.status, "published")).orderBy(asc(posts.title)),
  ]);
  const union = (data: string[], extra: string[]) => [...new Set([...data, ...extra])].sort();
  return {
    metrics: metrics.map((name) => ({ name, ...metricInfo[name] })),
    posts: published.map((post) => ({ id: post.id, title: post.title, path: blogPathOf(post.lang, post.slug) })),
    pageTypes, channels,
    // A tracked link's tags count before its first visit, so a goal can be set for it.
    sources: union(sources, links.map((link) => link.source)),
    campaigns: union(campaigns, links.map((link) => link.campaign)),
    coverage: {
      search: search?.importedFrom && search.importedThrough ? { from: search.importedFrom, to: search.importedThrough } : null,
      traffic: traffic?.importedFrom && traffic.importedThrough ? { from: traffic.importedFrom, to: traffic.importedThrough } : null,
    },
  };
}

type Catalog = Awaited<ReturnType<typeof catalog>>;

/** Refuses a key result that names anything the catalog does not have, with a reason the proposer can act on. */
function check(keyResult: NewKeyResult, known: Catalog, index: number) {
  const where = `Key result ${index + 1}`;
  if (keyResult.kind === "manual") {
    if (keyResult.metric || (keyResult.scope && Object.keys(keyResult.scope).length)) throw new PostError(422, "invalid_goal", `${where} is manual: it has no metric or scope.`);
    return;
  }
  if (!keyResult.metric) throw new PostError(422, "invalid_goal", `${where} needs a metric from the catalog.`);
  const scope = keyResult.scope ?? {};
  const allowed: Record<keyof Scope, string[]> = {
    postId: known.posts.map((post) => post.id), pageType: known.pageTypes, channel: known.channels, source: known.sources, campaign: known.campaigns,
  };
  for (const [key, value] of Object.entries(scope)) {
    if (!(key in allowed)) throw new PostError(422, "invalid_goal", `${where}: ${key} is not a scope; use ${Object.keys(allowed).join(", ")}.`);
    if (!allowed[key as keyof Scope].includes(value)) throw new PostError(422, "invalid_goal", `${where}: ${key} "${value}" does not occur in the CMS's data; pick one from the catalog.`);
  }
  try {
    sourceOf(keyResult.metric, scope);
  } catch (error) {
    if (error instanceof ScopeError) throw new PostError(422, "invalid_goal", `${where}: ${error.message}`);
    throw error;
  }
}

/** The metric over the period of equal length before, only when the CMS has all of it. */
async function baselineOf(db: Database, metric: Metric, scope: Scope, period: { from: string; to: string }) {
  const length = daysIn(period.from, period.to);
  const to = new Date(Date.parse(period.from) - 86_400_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(to) - (length - 1) * 86_400_000).toISOString().slice(0, 10);
  const measured = await measure(db, metric, scope, from, to);
  return measured.from === from && measured.to === to ? measured.value : null;
}

/** An agent's objective waits as a draft for the owner; the owner's own is active at once. */
export async function proposeObjective(db: Database, input: NewObjective, caller: Caller) {
  const period = (() => { try { return quarterRange(input.quarter); } catch (error) { throw new PostError(422, "invalid_goal", (error as Error).message); } })();
  if (!input.keyResults.length || input.keyResults.length > 5) throw new PostError(422, "invalid_goal", "An objective has one to five key results.");
  const known = await catalog(db);
  input.keyResults.forEach((keyResult, index) => check(keyResult, known, index));
  const baselines = await Promise.all(input.keyResults.map((keyResult) =>
    keyResult.kind === "measured" ? baselineOf(db, keyResult.metric!, keyResult.scope ?? {}, period) : Promise.resolve(null)));
  return db.transaction(async (tx) => {
    const active = caller.owner;
    const [objective] = await tx.insert(goalObjectives).values({
      quarter: input.quarter, title: input.title.trim(), status: active ? "active" : "draft", createdBy: caller.actor.name,
      ...(active ? { approvedBy: caller.actor.name, approvedAt: new Date() } : {}),
    }).returning();
    await tx.insert(goalKeyResults).values(input.keyResults.map((keyResult, position) => ({
      objectiveId: objective!.id, position, title: keyResult.title.trim(), kind: keyResult.kind,
      metric: keyResult.kind === "measured" ? keyResult.metric! : null, scope: keyResult.scope ?? {},
      target: keyResult.target, baseline: baselines[position] ?? null,
    })));
    await recordAudit(tx, caller.actor, active ? "goal.created" : "goal.proposed", { subject: `${input.quarter}: ${objective!.title}` });
    return objective!.id;
  });
}

async function changeObjective(db: Database, id: string, caller: Caller, to: "active" | "archived") {
  if (!caller.owner) throw new PostError(403, "owner_only", "Only the owner approves or archives goals, in the admin.");
  return db.transaction(async (tx) => {
    const [objective] = await tx.update(goalObjectives)
      .set(to === "active" ? { status: "active", approvedBy: caller.actor.name, approvedAt: new Date() } : { status: "archived" })
      .where(and(eq(goalObjectives.id, id), to === "active" ? eq(goalObjectives.status, "draft") : sql`${goalObjectives.status} <> 'archived'`))
      .returning();
    if (!objective) throw new PostError(404, "goal_not_found", to === "active" ? "No draft with this id." : "No goal with this id, or it is archived already.");
    await recordAudit(tx, caller.actor, to === "active" ? "goal.approved" : "goal.archived", { subject: `${objective.quarter}: ${objective.title}` });
  });
}

export const approveObjective = (db: Database, id: string, caller: Caller) => changeObjective(db, id, caller, "active");
export const archiveObjective = (db: Database, id: string, caller: Caller) => changeObjective(db, id, caller, "archived");

/** The owner's check-in on a manual key result; measured ones take their value from the data only. */
export async function checkIn(db: Database, keyResultId: string, value: number, caller: Caller) {
  if (!caller.owner) throw new PostError(403, "owner_only", "Only the owner enters a manual key result's value, in the admin.");
  return db.transaction(async (tx) => {
    const [keyResult] = await tx.update(goalKeyResults).set({ manualValue: value, manualAt: new Date() })
      .where(and(eq(goalKeyResults.id, keyResultId), eq(goalKeyResults.kind, "manual"))).returning();
    if (!keyResult) throw new PostError(404, "goal_not_found", "No manual key result with this id: measured ones count from the data.");
    await recordAudit(tx, caller.actor, "goal.checked_in", { subject: `${keyResult.title}: ${value}` });
  });
}

/** Every objective still waiting for the owner's approval, whatever its quarter, newest first. */
export async function listDrafts(db: Database) {
  const quarters = await db.selectDistinct({ quarter: goalObjectives.quarter }).from(goalObjectives).where(eq(goalObjectives.status, "draft"));
  const lists = await Promise.all(quarters.map(({ quarter }) => listObjectives(db, quarter, false)));
  return lists.flat().filter((objective) => objective.status === "draft").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** A quarter's objectives, newest first, each key result with its progress from the data. */
export async function listObjectives(db: Database, quarter: string, includeArchived: boolean) {
  const period = quarterRange(quarter);
  const objectives = await db.select().from(goalObjectives)
    .where(and(eq(goalObjectives.quarter, quarter), includeArchived ? undefined : inArray(goalObjectives.status, ["draft", "active"])))
    .orderBy(desc(goalObjectives.createdAt));
  const keyResults = objectives.length ? await db.select().from(goalKeyResults)
    .where(inArray(goalKeyResults.objectiveId, objectives.map((objective) => objective.id))).orderBy(asc(goalKeyResults.position)) : [];
  return Promise.all(objectives.map(async (objective) => ({
    ...objective, period,
    keyResults: await Promise.all(keyResults.filter((keyResult) => keyResult.objectiveId === objective.id).map(async (keyResult) => {
      if (keyResult.kind === "manual") {
        return { ...keyResult, measured: null, progress: { value: keyResult.manualValue, share: keyResult.manualValue === null || !keyResult.target ? null : keyResult.manualValue / keyResult.target, projected: null, onTrack: null } };
      }
      const metric = keyResult.metric as Metric;
      const measured = await measure(db, metric, keyResult.scope, period.from, period.to);
      return { ...keyResult, measured, progress: progressOf(metric, measured, period, keyResult.target) };
    })),
  })));
}
