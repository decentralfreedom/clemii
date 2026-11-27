// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann

/**
 * A phone or tablet by its User-Agent: it gets the Mac handoff, never the Mac installer. The page
 * also treats an iPad that presents itself as a Mac (touch on "MacIntel") as one; only the browser
 * can tell that, so the server sees such an iPad as a Mac.
 */
export const mobileUserAgent = /Android|iPhone|iPad|iPod/i;
