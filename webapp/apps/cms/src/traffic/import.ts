// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The scheduler's Umami import (PRD R11): every complete US Pacific day, from
// the day the Umami website was created, page views and downloads per post
// (its pages at every address it has had, src/posts/paths.ts) and for the
// whole site. A day is read and replaced in one transaction, so a run that
// stops part way is repeated by the next. Today is left for tomorrow: a day
// still being counted would look like a drop.
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { trafficDaily, trafficSiteDaily, trafficState } from "../db/schema";
import { pagePathOf, postPathIndex } from "../posts/paths";
import { pacificDay } from "../search/analytics";
import type { UmamiClient } from "./umami";

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
export async function trafficImportDue(db: Pick<Database, "select">, now = new Date()) {
  const state = await readTrafficState(db);
  if (state?.attemptedAt && now.getTime() - state.attemptedAt.getTime() < retryAfterMs) return false;
  return !state?.importedThrough || state.importedThrough < yesterday(now);
}

export async function importTraffic(db: Database, client: UmamiClient, now = new Date()) {
  await db.insert(trafficState).values({ id: 1, attemptedAt: now })
    .onConflictDoUpdate({ target: trafficState.id, set: { attemptedAt: now } });
  const state = await readTrafficState(db);
  const from = state?.importedFrom ?? pacificDay(await client.createdAt());
  const last = yesterday(now);
  const start = state?.importedThrough ? isoDay(Date.parse(state.importedThrough) - rereadDays * dayMs) : from;
  const index = await postPathIndex(db);
  const otherPages = new Set<string>();
  let days = 0;
  // Re-reading the day before never moves the last imported day back.
  let through = state?.importedThrough ?? "";
  for (let time = Date.parse(start < from ? from : start); time <= Date.parse(last); time += dayMs) {
    const day = isoDay(time);
    const rows = await client.day(day);
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
    await db.transaction(async (tx) => {
      await tx.delete(trafficDaily).where(eq(trafficDaily.date, day));
      await tx.delete(trafficSiteDaily).where(eq(trafficSiteDaily.date, day));
      if (perPost.size) await tx.insert(trafficDaily).values([...perPost].map(([postId, sum]) => ({ postId, date: day, ...sum })));
      await tx.insert(trafficSiteDaily).values({ date: day, ...site });
      if (day > through) through = day;
      await tx.update(trafficState).set({ importedFrom: from, importedThrough: through });
    });
    days++;
  }
  await db.update(trafficState).set({ importedAt: now, importedFrom: from });
  return { from, through: last, days, otherPages: [...otherPages].sort() };
}
