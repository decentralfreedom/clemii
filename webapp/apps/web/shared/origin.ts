// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Clemens Kressmann
//
// The public origin of the site, its one source: canonical links, hreflang,
// the sitemap, robots.txt, the feeds, structured data and shared links all
// derive from it, and the server refuses to start in production with a
// different HUSH_PUBLIC_BASE_URL. Moving the site to another domain changes
// this line. Its own module, free of the generated blog data, so the blog
// generator can use it before that data exists.
export const siteOrigin = "https://behu.sh";
