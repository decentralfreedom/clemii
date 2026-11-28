// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Clemens Kressmann
//
// The public origin of the site, its one source: canonical links, hreflang,
// the sitemap, robots.txt, the feeds, structured data and shared links all
// derive from it. The server's CLEMII_PUBLIC_BASE_URL may differ (a staging
// host serves pages whose canonical links name the real site). Moving the site
// to another domain changes this line and production's CLEMII_PUBLIC_BASE_URL. Its own module, free of the generated blog data, so the blog
// generator can use it before that data exists.
export const siteOrigin = "https://clemii.com";
