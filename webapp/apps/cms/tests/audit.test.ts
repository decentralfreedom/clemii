// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Audit log journeys (docs/user-journeys/cms.md, PRD R13): who or which token
// changed what, and when, for the owner's History.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { createToken, systemActor } from "../src/auth/tokens";
import { auditLog, posts } from "../src/db/schema";
import { publishDuePosts } from "../src/posts/service";
import { LocalObjectStore } from "../src/storage/object-store";
import { createTestDatabase, serverUrl } from "./database";
import { credentials, ownerSession, validPost } from "./fixtures";

describe.skipIf(!serverUrl)("CMS audit log", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  let owner = "";
  const agents: string[] = [];

  beforeAll(async () => {
    database = await createTestDatabase();
    app = createApp({ db: database.db, media: new LocalObjectStore(await mkdtemp(join(tmpdir(), "hush-cms-audit-"))) });
    owner = await ownerSession(database.db);
    // Two tokens of one name, as two Macs signed in with the same CLI name.
    for (let index = 0; index < 2; index++) {
      agents.push(await createToken(database.db, { name: "hush-seo", scopes: ["posts:read", "posts:write"] }, systemActor("test")));
    }
  });
  afterAll(async () => { await database.drop(); });

  const call = async (method: string, path: string, credential: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: { ...credentials(credential), ...(body ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? {} : await response.json() as Record<string, any> };
  };
  const entriesFor = async (postId: string) => (await call("GET", `/v1/audit?postId=${postId}&limit=100`, owner)).body.entries as Array<Record<string, any>>;

  test("CMS-AUDIT-001 each change names who made it, telling two tokens of one name apart", async () => {
    const { body: post } = await call("POST", "/v1/posts", agents[0]!, validPost({ slug: "audited-post", keyword: "audited post" }));
    await call("PATCH", `/v1/posts/${post.id}`, agents[1]!, { imageAlt: "A Mac with the dictation settings open." });
    await call("POST", `/v1/posts/${post.id}/publish`, owner);
    await call("POST", `/v1/posts/${post.id}/unpublish`, owner);
    const entries = await entriesFor(post.id);
    expect(entries.map((entry) => [entry.action, entry.actor])).toEqual([
      ["post.unpublished", "github:owner"],
      ["post.published", "github:owner"],
      ["post.edited", "token:hush-seo"],
      ["post.created", "token:hush-seo"],
    ]);
    const [, , edited, created] = entries;
    expect(edited!.actorTokenId).not.toBe(created!.actorTokenId);
    expect(created!.actorTokenId).toEqual(expect.any(String));
    expect(entries[0]!.actorTokenId).toBeNull();
    // An entry names the post as it was then, and the revision that shows what changed.
    expect(created!.subject).toBe(post.title);
    const revisions = (await call("GET", `/v1/posts/${post.id}/revisions`, owner)).body.revisions as Array<{ id: string }>;
    expect(revisions.map((revision) => revision.id)).toContain(edited!.revisionId);
  });

  test("CMS-AUDIT-002 a run of autosaves is one entry, and a deleted draft keeps its history", async () => {
    const { body: post } = await call("POST", "/v1/posts", owner, validPost({ slug: "autosaved-draft", keyword: "autosaved draft" }));
    for (const imageAlt of ["A Mac", "A Mac with", "A Mac with the settings open."]) {
      await call("PATCH", `/v1/posts/${post.id}?autosave=true`, owner, { imageAlt });
    }
    expect((await entriesFor(post.id)).map((entry) => entry.action)).toEqual(["post.edited", "post.created"]);
    expect((await call("DELETE", `/v1/posts/${post.id}`, owner)).status).toBe(204);
    const entries = await entriesFor(post.id);
    expect(entries.map((entry) => entry.action)).toEqual(["post.deleted", "post.edited", "post.created"]);
    expect(entries[0]!.subject).toBe(post.title);
  });

  test("CMS-AUDIT-003 the scheduler, tokens and sign-in approvals are recorded; the log is append-only", async () => {
    const { body: post } = await call("POST", "/v1/posts", owner, validPost({ slug: "due-post", keyword: "due post" }));
    await call("POST", `/v1/posts/${post.id}/schedule`, owner, { publishedAt: new Date(Date.now() + 60_000).toISOString() });
    await database.db.update(posts).set({ publishedAt: new Date(Date.now() - 1_000) }).where(eq(posts.id, post.id));
    await publishDuePosts(database.db);
    expect((await entriesFor(post.id))[0]).toMatchObject({ action: "post.published", actor: "scheduler", subject: post.title });

    const { body: list } = await call("GET", "/v1/tokens", owner);
    const token = list.tokens.find((row: { name: string }) => row.name === "hush-seo");
    expect((await call("DELETE", `/v1/tokens/${token.id}`, owner)).status).toBe(204);
    const { body: device } = await call("POST", "/v1/auth/device", "none", { clientName: "hush-cms on a test Mac" });
    await call("POST", `/v1/auth/device/${device.userCode}/approve`, owner);
    const recent = (await call("GET", "/v1/audit?limit=5", owner)).body.entries as Array<Record<string, any>>;
    expect(recent.slice(0, 2).map((entry) => [entry.action, entry.actor, entry.subject])).toEqual([
      ["device.approved", "github:owner", "hush-cms on a test Mac"],
      ["token.revoked", "github:owner", "hush-seo"],
    ]);
    expect(recent[1]!.tokenId).toBe(token.id);

    const refused = async (change: () => PromiseLike<unknown>) => { try { await change(); return "changed"; } catch (error) { return String((error as { cause?: unknown }).cause ?? error); } };
    expect(await refused(() => database.db.update(auditLog).set({ actor: "someone else" }))).toMatch(/append-only/);
    expect(await refused(() => database.db.delete(auditLog))).toMatch(/append-only/);
    expect(await refused(() => database.db.execute(sql`truncate audit_log`))).toMatch(/append-only/);
  });

  test("CMS-AUDIT-004 only the owner reads the log, a page at a time without gaps or repeats", async () => {
    const agent = await createToken(database.db, { name: "reader", scopes: ["posts:read", "posts:write", "posts:publish"] }, systemActor("test"));
    expect((await call("GET", "/v1/audit", agent)).status).toBe(403);
    expect((await call("GET", "/v1/audit", "none")).status).toBe(401);
    const all = (await call("GET", "/v1/audit?limit=100", owner)).body.entries as Array<{ id: string }>;
    const paged: string[] = [];
    let cursor: string | null = null;
    do {
      const { body: page } = await call("GET", `/v1/audit?limit=3${cursor ? `&cursor=${cursor}` : ""}`, owner);
      paged.push(...page.entries.map((entry: { id: string }) => entry.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(paged).toEqual(all.map((entry) => entry.id));
    expect(all.length).toBeGreaterThan(6);
    // Filtered by area, as History's filter does.
    const access = (await call("GET", "/v1/audit?area=access&limit=100", owner)).body.entries as Array<{ action: string }>;
    const postEntries = (await call("GET", "/v1/audit?area=posts&limit=100", owner)).body.entries as Array<{ action: string }>;
    expect(access.length && access.every((entry) => !entry.action.startsWith("post."))).toBeTruthy();
    expect(postEntries.length && postEntries.every((entry) => entry.action.startsWith("post."))).toBeTruthy();
    expect(access.length + postEntries.length).toBe(all.length);
  });
});
