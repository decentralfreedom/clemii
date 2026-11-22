// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The Overview's top content, as Ghost's: the five most viewed pages, filtered
// to posts or other pages, each with all its downloads. A post opens its own
// analytics; "See all" opens the Traffic tab with every page.
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useGetTrafficPages, type GetTrafficSourcesParams } from "@/api/cms.generated";
import { BarList } from "@/components/analytics/bar-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defaultAnalyticsRange, type AnalyticsRangeKey } from "@/lib/analytics-ranges";
import { pageTypeLabels } from "@/lib/traffic-labels";

const number = new Intl.NumberFormat("en");

export function TopContentCard({ params, range, onSeeAll }: { params: Pick<GetTrafficSourcesParams, "days" | "since">; range: AnalyticsRangeKey; onSeeAll: () => void }) {
  const [kind, setKind] = useState<"all" | "post" | "home">("all");
  const pages = useGetTrafficPages({ ...params, limit: 5, ...(kind === "all" ? {} : { pageType: kind }) });
  const data = pages.data?.status === 200 ? pages.data.data : undefined;
  if (data && !data.from) return null;
  const rows = (data?.rows ?? []).map((row) => ({
    key: row.path, value: row.pageviews, detail: number.format(row.downloads),
    label: (
      <span className="flex min-w-0 items-center gap-2">
        {row.postId ? (
          <Link to="/posts/$id/analytics" params={{ id: row.postId }} search={range === defaultAnalyticsRange ? {} : { range }} className="truncate hover:underline">{row.path}</Link>
        ) : <span className="truncate">{row.path}</span>}
        <span className="shrink-0 text-xs text-text-secondary">{pageTypeLabels[row.pageType]}</span>
      </span>
    ),
  }));
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Top content</CardTitle>
          <CardDescription>The most viewed pages, with every download that started there.</CardDescription>
        </div>
        <ToggleGroup type="single" value={kind} onValueChange={(value) => value && setKind(value as typeof kind)} aria-label="Which pages">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="post">Posts</ToggleGroupItem>
          <ToggleGroupItem value="home">Home</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pages.isPending ? <p className="text-sm text-text-secondary">Loading…</p>
          : !rows.length ? <p className="text-sm text-text-secondary">No page views in this period.</p>
          : <BarList rows={rows} valueLabel="Page views" detailLabel="Downloads" ariaLabel="Top content" />}
        <Button variant="outline" size="sm" className="w-fit" onClick={onSeeAll}>See all pages</Button>
      </CardContent>
    </Card>
  );
}
