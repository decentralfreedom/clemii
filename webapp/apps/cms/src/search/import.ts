// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The daily Search Console import (PRD R12), run by the scheduler. The first
// run loads everything Google keeps (16 months); later runs re-read the last
// days, since Search Console revises its fresh numbers for a few days, and
// replace them. Numbers are stored per post and day: a post's pages at all
// addresses it has had are combined, with the position weighted by
// impressions. The same holds for the search queries each post was found
// for. Pages that are not posts (the home page, releases) are counted in the
// log but not stored.
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { searchConsoleState, searchDaily, searchQueries } from "../db/schema";
import { pagePathOf, postPathIndex } from "../posts/paths";
import type { SearchConsoleClient, SearchRow } from "./console";

const dayMs = 86_400_000;
/** Google keeps 16 months of Search Console data. */
const historyDays = 486;
/** Days re-read on every run: longer than the time Search Console takes to finalise a day. */
const refreshDays = 10;
/** A successful import lasts a day; a failed one is retried after an hour. */
const importEveryMs = 20 * 3_600_000;
const retryAfterMs = 3_600_000;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export async function readSearchState(db: Pick<Database, "select">) {
  const [state] = await db.select().from(searchConsoleState);
  return state;
}

/** Whether the scheduler should import now. */
export async function searchImportDue(db: Pick<Database, "select">, now = new Date()) {
  const state = await readSearchState(db);
  if (state?.attemptedAt && now.getTime() - state.attemptedAt.getTime() < retryAfterMs) return false;
  // Without the first day of the history, the numbers cannot be told from "no numbers": read it all now.
  if (!state?.importedFrom) return true;
  return !state.importedAt || now.getTime() - state.importedAt.getTime() >= importEveryMs;
}

/**
 * Sums Google's rows per post, day and (for queries) query: a post's pages at
 * every address it has had become one, the position weighted by impressions.
 */
function perPost<Row extends SearchRow>(rows: Row[], index: Map<string, string>, keyOf: (row: Row) => string, unmatched: Set<string>) {
  const sums = new Map<string, { row: Row; postId: string; impressions: number; clicks: number; weighted: number }>();
  for (const row of rows) {
    const path = pagePathOf(row.page);
    const postId = path && index.get(path);
    if (!postId) { unmatched.add(path ?? row.page); continue; }
    const key = `${postId}\n${keyOf(row)}`;
    const sum = sums.get(key) ?? { row, postId, impressions: 0, clicks: 0, weighted: 0 };
    sum.impressions += row.impressions;
    sum.clicks += row.clicks;
    sum.weighted += row.position * row.impressions;
    sums.set(key, sum);
  }
  return [...sums.values()].map(({ row, postId, impressions, clicks, weighted }) => ({
    row, postId, impressions, clicks, position: impressions ? weighted / impressions : 0,
  }));
}

async function insertInChunks<T>(values: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let offset = 0; offset < values.length; offset += 1000) await insert(values.slice(offset, offset + 1000));
}

/** How many days are read from Google at once; each is written on its own. */
const parallelDays = 4;

function daysBetween(start: string, end: string) {
  const days: string[] = [];
  for (let time = Date.parse(start); time <= Date.parse(end); time += dayMs) days.push(isoDay(new Date(time)));
  return days;
}

/**
 * Imports day by day, so memory stays bounded however large the site grows:
 * a day's pages and searches are read, summed per post and written in one
 * transaction that replaces that day as Google has it now. A run that stops
 * part way is repeated by the next, which writes each day again.
 */
export async function importSearchConsole(db: Database, client: SearchConsoleClient, now = new Date()) {
  await db.insert(searchConsoleState).values({ id: 1, attemptedAt: now })
    .onConflictDoUpdate({ target: searchConsoleState.id, set: { attemptedAt: now } });
  const state = await readSearchState(db);
  // Until the start of the history is known, read all of it: that start is
  // what tells "no numbers" apart from zero.
  const full = !state?.importedFrom || !state.importedThrough;
  const start = full
    ? isoDay(new Date(now.getTime() - historyDays * dayMs))
    : isoDay(new Date(Date.parse(state.importedThrough!) - refreshDays * dayMs));
  const index = await postPathIndex(db);
  const unmatched = new Set<string>();
  const counts = { rows: 0, postDays: 0, queryRows: 0, postQueryDays: 0 };
  let through = full ? "" : state.importedThrough!;

  const days = daysBetween(start, isoDay(now));
  for (let offset = 0; offset < days.length; offset += parallelDays) {
    const batch = days.slice(offset, offset + parallelDays);
    const read = await Promise.all(batch.map(async (day) => ({
      day, pageRows: await client.pageDays(day, day), queryRows: await client.pageQueryDays(day, day),
    })));
    for (const { day, pageRows, queryRows } of read) {
      const pages = perPost(pageRows, index, (row) => row.date, unmatched).map(({ row, ...sum }) => ({ ...sum, date: row.date }));
      const queries = perPost(queryRows, index, (row) => row.query, new Set())
        .map(({ row, ...sum }) => ({ ...sum, date: row.date, query: row.query }));
      await db.transaction(async (tx) => {
        await tx.delete(searchDaily).where(eq(searchDaily.date, day));
        await tx.delete(searchQueries).where(eq(searchQueries.date, day));
        await insertInChunks(pages, (chunk) => tx.insert(searchDaily).values(chunk));
        await insertInChunks(queries, (chunk) => tx.insert(searchQueries).values(chunk));
      });
      counts.rows += pageRows.length; counts.postDays += pages.length;
      counts.queryRows += queryRows.length; counts.postQueryDays += queries.length;
      if (pageRows.length && day > through) through = day;
    }
  }

  await db.update(searchConsoleState).set({
    importedAt: now, importedThrough: through || null, ...(full ? { importedFrom: start } : {}),
  });
  return { from: start, through: through || null, ...counts, otherPages: [...unmatched].sort() };
}
