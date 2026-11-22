// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Ghost Admin's analytics date ranges (apps/admin/src/shared/analytics/
// constants.ts) without "Today", which Search Console's two to three day lag
// leaves empty. "Year to date" and "All time" start on a day; the CMS clamps
// every range to the days it has numbers for.
import type { GetPostSearchParams } from "@/api/cms.generated";

export const analyticsRanges = [
  { key: "7", label: "Last 7 days", params: (): GetPostSearchParams => ({ days: 7 }) },
  { key: "30", label: "Last 30 days", params: (): GetPostSearchParams => ({ days: 30 }) },
  { key: "90", label: "Last 90 days", params: (): GetPostSearchParams => ({ days: 90 }) },
  { key: "ytd", label: "Year to date", params: (): GetPostSearchParams => ({ since: `${new Date().getFullYear()}-01-01` }) },
  { key: "365", label: "Last 12 months", params: (): GetPostSearchParams => ({ days: 365 }) },
  { key: "all", label: "All time", params: (): GetPostSearchParams => ({ since: "2000-01-01" }) },
] as const;

export type AnalyticsRangeKey = (typeof analyticsRanges)[number]["key"];
// Ninety days in weekly points: the blog's few daily readers make single days noise.
export const defaultAnalyticsRange: AnalyticsRangeKey = "90";

export const isAnalyticsRange = (value: unknown): value is AnalyticsRangeKey =>
  analyticsRanges.some((range) => range.key === value);

export const rangeParams = (key: AnalyticsRangeKey) => analyticsRanges.find((range) => range.key === key)!.params();
