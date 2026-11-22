// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The Overview's headline numbers, as Ghost's Analytics overview: a few
// numbers that say how the site is doing, each a tab over one chart. Page
// views and downloads come from Umami, Google clicks from Search Console,
// each over its own days (Search Console lags), which the page footnote names.
import { useState } from "react";
import type { SiteSearch, Traffic } from "@/api/cms.generated";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { GhAreaChart } from "@/components/ui/gh-chart";
import { KpiDropdownButton, KpiTabTrigger, KpiTabValue } from "@/components/ui/kpi-tabs";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { formatMetric, searchSeries, spanOf } from "@/lib/search-chart";
import { formatTraffic, trafficSeries } from "@/lib/traffic-chart";

type Key = "pageviews" | "downloads" | "clicks" | "conversion";
const colors: Record<Key, string> = { pageviews: "var(--chart-blue)", downloads: "var(--chart-green)", clicks: "var(--chart-orange)", conversion: "var(--chart-darkblue)" };

export function OverviewKpis({ traffic, search }: { traffic?: Traffic; search?: SiteSearch }) {
  const [metric, setMetric] = useState<Key>("pageviews");
  const visits = traffic?.from && traffic.to ? { ...traffic, from: traffic.from, to: traffic.to } : undefined;
  const google = search?.from && search.to ? { ...search, from: search.from, to: search.to } : undefined;
  const conversion = visits && visits.totals.pageviews ? visits.totals.downloads / visits.totals.pageviews : null;
  const clicksChange = google?.change?.clicks;
  const tiles: Array<{ key: Key; label: string; value: string; available: boolean; diff?: { direction: "up" | "down" | "same"; value: string } }> = [
    { key: "pageviews", label: "Page views", value: visits ? formatTraffic("pageviews", visits.totals.pageviews) : "–", available: Boolean(visits) },
    { key: "downloads", label: "Downloads", value: visits ? formatTraffic("downloads", visits.totals.downloads) : "–", available: Boolean(visits) },
    {
      key: "clicks", label: "Google clicks", value: google ? formatMetric("clicks", google.totals.clicks) : "–", available: Boolean(google),
      ...(clicksChange !== null && clicksChange !== undefined ? { diff: { direction: clicksChange > 0 ? "up" : clicksChange < 0 ? "down" : "same", value: `${clicksChange > 0 ? "+" : ""}${(clicksChange * 100).toFixed(0)}%` } as const } : {}),
    },
    { key: "conversion", label: "Downloads per page view", value: formatTraffic("conversion", conversion), available: Boolean(visits) },
  ];
  const active = tiles.find((tile) => tile.key === metric)!;
  const series = metric === "clicks"
    ? (google ? searchSeries(google.days, google.from, google.to, "clicks") : [])
    : (visits ? trafficSeries(visits.days, visits.from, visits.to, metric) : []);
  const span = metric === "clicks" ? (google ? spanOf(google.from, google.to) : 30) : (visits ? spanOf(visits.from, visits.to) : 30);
  return (
    <Card>
      <CardContent>
        <Tabs value={metric} onValueChange={(value) => setMetric(value as Key)} variant="kpis">
          <TabsList className="-mx-6 hidden grid-cols-4 md:visible! md:grid!" aria-label="Headline numbers">
            {tiles.map((tile) => (
              <KpiTabTrigger key={tile.key} value={tile.key}>
                <KpiTabValue color={colors[tile.key]} label={tile.label} value={tile.value} diffDirection={tile.diff?.direction ?? "hidden"} diffValue={tile.diff?.value} data-testid={`overview-${tile.key}`} />
              </KpiTabTrigger>
            ))}
          </TabsList>
          <DropdownMenu>
            <DropdownMenuTrigger className="md:hidden" asChild>
              <KpiDropdownButton aria-label="Choose number">
                <KpiTabValue color={colors[metric]} label={active.label} value={active.value} diffDirection={active.diff?.direction ?? "hidden"} diffValue={active.diff?.value} />
              </KpiDropdownButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {tiles.map((tile) => <DropdownMenuItem key={tile.key} onClick={() => setMetric(tile.key)}>{tile.label}: {tile.value}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </Tabs>
        <div className="my-4">
          {active.available ? (
            <GhAreaChart
              id={`overview-${metric}`} data={series} range={span} color={colors[metric]} showDots={metric === "conversion"}
              dataFormatter={(value) => (metric === "clicks" ? formatMetric("clicks", value) : formatTraffic(metric, value))}
              className="-mb-3 aspect-auto h-[16vw] max-h-[320px] min-h-[180px] w-full"
            />
          ) : <p className="py-16 text-center text-sm text-text-secondary">No numbers imported yet for this.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
