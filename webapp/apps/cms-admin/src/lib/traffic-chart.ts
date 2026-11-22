// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Umami's page views and downloads as chart points, grouped as the search
// chart groups (lib/search-chart.ts): a day with no row had none, and the
// share of downloads per page view is computed from the sums of a point,
// never averaged over days.
import type { TrafficDay } from "@/api/cms.generated";
import { bucketOf, spanOf, type SearchPoint } from "@/lib/search-chart";

export type TrafficMetric = "pageviews" | "downloads" | "conversion";
export const trafficLabels: Record<TrafficMetric, string> = { pageviews: "Page views", downloads: "Downloads", conversion: "Downloads per page view" };

const dayMs = 86_400_000;
const integer = new Intl.NumberFormat("en");

export function formatTraffic(metric: TrafficMetric, value: number | null) {
  if (value === null) return "–";
  return metric === "conversion" ? `${(value * 100).toFixed(1)}%` : integer.format(value);
}

export function trafficSeries(days: TrafficDay[], from: string, to: string, metric: TrafficMetric): SearchPoint[] {
  const span = spanOf(from, to);
  const byDay = new Map(days.map((day) => [day.date, day]));
  const groups = new Map<string, { pageviews: number; downloads: number }>();
  for (let time = Date.parse(from); time <= Date.parse(to); time += dayMs) {
    const date = new Date(time).toISOString().slice(0, 10);
    const key = bucketOf(date, from, span);
    const group = groups.get(key) ?? { pageviews: 0, downloads: 0 };
    const day = byDay.get(date);
    if (day) { group.pageviews += day.pageviews; group.downloads += day.downloads; }
    groups.set(key, group);
  }
  return [...groups].map(([date, group]) => {
    const value = metric === "conversion" ? (group.pageviews ? group.downloads / group.pageviews : null) : group[metric];
    return { date, value, formattedValue: formatTraffic(metric, value), label: trafficLabels[metric] };
  });
}
