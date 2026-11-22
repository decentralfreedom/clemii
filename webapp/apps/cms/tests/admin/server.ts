// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// A local CMS for the admin: its browser journeys (playwright.config.ts) and
// development (bun run dev in apps/cms-admin). It serves the built admin when
// apps/cms-admin/dist exists, and uses a fresh database
// (HUSH_TEST_DATABASE_URL), media on disk and two seeded posts. GET
// /__e2e/sign-in signs the browser in through the CMS's own session code; that
// route exists only in this test server, never in the CMS.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/app";
import { createSession, setSessionCookie } from "../../src/auth/sessions";
import { systemActor } from "../../src/auth/tokens";
import { searchConsoleState, searchDaily, searchQueries, searchSiteDaily, trafficDaily, trafficSiteDaily, trafficSourceDaily, trafficState } from "../../src/db/schema";
import { Hono } from "hono";
import { createDraft, publishPost } from "../../src/posts/service";
import { LocalObjectStore } from "../../src/storage/object-store";
import { createTestDatabase } from "../database";
import { validPost } from "../fixtures";

const port = Number(process.env.PORT ?? 4310);
const database = await createTestDatabase();
const cms = { db: database.db, media: new LocalObjectStore(await mkdtemp(join(tmpdir(), "hush-cms-admin-e2e-"))) };
// The admin's origin for the CSRF check: this server itself, or the Vite dev
// server in front of it (bun run dev in apps/cms-admin sets it).
const admin = {
  publicUrl: process.env.CMS_ADMIN_ORIGIN ?? `https://localhost:${port}`,
  github: { clientId: "e2e", clientSecret: "e2e" },
  allowedGithubIds: new Set([1]),
};

const e2e = systemActor("e2e");
const live = await createDraft(cms.db, validPost({ slug: "dictate-without-cloud", keyword: "dictate without cloud" }), e2e);
await publishPost(cms, live.id, e2e);
// What the scheduler's Search Console import leaves for the live post (src/search/import.ts).
// Google was still counting 19 and 20 November.
await cms.db.insert(searchConsoleState).values({ id: 1, importedAt: new Date(), importedFrom: "2025-07-24", importedThrough: "2026-11-20", incompleteFrom: "2026-11-19" });
await cms.db.insert(searchDaily).values([
  { postId: live.id, date: "2026-11-01", impressions: 1200, clicks: 30, position: 8 },
  { postId: live.id, date: "2026-11-20", impressions: 300, clicks: 6, position: 6 },
]);
// Google's own site totals (aggregated by property): more than the post's, as the home page counts too.
// The 30 days before 22 October hold enough impressions for a valid comparison.
await cms.db.insert(searchSiteDaily).values([
  { date: "2026-10-10", impressions: 900, clicks: 18, position: 9 },
  { date: "2026-11-01", impressions: 2000, clicks: 60, position: 7 },
  { date: "2026-11-20", impressions: 800, clicks: 20, position: 5 },
]);
// What the Umami import leaves (src/traffic/import.ts): counting from 15 November, one day ahead of Search Console.
await cms.db.insert(trafficState).values({ id: 1, importedAt: new Date(), importedFrom: "2026-11-15", importedThrough: "2026-11-21" });
await cms.db.insert(trafficDaily).values([
  { postId: live.id, date: "2026-11-20", pageviews: 40, downloads: 3 },
  { postId: live.id, date: "2026-11-21", pageviews: 10, downloads: 1 },
]);
await cms.db.insert(trafficSiteDaily).values([
  { date: "2026-11-19", pageviews: 30, downloads: 2 },
  { date: "2026-11-20", pageviews: 120, downloads: 9 },
  { date: "2026-11-21", pageviews: 50, downloads: 4 },
]);
// Their sources (src/traffic/import.ts): every day's rows add up to its page views above, 200 in all.
const post = { path: "/blog/dictate-without-cloud", postId: live.id, pageType: "post" };
const none = { medium: "", campaign: "", content: "", downloads: 0 };
await cms.db.insert(trafficSourceDaily).values([
  { date: "2026-11-19", path: "/", postId: null, pageType: "home", channel: "direct", source: "", ...none, pageviews: 30 },
  { date: "2026-11-20", ...post, channel: "organicSearch", source: "google.com", ...none, pageviews: 25 },
  { date: "2026-11-20", ...post, channel: "ai", source: "chatgpt.com", ...none, pageviews: 5 },
  { date: "2026-11-20", ...post, channel: "organicSocial", source: "reddit", medium: "social", campaign: "launch", content: "", pageviews: 10, downloads: 2 },
  { date: "2026-11-20", path: "/", postId: null, pageType: "home", channel: "direct", source: "", ...none, pageviews: 40 },
  { date: "2026-11-20", path: "/", postId: null, pageType: "home", channel: "email", source: "newsletter", medium: "email", campaign: "december", content: "", pageviews: 20, downloads: 1 },
  { date: "2026-11-20", path: "/releases/0.1.0-alpha.9", postId: null, pageType: "release", channel: "direct", source: "", ...none, pageviews: 20 },
  { date: "2026-11-21", ...post, channel: "organicSearch", source: "google.com", ...none, pageviews: 10 },
  { date: "2026-11-21", path: "/", postId: null, pageType: "home", channel: "direct", source: "", ...none, pageviews: 30 },
  { date: "2026-11-21", path: "/releases/0.1.0-alpha.9", postId: null, pageType: "release", channel: "direct", source: "", ...none, pageviews: 10 },
]);
await cms.db.insert(searchQueries).values([
  { postId: live.id, date: "2026-11-20", query: "dictate without cloud", impressions: 200, clicks: 5, position: 5 },
  { postId: live.id, date: "2026-11-20", query: "offline dictation mac", impressions: 60, clicks: 1, position: 8 },
]);
await createDraft(cms.db, validPost({
  slug: "draft-in-progress", keyword: "draft in progress",
  title: "A draft that is still being written, slowly, step by step",
}), e2e);
const app = new Hono();
app.get("/__e2e/sign-in", async (context) => {
  const session = await createSession(cms.db, { githubUserId: 1, githubLogin: "owner" });
  setSessionCookie(context, session.token, session.expiresAt);
  return context.redirect(context.req.query("to") ?? "/");
});
const adminDir = join(import.meta.dir, "../../../cms-admin/dist");
app.route("/", createApp(cms, { admin, adminDir: await Bun.file(join(adminDir, "index.html")).exists() ? adminDir : undefined }));
// HTTPS with a throwaway self-signed certificate: every browser, WebKit too,
// then keeps the __Host- session cookie exactly as on cms.behu.sh.
const certificateDir = await mkdtemp(join(tmpdir(), "hush-cms-admin-tls-"));
const openssl = Bun.spawnSync(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
  "-addext", "subjectAltName=DNS:localhost", "-keyout", join(certificateDir, "key.pem"), "-out", join(certificateDir, "cert.pem")]);
if (openssl.exitCode !== 0) throw new Error(`openssl failed: ${openssl.stderr.toString()}`);
Bun.serve({ port, fetch: app.fetch, tls: { key: Bun.file(join(certificateDir, "key.pem")), cert: Bun.file(join(certificateDir, "cert.pem")) } });
console.info(`hush CMS admin journeys on ${admin.publicUrl}`);
process.on("SIGTERM", async () => { await database.drop(); process.exit(0); });
