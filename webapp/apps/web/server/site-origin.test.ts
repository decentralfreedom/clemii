// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Clemens Kressmann
//
// The site's address has one source, shared/origin.ts, so moving the domain
// changes one line: no page, script or server file names the origin itself.
import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { siteOrigin } from "../shared/origin";

const root = join(import.meta.dir, "..");
const scanned = ["src", "shared", "scripts", "server"];
const generated = /\.generated\.|\/paraglide\//;

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : Promise.resolve(/\.(ts|tsx)$/.test(entry.name) ? [path] : []);
  }));
  return nested.flat();
}

describe("site origin", () => {
  test("only shared/origin.ts names the site's origin", async () => {
    const all = (await Promise.all(scanned.map((directory) => files(join(root, directory))))).flat()
      .filter((path) => !path.endsWith("shared/origin.ts") && !path.endsWith(".test.ts") && !generated.test(path));
    const naming: string[] = [];
    for (const path of all) if ((await readFile(path, "utf8")).includes(siteOrigin)) naming.push(path.slice(root.length + 1));
    expect(naming).toEqual([]);
  });
});
