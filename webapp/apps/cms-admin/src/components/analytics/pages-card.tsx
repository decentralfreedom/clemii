// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Every page of the site with its page views, not only posts: home, release
// notes and the rest (PRD: page types and intent). A post opens its own
// analytics, keeping the range.
import { Link } from "@tanstack/react-router";
import { useGetTrafficSources, type GetTrafficSourcesParams, type TrafficSourceRowChannel } from "@/api/cms.generated";
import { BarList } from "@/components/analytics/bar-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultAnalyticsRange, type AnalyticsRangeKey } from "@/lib/analytics-ranges";
import { channelLabels, pageTypeLabels } from "@/lib/traffic-labels";

const number = new Intl.NumberFormat("en");

export function PagesCard({ params, channel, range }: {
  params: Pick<GetTrafficSourcesParams, "days" | "since">;
  channel?: TrafficSourceRowChannel;
  range: AnalyticsRangeKey;
}) {
  const pages = useGetTrafficSources({ ...params, groupBy: "page", channel, limit: 10 });
  const data = pages.data?.status === 200 ? pages.data.data : undefined;
  if (data && !data.from) return null;
  const rows = (data?.rows ?? []).map((row) => ({
    key: row.path!, value: row.pageviews, detail: number.format(row.downloads),
    label: (
      <span className="flex min-w-0 items-center gap-2">
        {row.postId ? (
          <Link to="/posts/$id/analytics" params={{ id: row.postId }} search={range === defaultAnalyticsRange ? {} : { range }} className="truncate hover:underline">{row.path}</Link>
        ) : <span className="truncate">{row.path}</span>}
        <span className="shrink-0 text-xs text-text-secondary">{pageTypeLabels[row.pageType!]}</span>
      </span>
    ),
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pages</CardTitle>
        <CardDescription>Every page of the site{channel ? <> from <strong className="font-medium text-foreground">{channelLabels[channel]}</strong></> : ""}, most viewed first. Downloads through tagged links.</CardDescription>
      </CardHeader>
      <CardContent>
        {pages.isPending ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : !rows.length ? (
          <p className="text-sm text-text-secondary">No page views in this period.</p>
        ) : (
          <BarList rows={rows} valueLabel="Page views" detailLabel="Downloads" ariaLabel="Pages" />
        )}
      </CardContent>
    </Card>
  );
}
