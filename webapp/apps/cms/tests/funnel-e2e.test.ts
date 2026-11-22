// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// FUNNEL-001, the CMS half of the funnel's end-to-end check
// (scripts/funnel-e2e.sh): after the website's browser journey has made known
// visits through a real Umami 3.5 (apps/web tests/funnel.spec.ts), the CMS
// imports them and has exactly those numbers, per post and for the site, and
// serves them as the funnel's later steps. Skips unless the script runs it.
import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { createToken, systemActor } from "../src/auth/tokens";
import { trafficDaily, trafficSiteDaily, trafficSourceDaily } from "../src/db/schema";
import { createDraft, publishPost } from "../src/posts/service";
import { pacificDay } from "../src/search/analytics";
import { LocalObjectStore } from "../src/storage/object-store";
import { importTraffic } from "../src/traffic/import";
import { umamiClient } from "../src/traffic/umami";
import { createTestDatabase, serverUrl } from "./database";
import { credentials, validPost } from "./fixtures";

const url = process.env.HUSH_FUNNEL_UMAMI_URL;
const websiteId = process.env.HUSH_FUNNEL_UMAMI_WEBSITE_ID;
const apiKey = process.env.HUSH_FUNNEL_UMAMI_API_KEY;

test.skipIf(!url || !websiteId || !apiKey || !serverUrl)("FUNNEL-001 the CMS imports exactly the visits and downloads the website counted", async () => {
  const database = await createTestDatabase();
  try {
    const cms = { db: database.db, media: new LocalObjectStore(await mkdtemp(join(tmpdir(), "hush-cms-funnel-"))) };
    // The website's fixture article, as a post in the CMS.
    const post = await createDraft(cms.db, validPost({ slug: "fixture-dictation-without-cloud", keyword: "dictation without cloud" }), systemActor("e2e"));
    await publishPost(cms, post.id, systemActor("e2e"));

    // A day later every day with the visits is complete.
    const now = new Date(Date.now() + 86_400_000);
    const result = await importTraffic(cms.db, umamiClient({ url: url!, websiteId: websiteId!, apiKey: apiKey! }), now);
    expect(result.from).toBe(pacificDay(new Date()));
    // The home page and the release notes the download opened are the site's, not a post's.
    expect(result.otherPages).toEqual(["/", expect.stringMatching(/^\/releases\//)]);

    const sum = (rows: Array<{ pageviews: number; downloads: number }>) =>
      rows.reduce((total, row) => ({ pageviews: total.pageviews + row.pageviews, downloads: total.downloads + row.downloads }), { pageviews: 0, downloads: 0 });
    expect(sum(await cms.db.select().from(trafficDaily))).toEqual({ pageviews: 5, downloads: 1 });
    expect(sum(await cms.db.select().from(trafficSiteDaily))).toEqual({ pageviews: 10, downloads: 2 });

    // Each visit in its channel; the tagged Reddit link without a referrer is social, not direct;
    // only the tagged download is attributed to a source.
    const channels: Record<string, { pageviews: number; downloads: number }> = {};
    for (const row of await cms.db.select().from(trafficSourceDaily)) {
      const total = channels[row.channel] ?? { pageviews: 0, downloads: 0 };
      channels[row.channel] = { pageviews: total.pageviews + row.pageviews, downloads: total.downloads + row.downloads };
    }
    expect(channels).toEqual({
      direct: { pageviews: 5, downloads: 0 },
      organicSearch: { pageviews: 1, downloads: 0 },
      organicSocial: { pageviews: 2, downloads: 0 },
      ai: { pageviews: 1, downloads: 0 },
      email: { pageviews: 1, downloads: 1 },
    });

    // And the API serves them as the funnel's page view and download steps.
    const app = createApp(cms);
    const reader = await createToken(cms.db, { name: "funnel-reader", scopes: ["posts:read"] }, systemActor("e2e"));
    const response = await app.request(`/v1/posts/${post.id}/traffic?days=7`, { headers: credentials(reader) });
    expect(await response.json()).toMatchObject({ totals: { pageviews: 5, downloads: 1 } });
  } finally {
    await database.drop();
  }
});
