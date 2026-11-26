// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The blog's numbers as the page's headline, in Ghost's KPI tabs: Google
// impressions and clicks (Search Console), then page views and downloads of
// the posts (Umami), each a tab over its chart. The two sources stand side by
// side under their own labels, never as one step leading into the next:
// Google says its clicks and an analytics tool's visits measure different
// things. Downloads lead, the one number the blog is for;
// the steps before them say where readers are lost. Rates show only where one
// step is a share of the one before and the count is large enough to mean
// something: a share of a handful of page views is noise. Before Umami counts
// Google's days, page views and downloads read "–" and say from when they count.
import { useState } from "react";
import type { BlogAnalytics } from "@/api/cms.generated";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { GhAreaChart } from "@/components/ui/gh-chart";
import { KpiDropdownButton, KpiTabTrigger, KpiTabValue } from "@/components/ui/kpi-tabs";
import { analyticsDay } from "@/components/analytics/data-source";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { blogLabels, blogSeries, integer, type BlogMetric } from "@/lib/blog-chart";
import { pointOf, spanOf } from "@/lib/search-chart";

/** The fewest page views a downloads-per-view rate is shown for. */
export const minimumViewsForRate = 30;

const steps: BlogMetric[] = ["impressions", "clicks", "pageviews", "downloads"];
const colors: Record<BlogMetric, string> = { impressions: "var(--chart-blue)", clicks: "var(--chart-orange)", pageviews: "var(--chart-darkblue)", downloads: "var(--chart-green)" };
const percent = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;

export function BlogFunnel({ blog }: { blog: BlogAnalytics & { from: string; to: string } }) {
  const counted = blog.trafficCounted;
  const [metric, setMetric] = useState<BlogMetric>(counted ? "downloads" : "clicks");
  const { impressions, clicks, pageviews, downloads } = blog.totals;
  const notYet = blog.trafficFrom ? `Not counted yet: Umami counts from ${analyticsDay(blog.trafficFrom)}` : "Not counted yet";
  const notes: Record<BlogMetric, string> = {
    impressions: "Google Search",
    clicks: impressions ? `${percent(clicks, impressions)} of impressions` : "Google Search",
    pageviews: pageviews === null ? notYet : "From every source",
    downloads: downloads === null || pageviews === null ? notYet : pageviews >= minimumViewsForRate ? `${percent(downloads, pageviews)} of page views` : "Started on a post",
  };
  const value = (key: BlogMetric) => { const total = blog.totals[key]; return total === null ? "–" : integer.format(total); };
  const tile = (key: BlogMetric) => (
    <KpiTabValue color={colors[key]} label={blogLabels[key]} value={value(key)} diffDirection="hidden" data-testid={`blog-${key}`} />
  );
  const selectable = (key: BlogMetric) => blog.totals[key] !== null;
  return (
    <Card>
      <CardContent>
        <div aria-hidden className="-mx-6 hidden grid-cols-2 border-b border-border-default px-6 pt-4 pb-3 text-xs text-text-secondary md:grid">
          <span><span className="font-medium">Google Search</span> · Search Console</span>
          <span className="ps-6"><span className="font-medium">On clemii.com</span> · Umami</span>
        </div>
        <Tabs value={metric} onValueChange={(value) => setMetric(value as BlogMetric)} variant="kpis">
          <TabsList className="-mx-6 hidden grid-cols-4 md:visible! md:grid!" aria-label="The blog's numbers">
            {steps.map((key) => <KpiTabTrigger key={key} value={key} title={notes[key]} disabled={!selectable(key)}>{tile(key)}</KpiTabTrigger>)}
          </TabsList>
          <DropdownMenu>
            <DropdownMenuTrigger className="md:hidden" asChild>
              <KpiDropdownButton aria-label="Choose step">{tile(metric)}</KpiDropdownButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {steps.filter(selectable).map((key) => <DropdownMenuItem key={key} onClick={() => setMetric(key)}>{blogLabels[key]}: {value(key)}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </Tabs>
        <p className="mt-3 text-xs text-text-secondary" data-testid="blog-step-note">
          {blogLabels[metric]}: {notes[metric]}.{!counted && ` Page views and downloads are not counted yet${blog.trafficFrom ? `: Umami counts from ${analyticsDay(blog.trafficFrom)}, and they join once Google's numbers reach that day` : ""}.`}
        </p>
        <div className="my-4">
          <GhAreaChart
            id={`blog-${metric}`} data={blogSeries(blog.days, blog.from, blog.to, metric)} range={spanOf(blog.from, blog.to)} color={colors[metric]}
            preliminaryFrom={blog.preliminaryFrom ? pointOf(blog.preliminaryFrom, blog.from, blog.to) : undefined}
            dataFormatter={(value) => integer.format(value)}
            className="-mb-3 aspect-auto h-[16vw] max-h-[320px] min-h-[180px] w-full"
          />
        </div>
      </CardContent>
    </Card>
  );
}
