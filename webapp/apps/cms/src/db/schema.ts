// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Normalised to third normal form. Posts follow Ghost's lifecycle: draft,
// scheduled (published_at in the future) and published. A post row holds only
// what an author writes; the HTML rendered when it goes live is derived data
// and lives in post_renditions. Two JSON columns are deliberate: a revision's
// snapshot is an immutable historical record and a rendition's table of
// contents is a value of the rendered document; neither is queried inside.
// Authors and clusters are ids validated against @hush/article.
import type { TocEntry } from "@hush/article";
import { relations, sql } from "drizzle-orm";
import { bigint, boolean, check, date, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const postStatus = pgEnum("post_status", ["draft", "scheduled", "published"]);
export const tokenScope = pgEnum("token_scope", ["posts:read", "posts:write", "posts:publish"]);

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  lang: text("lang").notNull(),
  slug: text("slug").notNull(),
  status: postStatus("status").notNull().default("draft"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  keyword: text("keyword").notNull(),
  type: text("type").notNull(),
  cluster: text("cluster").notNull(),
  author: text("author").notNull(),
  imageAlt: text("image_alt").notNull(),
  markdown: text("markdown").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("posts_lang_slug").on(table.lang, table.slug),
  index("posts_status_published_at").on(table.status, table.publishedAt),
]);

export const postSecondaryKeywords = pgTable("post_secondary_keywords", {
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  position: smallint("position").notNull(),
  keyword: text("keyword").notNull(),
}, (table) => [primaryKey({ columns: [table.postId, table.position] })]);

/**
 * Images a post's Markdown references as media/<slug>/<name>. The original is
 * stored once under originals/<sha256>; its WebP renditions are written when the
 * post goes live.
 */
export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("media_post_name").on(table.postId, table.name)]);

/** What a scheduled or published post renders to, after passing the article contract. */
export const postRenditions = pgTable("post_renditions", {
  postId: uuid("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),
  heading: text("heading").notNull(),
  html: text("html").notNull(),
  toc: jsonb("toc").$type<TocEntry[]>().notNull(),
  readingMinutes: integer("reading_minutes").notNull(),
  renderedAt: timestamp("rendered_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every save and status change, so any earlier version can be restored; a run of autosaves counts as one save. */
export const postRevisions = pgTable("post_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  status: postStatus("status").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  actor: text("actor").notNull(),
  /** Written by the editor's autosave: later autosaves of the same run replace it (posts/service.ts). */
  autosave: boolean("autosave").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("post_revisions_post_created").on(table.postId, table.createdAt)]);

/**
 * What the website shows, as a revision number. Every change to a public page
 * (publish, live edit, unpublish, a due post) takes the next revision in its
 * post's transaction; the export carries the revision it reflects and the
 * built site serves it back. One row; updating it serialises revisions in
 * commit order. The rest of the row is the deploy loop's own state.
 */
export const siteState = pgTable("site_state", {
  id: smallint("id").primaryKey().default(1),
  revision: bigint("revision", { mode: "number" }).notNull().default(0),
  /** Highest revision whose pages search engines were told about. */
  notifiedRevision: bigint("notified_revision", { mode: "number" }).notNull().default(0),
  /** The revision the last requested deploy is meant to make live, and when it was asked for. */
  deployRevision: bigint("deploy_revision", { mode: "number" }),
  deployRequestedAt: timestamp("deploy_requested_at", { withTimezone: true }),
}, (table) => [check("site_state_single_row", sql`${table.id} = 1`)]);

/** The public pages each site revision changed. */
export const siteChanges = pgTable("site_changes", {
  revision: bigint("revision", { mode: "number" }).notNull(),
  path: text("path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.revision, table.path] })]);

/**
 * Admin sign-ins through GitHub. The cookie holds a random token; only its
 * SHA-256 hash is stored, as for API tokens. The GitHub user id is the
 * identity (logins can be renamed); the login is kept for revisions and the UI.
 */
export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  githubUserId: bigint("github_user_id", { mode: "number" }).notNull(),
  githubLogin: text("github_login").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
}, (table) => [index("admin_sessions_expires").on(table.expiresAt)]);

/** Bearer tokens for agents and scripts. Only a SHA-256 hash is stored. */
export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/**
 * A sign-in of the CLI through the OAuth 2.0 Device Authorization Grant
 * (RFC 8628, auth/device.ts): the CLI polls with the device code, the owner
 * approves or denies the user code in the admin, and the first poll after an
 * approval receives a new token, once.
 */
export const deviceAuthorizations = pgTable("device_authorizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceCodeHash: text("device_code_hash").notNull().unique(),
  userCode: text("user_code").notNull().unique(),
  clientName: text("client_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  decidedBy: text("decided_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  deniedAt: timestamp("denied_at", { withTimezone: true }),
  tokenId: uuid("token_id").references(() => apiTokens.id, { onDelete: "set null" }),
});

export const apiTokenScopes = pgTable("api_token_scopes", {
  tokenId: uuid("token_id").notNull().references(() => apiTokens.id, { onDelete: "cascade" }),
  scope: tokenScope("scope").notNull(),
}, (table) => [primaryKey({ columns: [table.tokenId, table.scope] })]);

/**
 * The owner's approval of a post for an agent to schedule or publish it. It
 * names the content it covers by hash (posts/approval.ts), so any later change
 * to the text or an image leaves it lapsed; one row per post, replaced on
 * every approval.
 */
export const postApprovals = pgTable("post_approvals", {
  postId: uuid("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),
  contentHash: text("content_hash").notNull(),
  approvedBy: text("approved_by").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditAction = pgEnum("audit_action", [
  "post.created", "post.edited", "post.image_uploaded", "post.scheduled", "post.published", "post.unpublished", "post.approved", "post.deleted",
  "token.created", "token.revoked", "device.approved", "device.denied", "owner.signed_in",
]);

/**
 * Who or which token changed what, and when (PRD R13), written in the
 * transaction of the change. Append-only: a trigger refuses updates and deletes
 * (migration 0008). Posts, tokens and revisions are named by id without a
 * foreign key, so a deleted draft keeps its history; `subject` is the post's
 * title or the token's name at that moment, a historical record like a
 * revision's snapshot. The actor's name is what revisions show; the token or
 * GitHub id tells two tokens of one name, or a renamed login, apart.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  action: auditAction("action").notNull(),
  actor: text("actor").notNull(),
  actorTokenId: uuid("actor_token_id"),
  actorGithubUserId: bigint("actor_github_user_id", { mode: "number" }),
  postId: uuid("post_id"),
  tokenId: uuid("token_id"),
  revisionId: uuid("revision_id"),
  subject: text("subject").notNull(),
}, (table) => [
  index("audit_log_at").on(table.at, table.id),
  index("audit_log_post_at").on(table.postId, table.at),
]);

/**
 * Google Search Console numbers per post and day (PRD R12), as the property
 * reports them for the post's page, at any address it has had. `date` is
 * Search Console's day, in US Pacific time; Umami's days are UTC. `position`
 * is the average position weighted by impressions, so combine days by
 * weighting it by impressions, never by averaging averages. Search Console
 * aggregates by page, so the sum over posts is not the site's total.
 */
export const searchDaily = pgTable("search_daily", {
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  impressions: integer("impressions").notNull(),
  clicks: integer("clicks").notNull(),
  position: doublePrecision("position").notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.date] }),
  // The dashboard and the import read and replace whole days across all posts.
  index("search_daily_date").on(table.date),
]);

/**
 * The search queries a post was found for, per day (PRD R12), with the same
 * rules as search_daily. Google leaves out rare queries to protect searchers'
 * privacy, so a post's queries add up to less than its page numbers.
 */
export const searchQueries = pgTable("search_queries", {
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  query: text("query").notNull(),
  impressions: integer("impressions").notNull(),
  clicks: integer("clicks").notNull(),
  position: doublePrecision("position").notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.date, table.query] }),
  index("search_queries_date").on(table.date),
]);

/**
 * The whole property's Search Console numbers per day (PRD R12, the
 * dashboard), aggregated by property as Google totals a site: home, release
 * and blog pages together, and not the sum of search_daily, which Google
 * aggregates by page. Days as in search_daily (US Pacific).
 */
export const searchSiteDaily = pgTable("search_site_daily", {
  date: date("date", { mode: "string" }).primaryKey(),
  impressions: integer("impressions").notNull(),
  clicks: integer("clicks").notNull(),
  position: doublePrecision("position").notNull(),
});

/**
 * Umami's page views and downloads per post and US Pacific day (PRD R11), a
 * post's pages at every address it has had summed; downloads are counted on
 * the page they started from. Unique visitors are not kept: summed over days
 * they would count a person once a day.
 */
export const trafficDaily = pgTable("traffic_daily", {
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  pageviews: integer("pageviews").notNull(),
  downloads: integer("downloads").notNull(),
}, (table) => [primaryKey({ columns: [table.postId, table.date] }), index("traffic_daily_date").on(table.date)]);

/** The whole site's page views and downloads per day: every page, the home and release pages too. */
export const trafficSiteDaily = pgTable("traffic_site_daily", {
  date: date("date", { mode: "string" }).primaryKey(),
  pageviews: integer("pageviews").notNull(),
  downloads: integer("downloads").notNull(),
});

/**
 * Page views and tagged downloads per page, day and source (PRD: traffic
 * sources and channels): every page of the site, not only posts. `source` is
 * the link's utm_source when it has one, else the referring domain ("" for
 * none); medium, campaign and content are the link's tags ("" without). A
 * download counts here only when its link was tagged: an untagged download's
 * source is unknown, and it stays counted per page in traffic_daily.
 */
export const trafficSourceDaily = pgTable("traffic_source_daily", {
  date: date("date", { mode: "string" }).notNull(),
  path: text("path").notNull(),
  postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
  pageType: text("page_type").notNull(),
  channel: text("channel").notNull(),
  source: text("source").notNull(),
  medium: text("medium").notNull(),
  campaign: text("campaign").notNull(),
  content: text("content").notNull(),
  pageviews: integer("pageviews").notNull(),
  downloads: integer("downloads").notNull(),
}, (table) => [
  primaryKey({ columns: [table.date, table.path, table.channel, table.source, table.medium, table.campaign, table.content] }),
  index("traffic_source_daily_post").on(table.postId, table.date),
]);

/** The Umami import's state, one row. */
export const trafficState = pgTable("traffic_state", {
  id: smallint("id").primaryKey().default(1),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }),
  importedAt: timestamp("imported_at", { withTimezone: true }),
  /** The first day Umami has, its website's creation: before it there are no numbers, which is not zero. */
  importedFrom: date("imported_from", { mode: "string" }),
  /** The last complete day imported. */
  importedThrough: date("imported_through", { mode: "string" }),
}, (table) => [check("traffic_state_single_row", sql`${table.id} = 1`)]);

/** The Search Console import's own state, one row: a failing import retries hourly, not every minute. */
export const searchConsoleState = pgTable("search_console_state", {
  id: smallint("id").primaryKey().default(1),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }),
  importedAt: timestamp("imported_at", { withTimezone: true }),
  /** The first day the import covers: there are no numbers before it, which is not the same as zero. */
  importedFrom: date("imported_from", { mode: "string" }),
  /** The last day the import has numbers for (Search Console lags two to three days). */
  importedThrough: date("imported_through", { mode: "string" }),
  /** The first day Google was still counting at the last import: numbers from it on are preliminary. Null when all were final. */
  incompleteFrom: date("incomplete_from", { mode: "string" }),
}, (table) => [check("search_console_state_single_row", sql`${table.id} = 1`)]);

export const postRelations = relations(posts, ({ many, one }) => ({
  secondaryKeywords: many(postSecondaryKeywords),
  media: many(media),
  rendition: one(postRenditions, { fields: [posts.id], references: [postRenditions.postId] }),
  approval: one(postApprovals, { fields: [posts.id], references: [postApprovals.postId] }),
}));
export const mediaRelations = relations(media, ({ one }) => ({
  post: one(posts, { fields: [media.postId], references: [posts.id] }),
}));
export const postSecondaryKeywordRelations = relations(postSecondaryKeywords, ({ one }) => ({
  post: one(posts, { fields: [postSecondaryKeywords.postId], references: [posts.id] }),
}));
