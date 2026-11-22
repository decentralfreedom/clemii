// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Exports every post as Markdown to the backup bucket once: bun run cms:export-markdown
import { exportMarkdown } from "../backups/markdown-export";
import { loadConfig } from "../config";
import { connectDatabase } from "../db/client";
import { createObjectStore } from "../storage/object-store";

const config = loadConfig();
const { db, close } = connectDatabase(config.databaseUrl);
try {
  const result = await exportMarkdown(db, createObjectStore(config.backups), config.backups.keepDays);
  console.info(JSON.stringify({ level: "info", message: "Exported the posts as Markdown", ...result }));
} finally {
  await close();
}
