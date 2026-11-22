// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The blog's funnel as the page's headline, in Ghost's KPI tabs: Google
// impressions, clicks, page views and downloads of the posts, left to right,
// each a tab over its chart. Downloads lead, the one number the blog is for;
// the steps before them say where readers are lost. Rates show only where one
// step is a share of the one before and the count is large enough to mean
// something: a share of a handful of page views is noise.
import { useState } from "react";
import type { BlogAnalytics } from "@/api/cms.generated";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { GhAreaChart } from "@/components/ui/gh-chart";
import { KpiDropdownButton, KpiTabTrigger, KpiTabValue } from "@/components/ui/kpi-tabs";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { blogLabels, blogSeries, integer, type BlogMetric } from "@/lib/blog-chart";
import { pointOf, spanOf } from "@/lib/search-chart";

/** The fewest page views a downloads-per-view rate is shown for. */
export const minimumViewsForRate = 30;

const steps: BlogMetric[] = ["impressions", "clicks", "pageviews", "downloads"];
const colors: Record<BlogMetric, string> = { impressions: "var(--chart-blue)", clicks: "var(--chart-orange)", pageviews: "var(--chart-darkblue)", downloads: "var(--chart-green)" };
const percent = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;

export function BlogFunnel({ blog }: { blog: BlogAnalytics & { from: string; to: string } }) {
  const [metric, setMetric] = useState<BlogMetric>("downloads");
  const { impressions, clicks, pageviews, downloads } = blog.totals;
  const notes: Record<BlogMetric, string> = {
    impressions: "Google Search",
    clicks: impressions ? `${percent(clicks, impressions)} of impressions` : "Google Search",
    pageviews: "From every source",
    downloads: pageviews >= minimumViewsForRate ? `${percent(downloads, pageviews)} of page views` : "Started on a post",
  };
  const tile = (key: BlogMetric) => (
    <KpiTabValue color={colors[key]} label={blogLabels[key]} value={integer.format(blog.totals[key])} diffDirection="hidden" data-testid={`blog-${key}`} />
  );
  return (
    <Card>
      <CardContent>
        <Tabs value={metric} onValueChange={(value) => setMetric(value as BlogMetric)} variant="kpis">
          <TabsList className="-mx-6 hidden grid-cols-4 md:visible! md:grid!" aria-label="The blog's funnel">
            {steps.map((key) => <KpiTabTrigger key={key} value={key} title={notes[key]}>{tile(key)}</KpiTabTrigger>)}
          </TabsList>
          <DropdownMenu>
            <DropdownMenuTrigger className="md:hidden" asChild>
              <KpiDropdownButton aria-label="Choose step">{tile(metric)}</KpiDropdownButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {steps.map((key) => <DropdownMenuItem key={key} onClick={() => setMetric(key)}>{blogLabels[key]}: {integer.format(blog.totals[key])}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </Tabs>
        <p className="mt-3 text-xs text-text-secondary" data-testid="blog-step-note">{blogLabels[metric]}: {notes[metric]}.</p>
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
