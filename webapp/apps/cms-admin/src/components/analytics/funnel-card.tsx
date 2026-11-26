// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The funnel (PRD R11): Google impressions and clicks from Search Console,
// page views and downloads from Umami, over only the days both have, so every
// step counts the same days. Rates are shown only where one step is a share
// of the one before: clicks of impressions (CTR) and downloads of page views.
// Page views come from every source, not only Google, so no rate links them
// to clicks.
import { ChevronRight } from "lucide-react";
import type { SearchDay, Traffic } from "@/api/cms.generated";
import { analyticsDay } from "@/components/analytics/data-source";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricValue } from "@/components/ui/metric-value";
import { formatMetric } from "@/lib/search-chart";

const percent = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "–");

/** The days both sources have, or undefined when they do not meet. */
export function funnelWindow(search: { from: string; to: string }, traffic: Pick<Traffic, "from" | "to">) {
  if (!traffic.from || !traffic.to) return undefined;
  const from = search.from > traffic.from ? search.from : traffic.from;
  const to = search.to < traffic.to ? search.to : traffic.to;
  return from <= to ? { from, to } : undefined;
}

export function FunnelCard({ search, traffic }: { search: { from: string; to: string; days: SearchDay[] }; traffic: Traffic }) {
  const window = funnelWindow(search, traffic);
  if (!window) return null;
  const inWindow = ({ date }: { date: string }) => date >= window.from && date <= window.to;
  const searchDays = search.days.filter(inWindow);
  const trafficDays = traffic.days.filter(inWindow);
  const impressions = searchDays.reduce((sum, day) => sum + day.impressions, 0);
  const clicks = searchDays.reduce((sum, day) => sum + day.clicks, 0);
  const pageviews = trafficDays.reduce((sum, day) => sum + day.pageviews, 0);
  const downloads = trafficDays.reduce((sum, day) => sum + day.downloads, 0);
  const steps = [
    { key: "impressions", label: "Impressions", value: formatMetric("impressions", impressions), note: "Google Search" },
    { key: "clicks", label: "Clicks", value: formatMetric("clicks", clicks), note: `${percent(clicks, impressions)} CTR` },
    { key: "pageviews", label: "Page views", value: formatMetric("impressions", pageviews), note: "From every source" },
    { key: "downloads", label: "Downloads", value: formatMetric("impressions", downloads), note: `${percent(downloads, pageviews)} of page views` },
  ];
  // Each source in its own group, as Google's Search Console integration joins them: side by side, never one
  // step leading into the other. Search Console's clicks and Umami's page views measure different things.
  const groups = [
    { label: "Google Search", source: "Search Console", steps: steps.slice(0, 2) },
    { label: "On clemii.com", source: "Umami", steps: steps.slice(2) },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search and site</CardTitle>
        <CardDescription>Google Search and the visits on the site, each from its own source, {analyticsDay(window.from)} to {analyticsDay(window.to)}: the days both Search Console and Umami have.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label} className="flex flex-col gap-3">
              <p className="text-xs font-medium text-text-secondary">{group.label} <span className="font-normal">· {group.source}</span></p>
              <ol aria-label={`${group.label} steps`} className="grid grid-cols-2 gap-x-4">
                {group.steps.map((step, index) => (
                  <li key={step.key} className="relative flex flex-col gap-1.5" data-testid={`funnel-${step.key}`}>
                    <MetricValue label={step.label} value={step.value} size="lg" valueTestId={`funnel-${step.key}-value`} />
                    <span className="text-sm text-text-secondary">{step.note}</span>
                    {index === 0 && <ChevronRight aria-hidden className="absolute top-8 -right-3 size-4 text-muted-foreground" />}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <p className="mt-6 text-sm text-text-secondary">
          Page views and downloads are counted on clemii.com's server, without cookies, and not for visitors who ask not to be tracked (Do Not Track, Global Privacy Control).
        </p>
      </CardContent>
    </Card>
  );
}
