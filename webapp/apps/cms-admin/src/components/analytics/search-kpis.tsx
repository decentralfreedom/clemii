// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// A post's or the site's Google Search numbers as Ghost's KPI tabs over its area chart
// (apps/admin/src/posts/analytics/web/components/kpis.tsx): each tab shows a
// total and its change from the period before; the chosen one is charted.
// Changes come from the CMS, which gives them only for valid comparisons
// (search/analytics.ts); without one the badge stays hidden.
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PostSearch, SiteSearch } from "@/api/cms.generated";
import { Card, CardContent } from "@/components/ui/card";
import { GhAreaChart } from "@/components/ui/gh-chart";
import { KpiDropdownButton, KpiTabTrigger, KpiTabValue } from "@/components/ui/kpi-tabs";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { formatMetric, metricLabels, pointOf, searchSeries, spanOf, type SearchMetric } from "@/lib/search-chart";

const colors: Record<SearchMetric, string> = {
  impressions: "var(--chart-blue)", clicks: "var(--chart-green)", ctr: "var(--chart-orange)", position: "var(--chart-darkblue)",
};

/** A post's or the whole site's numbers over a range the CMS has: totals, the valid change, and the days. */
export type SearchNumbers = Pick<PostSearch | SiteSearch, "totals" | "previous" | "change" | "days" | "preliminaryFrom"> & { from: string; to: string };

type Diff = { direction: "up" | "down" | "same" | "hidden"; value?: string; tooltip?: string };

const percent = (value: number) => `${value > 0 ? "+" : ""}${(value * 100).toFixed(0)}%`;

/** The badge for a metric: up means better, so a lower position shows as an improvement. */
function diffOf(metric: SearchMetric, search: SearchNumbers): Diff {
  const { change, previous } = search;
  if (!change || !previous) return { direction: "hidden" };
  const before = formatMetric(metric, metric === "ctr" ? previous.totals.ctr : metric === "position" ? previous.totals.position : previous.totals[metric]);
  const tooltip = `${previous.from} to ${previous.to}: ${before}`;
  if (metric === "impressions" || metric === "clicks") {
    const value = change[metric];
    if (value === null) return { direction: "hidden" };
    return { direction: value > 0 ? "up" : value < 0 ? "down" : "same", value: percent(value), tooltip };
  }
  if (metric === "ctr") {
    const points = change.ctrPoints;
    return { direction: points > 0 ? "up" : points < 0 ? "down" : "same", value: `${points > 0 ? "+" : ""}${points.toFixed(1)} pt`, tooltip };
  }
  const ranks = change.position;
  if (ranks === null) return { direction: "hidden" };
  return {
    direction: ranks < 0 ? "up" : ranks > 0 ? "down" : "same",
    value: `${ranks > 0 ? "+" : ""}${ranks.toFixed(1)}`,
    tooltip: `${tooltip} (lower is better)`,
  };
}

export function SearchKpis({ search, id }: { search: SearchNumbers; id: string }) {
  const [metric, setMetric] = useState<SearchMetric>("impressions");
  const totals: Record<SearchMetric, number | null> = {
    impressions: search.totals.impressions, clicks: search.totals.clicks, ctr: search.totals.ctr, position: search.totals.position,
  };
  const series = searchSeries(search.days, search.from, search.to, metric);
  return (
    <Card>
      <CardContent>
        <Tabs value={metric} onValueChange={(value) => setMetric(value as SearchMetric)} variant="kpis">
          {/* As Ghost: tabs from tablet width, a menu of the metrics on a phone. */}
          <TabsList className="-mx-6 hidden grid-cols-4 md:visible! md:grid!" aria-label="Search metrics">
            {(Object.keys(metricLabels) as SearchMetric[]).map((key) => {
              const diff = diffOf(key, search);
              return (
                <KpiTabTrigger key={key} value={key} title={diff.tooltip}>
                  <KpiTabValue
                    color={colors[key]} label={metricLabels[key]} value={formatMetric(key, totals[key])}
                    diffDirection={diff.direction} diffValue={diff.value} data-testid={`kpi-${key}`}
                  />
                </KpiTabTrigger>
              );
            })}
          </TabsList>
          <DropdownMenu>
            <DropdownMenuTrigger className="md:hidden" asChild>
              <KpiDropdownButton aria-label="Choose metric">
                <KpiTabValue
                  color={colors[metric]} label={metricLabels[metric]} value={formatMetric(metric, totals[metric])}
                  diffDirection={diffOf(metric, search).direction} diffValue={diffOf(metric, search).value}
                />
              </KpiDropdownButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {(Object.keys(metricLabels) as SearchMetric[]).map((key) => (
                <DropdownMenuItem key={key} onClick={() => setMetric(key)}>{metricLabels[key]}: {formatMetric(key, totals[key])}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Tabs>
        <div className="my-4 [&_.recharts-cartesian-axis-tick-value]:fill-gray-500">
          <GhAreaChart
            id={`${id}-${metric}`} data={series} range={spanOf(search.from, search.to)} color={colors[metric]}
            yAxisReversed={metric === "position"}
            showDots={metric === "ctr" || metric === "position"}
            preliminaryFrom={search.preliminaryFrom ? pointOf(search.preliminaryFrom, search.from, search.to) : undefined}
            dataFormatter={(value) => formatMetric(metric, value)}
            className="-mb-3 aspect-auto h-[16vw] max-h-[320px] min-h-[180px] w-full"
          />
        </div>
      </CardContent>
    </Card>
  );
}
