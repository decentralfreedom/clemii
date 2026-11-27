// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The blog funnel's measurements (PRD R10), counted only on this server, where
// an ad blocker cannot hide them and no script runs in the browser, so no
// consent banner is needed: page views of real navigations, and downloads at
// /download. Every event carries the browser's User-Agent (Umami ignores bots
// by it) and the address shortened to its network (coarseAddress), so Umami
// can tell the country, region or city, and the full address never leaves
// this server. There is no browser tracker: it would count each page view and
// download a second time.
import { isIPv4, isIPv6 } from "node:net";
import type { Env, Hono } from "hono";
import type { ServerConfig } from "./config";
import { campaignOf } from "../shared/campaign";
import { mobileUserAgent } from "../shared/devices";
import { RateLimitStore, clientKey } from "./http/rate-limiter";

export type Analytics = NonNullable<ServerConfig["analytics"]>;
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

// A page's path on this site, as download buttons send it; anything else is not recorded.
const pagePath = /^\/[A-Za-z0-9._~/-]{0,200}$/;

/** Whether the browser asks not to be tracked (Do Not Track or Global Privacy Control). */
const declinesTracking = (headers: Headers) => headers.get("dnt") === "1" || headers.get("sec-gpc") === "1";

/**
 * An IP address without its host part: the last octet of an IPv4 address, all
 * but the first 48 bits of an IPv6 one. Enough for a location no finer than a
 * city, as the CNIL's audience measurement exemption allows, never the device.
 */
export function coarseAddress(address: string | undefined) {
  if (!address) return undefined;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (isIPv4(mapped ?? address)) return (mapped ?? address).replace(/\.\d+$/, ".0");
  if (!isIPv6(address)) return undefined;
  const [head = "", tail = ""] = address.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = address.includes("::") ? [...front, ...Array(8 - front.length - back.length).fill("0"), ...back] : front;
  return `${groups.slice(0, 3).map((group) => group.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::`;
}

export function registerAnalytics<E extends Env>(app: Hono<E>, input: {
  analytics?: Analytics;
  publicBaseUrl: string;
  /** The exact immutable DMG of the latest release, or none while the catalog is empty. */
  downloadURL?: string;
  fetcher?: Fetch;
  log?: (message: string) => void;
}) {
  const fetcher = input.fetcher ?? fetch;
  const log = input.log ?? ((message: string) => console.warn(JSON.stringify({ level: "warn", message })));
  const hostname = new URL(input.publicBaseUrl).hostname;
  // The download always works; a client repeating it is counted a few times a minute at most.
  const counted = new RateLimitStore({ windowMs: 60_000, limit: 5 });

  // A page view is a browser loading a page for a person: a top-level
  // navigation (Fetch Metadata, sent by every browser since 2023), not a
  // prefetch or prerender the person may never see, answered with a page.
  // Umami drops known bots by their User-Agent.
  const viewed = new RateLimitStore({ windowMs: 60_000, limit: 60 });
  if (input.analytics) {
    const views = input.analytics;
    app.use("*", async (context, next) => {
      await next();
      const headers = context.req.raw.headers;
      if (context.req.method !== "GET" || context.res.status !== 200) return;
      if (!context.res.headers.get("content-type")?.startsWith("text/html")) return;
      if (headers.get("sec-fetch-dest") !== "document" || headers.has("sec-purpose") || headers.has("purpose")) return;
      if (declinesTracking(headers) || !viewed.consume(clientKey(context)).allowed) return;
      void send(fetcher, views, {
        type: "event",
        payload: {
          website: views.websiteId, hostname, url: `${context.req.path}${campaignOf(context.req.url)}`,
          referrer: referrerOf(headers.get("referer")), language: languageOf(headers.get("accept-language")),
          ip: coarseAddress(context.req.header("cf-connecting-ip")),
        },
      }, context.req.header("user-agent") ?? "").then(
        (response) => { if (!response.ok) log(`Umami refused a page view: ${response.status}`); },
        (error: unknown) => log(`Umami unreachable for a page view: ${String(error)}`),
      );
    });
  }

  app.get("/download", (context) => {
    context.header("cache-control", "no-store");
    context.header("x-robots-tag", "noindex, nofollow");
    if (!input.downloadURL) return context.redirect("/releases", 302);
    const from = context.req.query("from");
    // A phone that taps before the page's script has offered the Mac handoff gets no Mac installer:
    // back to its page, where the button now offers the handoff. Not a download, so not counted.
    if (mobileUserAgent.test(context.req.header("user-agent") ?? "")) return context.redirect(from && pagePath.test(from) ? from : "/", 302);
    const { analytics } = input;
    if (analytics && !declinesTracking(context.req.raw.headers) && counted.consume(clientKey(context)).allowed) {
      // Never delays the download: the event is sent after the redirect, and a failure is only logged.
      void send(fetcher, analytics, {
        type: "event",
        payload: {
          website: analytics.websiteId, hostname, url: `${from && pagePath.test(from) ? from : "/download"}${campaignOf(context.req.url)}`, name: "download",
          // Set by Cloudflare in front of this server; a client cannot choose it.
          ip: coarseAddress(context.req.header("cf-connecting-ip")),
        },
      }, context.req.header("user-agent") ?? "").then(
        (response) => { if (!response.ok) log(`Umami refused a download event: ${response.status}`); },
        (error: unknown) => log(`Umami unreachable for a download event: ${String(error)}`),
      );
    }
    return context.redirect(input.downloadURL, 302);
  });
}

/** Where the visitor came from, without its query or fragment; browsers send only the origin of another site. */
function referrerOf(referer: string | null) {
  if (!referer) return undefined;
  try {
    const url = new URL(referer);
    return url.protocol === "https:" || url.protocol === "http:" ? `${url.origin}${url.pathname}` : undefined;
  } catch {
    return undefined;
  }
}

/** The browser's first preferred language, in the form Umami records. */
function languageOf(acceptLanguage: string | null) {
  const first = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim();
  return first && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(first) ? first : undefined;
}

function send(fetcher: Fetch, analytics: Analytics, event: object, userAgent: string) {
  return fetcher(`${analytics.umamiUrl}/api/send`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": userAgent },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5_000),
  });
}
