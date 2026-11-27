// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { coverDesign } from "@clemii/article";
import { coverTemplatePath } from "./build-blog";

describe("the cover design version", () => {
  // The CMS addresses a published article's cover by this version without the files, so a change to
  // the template or renderer must come with a new version, which renames (and re-renders) every cover.
  test("matches the cover template and renderer", async () => {
    const sources = await readFile(coverTemplatePath, "utf8") + await readFile(join(import.meta.dir, "render-covers.ts"), "utf8");
    const digest = createHash("sha256").update(sources).digest("hex").slice(0, 16);
    expect(coverDesign, `Set coverDesign in packages/article/src/article.ts to "${digest}"`).toBe(digest);
  });
});
