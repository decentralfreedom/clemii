// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The daily Search Console import (PRD R12), run by the scheduler. The first
// run loads everything Google keeps (16 months); later runs re-read the last
// days, since Search Console revises its fresh numbers for a few days, and
// replace them. Numbers are stored per post and day: a post's pages at all
// addresses it has had are combined, with the position weighted by
// impressions. Pages that are not posts (the home page, releases) are counted
// in the log but not stored.
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { searchConsoleState, searchDaily } from "../db/schema";
import { pagePathOf, postPathIndex } from "../posts/paths";
import type { SearchConsoleClient } from "./console";

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

export async function importSearchConsole(db: Database, client: SearchConsoleClient, now = new Date()) {
  await db.insert(searchConsoleState).values({ id: 1, attemptedAt: now })
    .onConflictDoUpdate({ target: searchConsoleState.id, set: { attemptedAt: now } });
  const previous = (await readSearchState(db))?.importedThrough;
  const start = previous
    ? isoDay(new Date(Date.parse(previous) - refreshDays * dayMs))
    : isoDay(new Date(now.getTime() - historyDays * dayMs));
  const rows = await client.pageDays(start, isoDay(now));
  const index = await postPathIndex(db);

  const days = new Map<string, { postId: string; date: string; impressions: number; clicks: number; weighted: number }>();
  const unmatched = new Set<string>();
  for (const row of rows) {
    const path = pagePathOf(row.page);
    const postId = path && index.get(path);
    if (!postId) { unmatched.add(path ?? row.page); continue; }
    const key = `${postId}\n${row.date}`;
    const day = days.get(key) ?? { postId, date: row.date, impressions: 0, clicks: 0, weighted: 0 };
    day.impressions += row.impressions;
    day.clicks += row.clicks;
    day.weighted += row.position * row.impressions;
    days.set(key, day);
  }
  const values = [...days.values()].map(({ weighted, ...day }) => ({ ...day, position: day.impressions ? weighted / day.impressions : 0 }));
  const through = rows.reduce((latest, row) => (row.date > latest ? row.date : latest), previous ?? "");

  await db.transaction(async (tx) => {
    for (let offset = 0; offset < values.length; offset += 1000) {
      await tx.insert(searchDaily).values(values.slice(offset, offset + 1000)).onConflictDoUpdate({
        target: [searchDaily.postId, searchDaily.date],
        set: { impressions: sql`excluded.impressions`, clicks: sql`excluded.clicks`, position: sql`excluded.position` },
      });
    }
    await tx.update(searchConsoleState).set({ importedAt: now, importedThrough: through || null });
  });
  return { from: start, through: through || null, rows: rows.length, postDays: values.length, otherPages: [...unmatched].sort() };
}
