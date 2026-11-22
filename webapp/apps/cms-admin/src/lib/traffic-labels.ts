// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// How the CMS's channels read in the admin (cms
// src/traffic/channels.ts decides them).
import type { TrafficSourceRowChannel } from "@/api/cms.generated";

export const channelLabels: Record<TrafficSourceRowChannel, string> = {
  direct: "Direct",
  ai: "AI assistants",
  organicSearch: "Organic search",
  paidSearch: "Paid search",
  organicSocial: "Organic social",
  paidSocial: "Paid social",
  email: "Email",
  video: "Video",
  referral: "Referral",
  paid: "Paid, other",
  other: "Other tagged links",
};

/** What a channel holds that its name does not say. */
export const channelNotes: Partial<Record<TrafficSourceRowChannel, string>> = {
  direct: "Typed, bookmarked, or opened from an app or messenger that does not say where it came from",
  organicSearch: "All search engines; Google Search above shows Google only",
};
