// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Reads Google Search Console with a service account (PRD R12), following
// Google's documented server-to-server flow ("Using OAuth 2.0 for Server to
// Server Applications", HTTP/REST): a JWT signed with the account's key is
// exchanged for an access token of at most an hour, scoped read-only. This is
// the whole of what google-auth-library's JWT client does for this case, so
// the CMS takes no dependency for it. The fetcher is injectable for tests.
//
// Numbers are read as Google's guide "Getting your performance data" advises:
// web search (the report's default), one day per request, every page of rows.
// The API returns at most 50,000 rows per day, the top ones by clicks, so a
// request over many days could leave rows out where single days would not.
import { createSign } from "node:crypto";
import type { SearchConsoleConfig } from "../config";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const scope = "https://www.googleapis.com/auth/webmasters.readonly";
const api = "https://searchconsole.googleapis.com/webmasters/v3";
/** Search Console answers at most this many rows per request (searchanalytics.query). */
const pageRows = 25_000;

export type SearchRow = { page: string; date: string; impressions: number; clicks: number; position: number };
/** A search query's numbers on a page and day; Google leaves out rare queries to protect searchers' privacy. */
export type QueryRow = SearchRow & { query: string };

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function searchConsoleClient(config: SearchConsoleConfig, fetcher: Fetch = fetch) {
  let token: { value: string; expires: number } | undefined;

  async function accessToken() {
    if (token && token.expires - Date.now() > 60_000) return token.value;
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(JSON.stringify({ iss: config.key.clientEmail, scope, aud: config.key.tokenUri, iat: now, exp: now + 3600 }));
    const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(config.key.privateKey);
    const response = await fetcher(config.key.tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${base64url(signature)}` }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !body.access_token) throw new Error(`Google refused the service account (${response.status} ${body.error ?? ""})`.trim());
    token = { value: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function call(path: string, init: RequestInit = {}) {
    const response = await fetcher(`${api}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Search Console answered ${response.status} for ${path.split("?")[0]}`);
    return response.json() as Promise<Record<string, unknown>>;
  }

  type Row = { keys: string[]; impressions: number; clicks: number; position: number };
  /** searchAnalytics.query for one day over the given dimensions, every page of rows. */
  async function queryDay(day: string, dimensions: string[], aggregationType?: "byProperty") {
    const rows: Row[] = [];
    for (let startRow = 0; ; startRow += pageRows) {
      const body = await call(`/sites/${encodeURIComponent(config.site)}/searchAnalytics/query`, {
        method: "POST",
        body: JSON.stringify({ startDate: day, endDate: day, dimensions, type: "web", dataState: "all", rowLimit: pageRows, startRow, ...(aggregationType ? { aggregationType } : {}) }),
      }) as { rows?: Row[] };
      const page = body.rows ?? [];
      rows.push(...page.map(({ keys, impressions, clicks, position }) => ({ keys, impressions, clicks, position })));
      if (page.length < pageRows) return rows;
    }
  }

  /** Every day from start to end (YYYY-MM-DD, inclusive), a few days at a time. */
  async function query(start: string, end: string, dimensions: string[], aggregationType?: "byProperty") {
    const days: string[] = [];
    for (let time = Date.parse(start); time <= Date.parse(end); time += 86_400_000) days.push(new Date(time).toISOString().slice(0, 10));
    const rows: Row[] = [];
    for (let offset = 0; offset < days.length; offset += 4) {
      for (const dayRows of await Promise.all(days.slice(offset, offset + 4).map((day) => queryDay(day, dimensions, aggregationType)))) rows.push(...dayRows);
    }
    return rows;
  }

  return {
    /** Whether the account can read the configured property. */
    async canRead() {
      const { siteEntry = [] } = await call("/sites") as { siteEntry?: Array<{ siteUrl: string }> };
      return siteEntry.some((entry) => entry.siteUrl === config.site);
    },

    /**
     * Every page's numbers per day from start to end (YYYY-MM-DD, inclusive),
     * fresh data included (dataState all: a later import replaces it once
     * final), a page of rows at a time.
     */
    async pageDays(start: string, end: string): Promise<SearchRow[]> {
      return (await query(start, end, ["page", "date"])).map(({ keys: [page, date], ...numbers }) => ({ page: page!, date: date!, ...numbers }));
    },

    /**
     * The whole property's numbers per day, aggregated by property: Google's
     * site totals, which per-page numbers do not add up to ("For accurate
     * counts, you must omit the page and query dimensions").
     */
    async siteDays(start: string, end: string): Promise<Array<Omit<SearchRow, "page">>> {
      return (await query(start, end, ["date"], "byProperty")).map(({ keys: [date], ...numbers }) => ({ date: date!, ...numbers }));
    },

    /** The same, per search query as well. */
    async pageQueryDays(start: string, end: string): Promise<QueryRow[]> {
      return (await query(start, end, ["page", "query", "date"]))
        .map(({ keys: [page, searchQuery, date], ...numbers }) => ({ page: page!, query: searchQuery!, date: date!, ...numbers }));
    },
  };
}

export type SearchConsoleClient = ReturnType<typeof searchConsoleClient>;
