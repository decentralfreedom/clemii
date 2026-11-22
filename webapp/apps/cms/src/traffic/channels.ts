// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Which channel a visit came through, and which type of page it landed on
// (PRD: traffic sources and channels). The rules and domain lists are
// Umami 3.5.0's (src/lib/constants.ts, src/queries/sql/getChannelMetrics.ts,
// MIT License, Copyright (c) 2020 Mike Cao), so the CMS's channels reconcile
// with Umami's own Channels report, with one change: tags on our own links
// come first. Umami recognises social traffic only by the referring site, so
// a tagged Reddit link opened in the Reddit app, which sends no referrer,
// would otherwise count as direct.

export const channels = ["direct", "ai", "organicSearch", "paidSearch", "organicSocial", "paidSocial", "email", "video", "referral", "paid", "other"] as const;
export type Channel = (typeof channels)[number];

export const pageTypes = ["home", "post", "release", "other"] as const;
export type PageType = (typeof pageTypes)[number];

/** A visit's source as Umami records it: the referring domain and the link's campaign tags. */
export type VisitSource = { referrer: string | null; utmSource: string | null; utmMedium: string | null };

const socialDomains = ["bsky.app", "facebook.com", "fb.com", "ig.com", "instagram.com", "linkedin.", "news.ycombinator.com", "pinterest.", "reddit.", "snapchat.", "t.co", "threads.net", "tiktok.", "twitter.com", "x.com"];
const searchDomains = ["baidu.com", "bing.com", "duckduckgo.com", "ecosia.org", "google.", "msn.com", "search.brave.com", "yandex."];
const aiDomains = ["chatgpt.com", "claude.ai", "copilot.microsoft.com", "gemini.google.com", "meta.ai", "perplexity.ai"];
const emailDomains = ["gmail.", "hotmail.", "mail.yahoo.", "outlook.", "proton.me", "protonmail."];
const videoDomains = ["twitch.", "youtube."];

/** Umami matches a list entry anywhere in the domain (SQL LIKE '%entry%'). */
const matches = (domain: string, list: string[]) => list.some((entry) => domain.includes(entry));

/** Our own links' medium, as the CMS's link builder sets it (utm_medium). */
function fromTags(medium: string, paid: boolean): Channel | undefined {
  if (paid) return medium.includes("social") ? "paidSocial" : medium === "cpc" || medium.includes("search") ? "paidSearch" : "paid";
  if (medium === "social" || medium.includes("social")) return "organicSocial";
  if (medium.includes("mail")) return "email";
  if (medium === "referral" || medium === "app" || medium === "link") return "referral";
  if (medium.includes("organic")) return "organicSearch";
  if (medium.includes("video")) return "video";
  return undefined;
}

export function channelOf({ referrer, utmSource, utmMedium }: VisitSource): Channel {
  const domain = (referrer ?? "").toLowerCase();
  const medium = (utmMedium ?? "").toLowerCase();
  // Umami: a medium starting with "p" or containing "paid" (cpc, ppc, paid_social) is paid.
  const paid = medium.startsWith("p") || medium.includes("paid") || medium === "cpc";
  const tagged = medium && fromTags(medium, paid);
  if (tagged) return tagged;
  if (!domain && !utmSource) return "direct";
  if (matches(domain, aiDomains)) return "ai";
  if (matches(domain, searchDomains)) return paid ? "paidSearch" : "organicSearch";
  if (matches(domain, socialDomains)) return paid ? "paidSocial" : "organicSocial";
  if (matches(domain, emailDomains)) return "email";
  if (matches(domain, videoDomains)) return "video";
  if (domain) return "referral";
  // Tagged with a source but a medium no rule knows: shown, but not guessed into a channel.
  return "other";
}

/** The page type of a path: posts at any address a post has had, from the post index. */
export function pageTypeOf(path: string, isPost: boolean): PageType {
  if (isPost) return "post";
  if (path === "/" || path === "/de") return "home";
  if (/^\/(de\/)?releases(\/|$)/.test(path)) return "release";
  return "other";
}
