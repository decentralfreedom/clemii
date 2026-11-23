// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import journal from "./migrations/meta/_journal.json";
import type { Database } from "./client";

// One session holds an advisory lock for the whole migration, so two instances
// starting together never apply the same migration twice. Migrations stay
// additive: the previous release keeps running on the new schema until its
// replacement is healthy.
const MIGRATION_LOCK_ID = 7_316_504_212;

export async function migrateDatabase(url: string) {
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await client`select pg_advisory_lock(${MIGRATION_LOCK_ID})`;
    await migrate(drizzle(client), { migrationsFolder: join(import.meta.dir, "migrations") });
  } finally {
    await client`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`.catch(() => {});
    await client.end({ timeout: 5 });
  }
}

/** When this code's newest migration was made, as drizzle records it. */
export const newestMigration = Math.max(...journal.entries.map((entry) => entry.when));

/**
 * Whether the database has a migration this code does not know: a newer
 * release applied it while this one still runs (the API and the scheduler
 * update one after the other). Jobs that fill tables then wait for their own
 * update instead of filling only the tables they know.
 */
export async function databaseIsNewer(db: Pick<Database, "execute">) {
  const rows = await db.execute<{ newest: string | null }>(sql`select max(created_at)::text as newest from drizzle.__drizzle_migrations`);
  const newest = Number(rows[0]?.newest ?? 0);
  return newest > newestMigration;
}

if (import.meta.main) {
  const url = process.env.CMS_DATABASE_URL;
  if (!url) throw new Error("CMS_DATABASE_URL is required");
  await migrateDatabase(url);
  console.info("clemii CMS database is current.");
}
