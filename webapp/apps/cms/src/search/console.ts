// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Reads Google Search Console with a service account (PRD R12), following
// Google's documented server-to-server flow ("Using OAuth 2.0 for Server to
// Server Applications", HTTP/REST): a JWT signed with the account's key is
// exchanged for an access token of at most an hour, scoped read-only. This is
// the whole of what google-auth-library's JWT client does for this case, so
// the CMS takes no dependency for it. The fetcher is injectable for tests.
import { createSign } from "node:crypto";
import type { SearchConsoleConfig } from "../config";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const scope = "https://www.googleapis.com/auth/webmasters.readonly";
const api = "https://searchconsole.googleapis.com/webmasters/v3";
/** Search Console answers at most this many rows per request (searchanalytics.query). */
const pageRows = 25_000;

export type SearchRow = { page: string; date: string; impressions: number; clicks: number; position: number };

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
    async pageDays(start: string, end: string) {
      const rows: SearchRow[] = [];
      for (let startRow = 0; ; startRow += pageRows) {
        const body = await call(`/sites/${encodeURIComponent(config.site)}/searchAnalytics/query`, {
          method: "POST",
          body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["page", "date"], dataState: "all", rowLimit: pageRows, startRow }),
        }) as { rows?: Array<{ keys: [string, string]; impressions: number; clicks: number; position: number }> };
        const page = body.rows ?? [];
        rows.push(...page.map(({ keys: [url, date], impressions, clicks, position }) => ({ page: url, date, impressions, clicks, position })));
        if (page.length < pageRows) return rows;
      }
    },
  };
}

export type SearchConsoleClient = ReturnType<typeof searchConsoleClient>;
