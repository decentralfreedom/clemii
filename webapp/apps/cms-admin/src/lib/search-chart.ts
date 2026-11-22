// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// A post's Search Console days as a chart series for GhAreaChart, with only
// valid points. Days in the range without a row had no impressions: their
// impressions and clicks are 0, but their CTR and position do not exist and
// stay empty (null), never 0. Long ranges are grouped by week (from 90 days)
// or month (from 365), as Ghost's charts are; a group's CTR is its clicks over
// its impressions and its position is weighted by impressions, never an
// average of daily values.
import type { SearchDay } from "@/api/cms.generated";

export type SearchMetric = "impressions" | "clicks" | "ctr" | "position";
export type SearchPoint = { date: string; value: number | null; formattedValue: string; label: string };

const dayMs = 86_400_000;
const integer = new Intl.NumberFormat("en");

export const metricLabels: Record<SearchMetric, string> = { impressions: "Impressions", clicks: "Clicks", ctr: "CTR", position: "Avg. position" };

export function formatMetric(metric: SearchMetric, value: number | null) {
  if (value === null) return "–";
  if (metric === "ctr") return `${(value * 100).toFixed(1)}%`;
  if (metric === "position") return value.toFixed(1);
  return integer.format(value);
}

const bucketOf = (date: string, from: string, span: number) => {
  if (span >= 365) return `${date.slice(0, 7)}-01`;
  if (span >= 90) return new Date(Date.parse(from) + Math.floor((Date.parse(date) - Date.parse(from)) / (7 * dayMs)) * 7 * dayMs).toISOString().slice(0, 10);
  return date;
};

/** The point a day falls in on the chart of from..to (a day, week or month). */
export const pointOf = (date: string, from: string, to: string) => bucketOf(date, from, spanOf(from, to));

/** The range's length in days, inclusive. */
export const spanOf = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / dayMs) + 1;

export function searchSeries(days: SearchDay[], from: string, to: string, metric: SearchMetric): SearchPoint[] {
  const span = spanOf(from, to);
  const byDay = new Map(days.map((day) => [day.date, day]));
  const groups = new Map<string, { impressions: number; clicks: number; weighted: number }>();
  for (let time = Date.parse(from); time <= Date.parse(to); time += dayMs) {
    const date = new Date(time).toISOString().slice(0, 10);
    const day = byDay.get(date);
    const key = bucketOf(date, from, span);
    const group = groups.get(key) ?? { impressions: 0, clicks: 0, weighted: 0 };
    if (day) {
      group.impressions += day.impressions;
      group.clicks += day.clicks;
      group.weighted += day.position * day.impressions;
    }
    groups.set(key, group);
  }
  return [...groups].map(([date, group]) => {
    const value = metric === "impressions" ? group.impressions
      : metric === "clicks" ? group.clicks
        : !group.impressions ? null
          : metric === "ctr" ? group.clicks / group.impressions
            : group.weighted / group.impressions;
    return { date, value, formattedValue: formatMetric(metric, value), label: metricLabels[metric] };
  });
}
