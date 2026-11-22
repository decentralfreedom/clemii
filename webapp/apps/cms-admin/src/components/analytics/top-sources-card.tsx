// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The Overview's top sources: the five channels with the most page views. A
// channel opens the Traffic tab filtered to it, as Plausible's rows filter;
// "See all" opens it unfiltered.
import { useGetTrafficSources, type GetTrafficSourcesParams, type TrafficSourceRowChannel } from "@/api/cms.generated";
import { BarList } from "@/components/analytics/bar-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { channelLabels, channelNotes } from "@/lib/traffic-labels";

export function TopSourcesCard({ params, onChannel, onSeeAll }: {
  params: Pick<GetTrafficSourcesParams, "days" | "since">;
  onChannel: (channel: TrafficSourceRowChannel) => void;
  onSeeAll: () => void;
}) {
  const sources = useGetTrafficSources({ ...params, groupBy: "channel", limit: 5 });
  const data = sources.data?.status === 200 ? sources.data.data : undefined;
  if (data && !data.from) return null;
  const rows = (data?.rows ?? []).map((row) => ({
    key: row.channel!, value: row.pageviews,
    label: <span title={channelNotes[row.channel!]}>{channelLabels[row.channel!]}</span>,
    actionLabel: `Show ${channelLabels[row.channel!]} in Traffic`,
    onSelect: () => onChannel(row.channel!),
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top sources</CardTitle>
        <CardDescription>Where visits came from. Open one for its sites and pages.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sources.isPending ? <p className="text-sm text-text-secondary">Loading…</p>
          : !rows.length ? <p className="text-sm text-text-secondary">No page views in this period.</p>
          : <BarList rows={rows} valueLabel="Page views" ariaLabel="Top sources" />}
        <Button variant="outline" size="sm" className="w-fit" onClick={onSeeAll}>See all sources</Button>
      </CardContent>
    </Card>
  );
}
