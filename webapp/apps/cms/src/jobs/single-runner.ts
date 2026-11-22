// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// One runner at a time across every scheduler instance: a job runs only while
// it holds a transaction-level Postgres advisory lock named after it, and an
// instance that does not get the lock skips this round instead of waiting
// (PostgreSQL 18 docs, 13.3.5 Advisory Locks; Heroku's release-phase advice).
// The lock ends with its transaction, so a crashed runner never leaves it
// held. The jobs stay idempotent anyway: a lock prevents overlap, not a
// second run after the first.
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

/** Runs `job` if no other instance runs it now; false when it skipped. */
export async function singleRunner(db: Database, name: string, job: () => Promise<void>) {
  return db.transaction(async (lock) => {
    const [row] = await lock.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${name})) as locked`);
    if (!row?.locked) return false;
    await job();
    return true;
  });
}
