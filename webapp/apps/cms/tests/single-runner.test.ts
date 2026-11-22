// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The scheduler's single-runner guard and its schema-version check.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { databaseIsNewer, newestMigration } from "../src/db/migrate";
import { singleRunner } from "../src/jobs/single-runner";
import { createTestDatabase, serverUrl } from "./database";

describe.skipIf(!serverUrl)("CMS scheduler guards", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  beforeAll(async () => { database = await createTestDatabase(); });
  afterAll(async () => { await database.drop(); });

  test("CMS-SCHED-001 two scheduler instances never run the same round at once: the second skips, and the next round runs again", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const runs: string[] = [];
    const first = singleRunner(database.db, "test round", async () => { runs.push("first"); await held; });
    // Give the first instance the lock.
    while (!runs.length) await Bun.sleep(5);
    expect(await singleRunner(database.db, "test round", async () => { runs.push("second"); })).toBe(false);
    // Another job's lock is its own.
    expect(await singleRunner(database.db, "other round", async () => { runs.push("other"); })).toBe(true);
    release();
    expect(await first).toBe(true);
    // The lock ends with the round: the next one runs.
    expect(await singleRunner(database.db, "test round", async () => { runs.push("third"); })).toBe(true);
    expect(runs).toEqual(["first", "other", "third"]);
  });

  test("CMS-SCHED-002 a scheduler older than the database knows it, so its imports wait for its update", async () => {
    expect(await databaseIsNewer(database.db)).toBe(false);
    // A newer release applied a migration this code does not have.
    await database.db.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('from-a-newer-release', ${newestMigration + 1})`);
    expect(await databaseIsNewer(database.db)).toBe(true);
    await database.db.execute(sql`delete from drizzle.__drizzle_migrations where hash = 'from-a-newer-release'`);
  });
});
