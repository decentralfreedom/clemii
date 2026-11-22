// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The blog's funnel steps as chart points, grouped as the search chart groups
// (lib/search-chart.ts): days up to 30, weeks up to a year, then months. A day
// in the window without a row had none.
import type { BlogAnalyticsDaysItem } from "@/api/cms.generated";
import { bucketOf, spanOf, type SearchPoint } from "@/lib/search-chart";

export type BlogMetric = "impressions" | "clicks" | "pageviews" | "downloads";
export const blogLabels: Record<BlogMetric, string> = { impressions: "Impressions", clicks: "Google clicks", pageviews: "Page views", downloads: "Downloads" };

const dayMs = 86_400_000;
export const integer = new Intl.NumberFormat("en");

export function blogSeries(days: BlogAnalyticsDaysItem[], from: string, to: string, metric: BlogMetric): SearchPoint[] {
  const span = spanOf(from, to);
  const byDay = new Map(days.map((day) => [day.date, day[metric] ?? 0]));
  const groups = new Map<string, number>();
  for (let time = Date.parse(from); time <= Date.parse(to); time += dayMs) {
    const date = new Date(time).toISOString().slice(0, 10);
    const key = bucketOf(date, from, span);
    groups.set(key, (groups.get(key) ?? 0) + (byDay.get(date) ?? 0));
  }
  return [...groups].map(([date, value]) => ({ date, value, formattedValue: integer.format(value), label: blogLabels[metric] }));
}
