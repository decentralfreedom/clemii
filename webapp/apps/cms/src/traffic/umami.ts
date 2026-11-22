// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Reads page views and downloads from Umami (PRD R11, the funnel), as Umami
// 3.5's API answers them (checked against its source and a running 3.5.0):
// - page views per page: GET /api/websites/{id}/metrics/expanded?type=path,
//   which counts page views only (custom events are left out), paged by limit
//   and offset;
// - downloads: the website's server sends each one as a custom event named
//   "download" whose URL is the page it came from (apps/web server/analytics.ts),
//   so GET /api/websites/{id}/events?event=download, paged, grouped by page.
//   Its cost follows the number of downloads, not of posts or page views.
// A day is a US Pacific day, as Search Console's, so a post's searches, views
// and downloads line up. Umami counts unique visitors per query, so visitors
// are not read: summed over days they would count a person once a day.
import type { UmamiConfig } from "../config";
import { pacificDay } from "../search/analytics";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** What Umami counted on one page on one day. */
export type TrafficRow = { path: string; pageviews: number; downloads: number };

const pageSize = 500;
const hourMs = 3_600_000;

/** When a US Pacific day starts: 7 (PDT) or 8 (PST) hours after UTC midnight. */
function pacificMidnight(day: string) {
  const midnightUtc = Date.parse(`${day}T00:00:00.000Z`);
  return [7, 8].map((hours) => midnightUtc + hours * hourMs)
    .find((time) => pacificDay(new Date(time)) === day && pacificDay(new Date(time - 1)) !== day)!;
}

/** The first and last millisecond of a US Pacific day, daylight saving time included. */
export function pacificDayRange(day: string) {
  const next = new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
  return { startAt: pacificMidnight(day), endAt: pacificMidnight(next) - 1 };
}

export function umamiClient(config: UmamiConfig, fetcher: Fetch = fetch) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${config.apiKey}`,
    accept: "application/json",
    ...(config.access ? { "cf-access-client-id": config.access.clientId, "cf-access-client-secret": config.access.clientSecret } : {}),
  };

  async function call(path: string, params: Record<string, string | number>) {
    const query = new URLSearchParams(Object.entries(params).map(([key, value]): [string, string] => [key, String(value)]));
    const response = await fetcher(`${config.url}/api/websites/${config.websiteId}${path}?${query}`, {
      headers, redirect: "manual", signal: AbortSignal.timeout(30_000),
    });
    // Cloudflare Access answers a request without a valid service token with a redirect to its sign-in.
    if (response.status >= 300 && response.status < 400) throw new Error(`Umami redirected ${path} (a Cloudflare Access sign-in?): check CMS_UMAMI_ACCESS_CLIENT_ID`);
    if (!response.ok) throw new Error(`Umami answered ${response.status} for ${path}`);
    return response.json() as Promise<unknown>;
  }

  return {
    /** The website's creation time: Umami has nothing before it. */
    async createdAt(): Promise<Date> {
      const response = await fetcher(`${config.url}/api/websites/${config.websiteId}`, { headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Umami answered ${response.status} for the website`);
      const { createdAt } = await response.json() as { createdAt: string };
      return new Date(createdAt);
    },

    /** Every page's page views and downloads on a US Pacific day. */
    async day(day: string): Promise<TrafficRow[]> {
      const range = pacificDayRange(day);
      const rows = new Map<string, TrafficRow>();
      const row = (path: string) => rows.get(path) ?? rows.set(path, { path, pageviews: 0, downloads: 0 }).get(path)!;
      for (let offset = 0; ; offset += pageSize) {
        const page = await call("/metrics/expanded", { type: "path", limit: pageSize, offset, ...range }) as Array<{ name: string; pageviews: string | number }>;
        for (const entry of page) row(entry.name).pageviews += Number(entry.pageviews);
        if (page.length < pageSize) break;
      }
      for (let number = 1; ; number++) {
        const { data } = await call("/events", { event: "download", page: number, pageSize, ...range }) as { data: Array<{ urlPath: string; eventName: string }> };
        for (const event of data) if (event.eventName === "download") row(event.urlPath).downloads += 1;
        if (data.length < pageSize) break;
      }
      return [...rows.values()];
    },
  };
}

export type UmamiClient = ReturnType<typeof umamiClient>;
