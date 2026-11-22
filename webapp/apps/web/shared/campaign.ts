// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Campaign tags (UTM) on links to this site, for the traffic sources the CMS
// shows (PRD: traffic sources and channels). Used by the server, which sends
// them with page views and downloads, and by download buttons, which pass a
// page's tags on to /download.
/** The campaign tags Umami reads from a page's address; every other query parameter is dropped. */
const campaignTags = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/**
 * A link's campaign tags as a query string ("" without any), so Umami can
 * tell a newsletter or a partner from direct traffic. Tags describe the link,
 * not the person; ad click ids (gclid, fbclid, ...) identify one click and are
 * never kept. Values are trimmed to 100 printable characters.
 */
export function campaignOf(address: string) {
  let params: URLSearchParams;
  try {
    params = new URL(address, "https://site.invalid").searchParams;
  } catch {
    return "";
  }
  const kept = new URLSearchParams();
  for (const tag of campaignTags) {
    const value = params.get(tag)?.replace(/[^\p{L}\p{N} ._~+-]/gu, "").trim().slice(0, 100);
    if (value) kept.set(tag, value);
  }
  const query = kept.toString();
  return query ? `?${query}` : "";
}
