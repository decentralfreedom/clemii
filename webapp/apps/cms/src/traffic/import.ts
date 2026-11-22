// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The scheduler's Umami import (PRD R11): every complete US Pacific day, from
// the day the Umami website was created, page views and downloads per post
// (its pages at every address it has had, src/posts/paths.ts) and for the
// whole site. A day is read and replaced in one transaction, so a run that
// stops part way is repeated by the next. Today is left for tomorrow: a day
// still being counted would look like a drop.
import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { trafficDaily, trafficPageDaily, trafficSiteDaily, trafficSourceDaily, trafficState } from "../db/schema";
import { channelOf, pageTypeOf } from "./channels";
import { pagePathOf, postPathIndex } from "../posts/paths";
import { pacificDay } from "../search/analytics";
import type { DownloadEvent, SourceRow, TrafficRow, UmamiClient } from "./umami";

const dayMs = 86_400_000;
/** A failed import is tried again after this long. */
const retryAfterMs = 3_600_000;
/** The day before the last one imported is read again, for events that arrived late. */
const rereadDays = 1;

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

export async function readTrafficState(db: Pick<Database, "select">) {
  const [state] = await db.select().from(trafficState);
  return state;
}

/** The last complete US Pacific day. */
const yesterday = (now: Date) => isoDay(Date.parse(pacificDay(now)) - dayMs);

/** Whether the scheduler should import now: a complete day is missing and the last attempt is an hour old. */
export async function trafficImportDue(db: Database, now = new Date()) {
  const state = await readTrafficState(db);
  if (state?.attemptedAt && now.getTime() - state.attemptedAt.getTime() < retryAfterMs) return false;
  if (!state?.importedThrough || state.importedThrough < yesterday(now)) return true;
  return Boolean(state.importedFrom && await firstIncompleteDay(db, state.importedFrom, state.importedThrough));
}

/**
 * The first day from..through whose numbers are not all there: no site row,
 * or pages or sources that do not add up to the site's page views. That
 * happens when a version that did not yet fill a table imported the day
 * (the API and the scheduler update one after the other), so the import
 * resumes there instead of trusting the last imported day.
 */
export async function firstIncompleteDay(db: Database, from: string, through: string) {
  const rows = await db.execute<{ day: string }>(sql`
    select to_char(day, 'YYYY-MM-DD') as day
    from generate_series(${from}::date, ${through}::date, interval '1 day') as day
    left join ${trafficSiteDaily} site on site.date = day::date
    left join (select date, sum(pageviews) as pageviews from ${trafficSourceDaily} group by date) sources on sources.date = day::date
    left join (select date, sum(pageviews) as pageviews from ${trafficPageDaily} group by date) pages on pages.date = day::date
    where site.date is null
      or coalesce(sources.pageviews, 0) <> site.pageviews
      or coalesce(pages.pageviews, 0) <> site.pageviews
    order by day limit 1`);
  return rows[0]?.day;
}

export async function importTraffic(db: Database, client: UmamiClient, now = new Date()) {
  await db.insert(trafficState).values({ id: 1, attemptedAt: now })
    .onConflictDoUpdate({ target: trafficState.id, set: { attemptedAt: now } });
  const state = await readTrafficState(db);
  const from = state?.importedFrom ?? pacificDay(await client.createdAt());
  const last = yesterday(now);
  const reread = state?.importedThrough ? isoDay(Date.parse(state.importedThrough) - rereadDays * dayMs) : from;
  // A day another version left incomplete is read again, however long ago.
  const incomplete = state?.importedFrom && state.importedThrough ? await firstIncompleteDay(db, state.importedFrom, state.importedThrough) : undefined;
  const start = incomplete && incomplete < reread ? incomplete : reread;
  const index = await postPathIndex(db);
  const otherPages = new Set<string>();
  let days = 0;
  // Re-reading the day before never moves the last imported day back.
  let through = state?.importedThrough ?? "";
  for (let time = Date.parse(start < from ? from : start); time <= Date.parse(last); time += dayMs) {
    const day = isoDay(time);
    const { pages: rows, downloads } = await client.day(day);
    const perPost = new Map<string, { pageviews: number; downloads: number }>();
    for (const row of rows) {
      const path = pagePathOf(row.path);
      const postId = path && index.get(path);
      if (!postId) { otherPages.add(path ?? row.path); continue; }
      const sum = perPost.get(postId) ?? { pageviews: 0, downloads: 0 };
      sum.pageviews += row.pageviews;
      sum.downloads += row.downloads;
      perPost.set(postId, sum);
    }
    const site = rows.reduce((sum, row) => ({ pageviews: sum.pageviews + row.pageviews, downloads: sum.downloads + row.downloads }), { pageviews: 0, downloads: 0 });
    const sources = sourcesOf(await client.sources(day, rows.map((row) => row.path)), downloads, index);
    const pages = pagesOf(rows, index);
    // Every page view has exactly one source row: anything else means a read was cut short, and the day is not stored.
    const sourced = sources.reduce((sum, row) => sum + row.pageviews, 0);
    if (sourced !== site.pageviews) throw new Error(`Umami's sources for ${day} add up to ${sourced} page views, its pages to ${site.pageviews}`);
    await db.transaction(async (tx) => {
      await tx.delete(trafficDaily).where(eq(trafficDaily.date, day));
      await tx.delete(trafficSiteDaily).where(eq(trafficSiteDaily.date, day));
      if (perPost.size) await tx.insert(trafficDaily).values([...perPost].map(([postId, sum]) => ({ postId, date: day, ...sum })));
      await tx.insert(trafficSiteDaily).values({ date: day, ...site });
      await tx.delete(trafficSourceDaily).where(eq(trafficSourceDaily.date, day));
      await tx.delete(trafficPageDaily).where(eq(trafficPageDaily.date, day));
      for (let offset = 0; offset < pages.length; offset += 1000) {
        await tx.insert(trafficPageDaily).values(pages.slice(offset, offset + 1000).map((row) => ({ date: day, ...row })));
      }
      for (let offset = 0; offset < sources.length; offset += 1000) {
        await tx.insert(trafficSourceDaily).values(sources.slice(offset, offset + 1000).map((row) => ({ date: day, ...row })));
      }
      if (day > through) through = day;
      await tx.update(trafficState).set({ importedFrom: from, importedThrough: through });
    });
    days++;
  }
  await db.update(trafficState).set({ importedAt: now, importedFrom: from });
  return { from, through: last, days, otherPages: [...otherPages].sort() };
}

type SourceKey = { path: string; postId: string | null; pageType: string; channel: string; source: string; medium: string; campaign: string; content: string };

/**
 * A day's page views and tagged downloads per page and source. A tagged link
 * is keyed by its tags; an untagged visit by its referring domain. Pages at
 * an address a post once had are counted for that post.
 */
function sourcesOf(rows: SourceRow[], downloads: DownloadEvent[], index: Map<string, string>) {
  const sums = new Map<string, SourceKey & { pageviews: number; downloads: number }>();
  const add = (path: string, tags: { referrer: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null }, pageviews: number, downloadCount: number) => {
    const page = pagePathOf(path) ?? path;
    const postId = index.get(page) ?? null;
    const key: SourceKey = {
      path: page, postId, pageType: pageTypeOf(page, Boolean(postId)), channel: channelOf(tags),
      source: (tags.utmSource ?? tags.referrer ?? "").toLowerCase(), medium: (tags.utmMedium ?? "").toLowerCase(),
      campaign: (tags.utmCampaign ?? "").toLowerCase(), content: (tags.utmContent ?? "").toLowerCase(),
    };
    const id = [key.path, key.channel, key.source, key.medium, key.campaign, key.content].join("\n");
    const sum = sums.get(id) ?? { ...key, pageviews: 0, downloads: 0 };
    sum.pageviews += pageviews;
    sum.downloads += downloadCount;
    sums.set(id, sum);
  };
  for (const row of rows) add(row.path, row, row.pageviews, 0);
  for (const download of downloads) {
    const tags = new URLSearchParams(download.query);
    if (!tags.get("utm_source") && !tags.get("utm_medium")) continue;
    add(download.path, {
      referrer: null, utmSource: tags.get("utm_source"), utmMedium: tags.get("utm_medium"),
      utmCampaign: tags.get("utm_campaign"), utmContent: tags.get("utm_content"),
    }, 0, 1);
  }
  return [...sums.values()];
}

/** Every page's page views and downloads, a page at an address a post once had counted for that post. */
function pagesOf(rows: TrafficRow[], index: Map<string, string>) {
  const sums = new Map<string, { path: string; postId: string | null; pageType: string; pageviews: number; downloads: number }>();
  for (const row of rows) {
    const path = pagePathOf(row.path) ?? row.path;
    const postId = index.get(path) ?? null;
    const sum = sums.get(path) ?? { path, postId, pageType: pageTypeOf(path, Boolean(postId)), pageviews: 0, downloads: 0 };
    sum.pageviews += row.pageviews;
    sum.downloads += row.downloads;
    sums.set(path, sum);
  }
  return [...sums.values()];
}

