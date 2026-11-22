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
import { gte } from "drizzle-orm";
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
  return !state?.importedAt || now.getTime() - state.importedAt.getTime() >= importEveryMs;
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

export async function importSearchConsole(db: Database, client: SearchConsoleClient, now = new Date()) {
  await db.insert(searchConsoleState).values({ id: 1, attemptedAt: now })
    .onConflictDoUpdate({ target: searchConsoleState.id, set: { attemptedAt: now } });
  const state = await readSearchState(db);
  // Until the start of the history is known, read all of it: that start is
  // what tells "no numbers" apart from zero.
  const full = !state?.importedFrom || !state.importedThrough;
  const previous = full ? undefined : state.importedThrough!;
  const start = full
    ? isoDay(new Date(now.getTime() - historyDays * dayMs))
    : isoDay(new Date(Date.parse(previous!) - refreshDays * dayMs));
  const end = isoDay(now);
  const [pageRows, queryRows] = await Promise.all([client.pageDays(start, end), client.pageQueryDays(start, end)]);
  const index = await postPathIndex(db);
  const unmatched = new Set<string>();
  const days = perPost(pageRows, index, (row) => row.date, unmatched)
    .map(({ row, ...day }) => ({ ...day, date: row.date }));
  const queries = perPost(queryRows, index, (row) => `${row.date}\n${row.query}`, new Set())
    .map(({ row, ...day }) => ({ ...day, date: row.date, query: row.query }));
  const through = pageRows.reduce((latest, row) => (row.date > latest ? row.date : latest), previous ?? "");

  // The window is replaced as Google has it now, so a fresh number or query it
  // later drops does not linger; days before the window stay as they are.
  await db.transaction(async (tx) => {
    await tx.delete(searchDaily).where(gte(searchDaily.date, start));
    await tx.delete(searchQueries).where(gte(searchQueries.date, start));
    await insertInChunks(days, (chunk) => tx.insert(searchDaily).values(chunk));
    await insertInChunks(queries, (chunk) => tx.insert(searchQueries).values(chunk));
    await tx.update(searchConsoleState).set({
      importedAt: now, importedThrough: through || null, ...(full ? { importedFrom: start } : {}),
    });
  });
  return {
    from: start, through: through || null, rows: pageRows.length, postDays: days.length,
    queryRows: queryRows.length, postQueryDays: queries.length, otherPages: [...unmatched].sort(),
  };
}
