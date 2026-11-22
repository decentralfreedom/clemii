// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// What a key result can measure, and its value over a period (PRD: the Goals
// tab). Only metrics and scopes the CMS can compute exactly are offered: a
// value always comes from the imported rows, over the days the CMS has, never
// estimated. Search numbers come from Search Console (Google only); page views
// and downloads from Umami. Downloads per channel, source or campaign are
// those through tagged links only, and say so.
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client";
import { searchDaily, searchSiteDaily, trafficDaily, trafficSiteDaily, trafficSourceDaily } from "../db/schema";
import { readSearchState } from "../search/import";
import { readTrafficState } from "../traffic/import";

export const metrics = ["impressions", "clicks", "ctr", "position", "pageviews", "downloads", "conversion"] as const;
export type Metric = (typeof metrics)[number];
/** Metrics that add up over days, so their pace can be projected; rates and positions cannot. */
export const additive: readonly Metric[] = ["impressions", "clicks", "pageviews", "downloads"];
/** Lower is better. */
export const lowerIsBetter: readonly Metric[] = ["position"];

export type Scope = { postId?: string; pageType?: string; channel?: string; source?: string; campaign?: string };
const tagKeys = ["channel", "source", "campaign"] as const;

export class ScopeError extends Error {}

/** Which data a metric and scope are computed from, or why they cannot be. */
export function sourceOf(metric: Metric, scope: Scope) {
  const tagged = tagKeys.some((key) => scope[key]);
  const keys = Object.keys(scope).filter((key) => scope[key as keyof Scope]);
  const search = ["impressions", "clicks", "ctr", "position"].includes(metric);
  if (search) {
    if (keys.some((key) => key !== "postId")) throw new ScopeError(`${metric} comes from Google Search Console, which knows only pages: scope it to the site or a post.`);
    return { table: "search" as const };
  }
  if (metric === "conversion") {
    if (keys.some((key) => key !== "postId")) throw new ScopeError("Downloads per page view are exact only for the site or a post.");
    return { table: "traffic" as const };
  }
  if (metric === "downloads" && scope.pageType && !tagged) throw new ScopeError("Downloads are counted per post or for the site; by page type only through tagged links (add a channel, source or campaign).");
  if (tagged || scope.pageType) return { table: "sources" as const, taggedOnly: metric === "downloads" };
  return { table: "traffic" as const };
}

/** A quarter's days, e.g. 2026-Q4: 2026-10-01 to 2026-12-31. */
export function quarterRange(quarter: string) {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!match) throw new ScopeError("A quarter is written like 2026-Q4.");
  const year = Number(match[1]), first = (Number(match[2]) - 1) * 3;
  const from = new Date(Date.UTC(year, first, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, first + 3, 0)).toISOString().slice(0, 10);
  return { from, to };
}

const dayMs = 86_400_000;
export const daysIn = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / dayMs) + 1;

/** The days the CMS has numbers for, for a metric's data. */
async function coverage(db: Database, metric: Metric) {
  const state = ["impressions", "clicks", "ctr", "position"].includes(metric) ? await readSearchState(db) : await readTrafficState(db);
  return state?.importedFrom && state.importedThrough ? { from: state.importedFrom, to: state.importedThrough } : undefined;
}

export type Measurement = {
  value: number | null;
  /** The days the value covers: the period clamped to the days the CMS has; null when none. */
  from: string | null;
  to: string | null;
  taggedOnly: boolean;
};

/** A metric for a scope over from..to, from the imported rows only. */
export async function measure(db: Database, metric: Metric, scope: Scope, from: string, to: string): Promise<Measurement> {
  const source = sourceOf(metric, scope);
  const taggedOnly = "taggedOnly" in source && Boolean(source.taggedOnly);
  const has = await coverage(db, metric);
  const start = has && (from > has.from ? from : has.from);
  const end = has && (to < has.to ? to : has.to);
  if (!start || !end || start > end) return { value: null, from: null, to: null, taggedOnly };

  if (source.table === "search") {
    const table = scope.postId ? searchDaily : searchSiteDaily;
    const where: SQL[] = [gte(table.date, start), lte(table.date, end)];
    if (scope.postId) where.push(eq(searchDaily.postId, scope.postId));
    const [row] = await db.select({
      impressions: sql<number>`coalesce(sum(${table.impressions}), 0)::float`,
      clicks: sql<number>`coalesce(sum(${table.clicks}), 0)::float`,
      weighted: sql<number>`coalesce(sum(${table.position} * ${table.impressions}), 0)::float`,
    }).from(table).where(and(...where));
    const { impressions, clicks, weighted } = row!;
    const value = metric === "impressions" ? impressions : metric === "clicks" ? clicks
      : !impressions ? null : metric === "ctr" ? clicks / impressions : weighted / impressions;
    return { value, from: start, to: end, taggedOnly };
  }

  if (source.table === "sources") {
    const t = trafficSourceDaily;
    const where: SQL[] = [gte(t.date, start), lte(t.date, end)];
    if (scope.postId) where.push(eq(t.postId, scope.postId));
    if (scope.pageType) where.push(eq(t.pageType, scope.pageType));
    if (scope.channel) where.push(eq(t.channel, scope.channel));
    if (scope.source) where.push(eq(t.source, scope.source));
    if (scope.campaign) where.push(eq(t.campaign, scope.campaign));
    const [row] = await db.select({
      pageviews: sql<number>`coalesce(sum(${t.pageviews}), 0)::float`,
      downloads: sql<number>`coalesce(sum(${t.downloads}), 0)::float`,
    }).from(t).where(and(...where));
    return { value: metric === "downloads" ? row!.downloads : row!.pageviews, from: start, to: end, taggedOnly };
  }

  const table = scope.postId ? trafficDaily : trafficSiteDaily;
  const where: SQL[] = [gte(table.date, start), lte(table.date, end)];
  if (scope.postId) where.push(eq(trafficDaily.postId, scope.postId));
  const [row] = await db.select({
    pageviews: sql<number>`coalesce(sum(${table.pageviews}), 0)::float`,
    downloads: sql<number>`coalesce(sum(${table.downloads}), 0)::float`,
  }).from(table).where(and(...where));
  const { pageviews, downloads } = row!;
  const value = metric === "pageviews" ? pageviews : metric === "downloads" ? downloads : pageviews ? downloads / pageviews : null;
  return { value, from: start, to: end, taggedOnly };
}

/**
 * Progress against a target over a period: the value so far, and for counts
 * the pace to the period's end from the complete days so far. Rates and
 * positions are not projected: their pace is their current value.
 */
export function progressOf(metric: Metric, measured: Measurement, period: { from: string; to: string }, target: number) {
  if (measured.value === null || !measured.from || !measured.to) return { value: null, share: null, projected: null, onTrack: null };
  // Forward only: the rate of the days measured, over the days still to come. Days before the
  // numbers start are not filled in; the value says from which day it counts.
  const elapsed = daysIn(measured.from, measured.to);
  const remaining = Math.max(0, daysIn(measured.to, period.to) - 1);
  const projected = additive.includes(metric) ? measured.value + (measured.value / elapsed) * remaining : measured.value;
  const lower = lowerIsBetter.includes(metric);
  return {
    value: measured.value,
    share: lower ? (measured.value ? target / measured.value : null) : target ? measured.value / target : null,
    projected,
    onTrack: lower ? projected <= target : projected >= target,
  };
}
