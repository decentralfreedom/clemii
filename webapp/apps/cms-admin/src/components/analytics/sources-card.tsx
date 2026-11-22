// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Where visits come from, as Ghost's Top sources card with tabs: channels,
// the sites and links within them, and our tagged campaigns, for the whole
// site or one post (PRD: traffic sources and channels). A channel row filters
// the page to that channel, as Plausible's dashboard does. Downloads here are
// those through tagged links only; an untagged download's source is unknown.
import { useState } from "react";
import { useGetTrafficSources, type GetTrafficSourcesParams, type TrafficSourceRowChannel } from "@/api/cms.generated";
import { BarList } from "@/components/analytics/bar-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { channelLabels, channelNotes } from "@/lib/traffic-labels";

type View = "channel" | "source" | "campaign";
const number = new Intl.NumberFormat("en");

export function SourcesCard({ params, postId, channel, onChannel }: {
  params: Pick<GetTrafficSourcesParams, "days" | "since">;
  postId?: string;
  /** The channel the page is filtered to, if any. */
  channel?: TrafficSourceRowChannel;
  /** Filters the page to a channel; without it, a channel row opens its sources here. */
  onChannel?: (channel: TrafficSourceRowChannel) => void;
}) {
  const [picked, setPicked] = useState<View>("channel");
  const [local, setLocal] = useState<TrafficSourceRowChannel>();
  const within = channel ?? local;
  const view: View = within && picked === "channel" ? "source" : picked;
  const sources = useGetTrafficSources({ ...params, groupBy: view, postId, channel: within, limit: 10 });
  const data = sources.data?.status === 200 ? sources.data.data : undefined;
  if (data && !data.from) return null;
  const rows = (data?.rows ?? []).map((row) => {
    if (view === "channel") {
      const name = row.channel!;
      return {
        key: name, value: row.pageviews, detail: number.format(row.downloads),
        label: <span title={channelNotes[name]}>{channelLabels[name]}</span>,
        actionLabel: `Show ${channelLabels[name]} only`,
        onSelect: () => (onChannel ? onChannel(name) : setLocal(name)),
      };
    }
    if (view === "source") {
      return {
        key: `${row.channel}:${row.source}`, value: row.pageviews, detail: number.format(row.downloads),
        label: <span className="flex min-w-0 items-center gap-2"><span className="truncate">{row.source || "No referrer"}</span><span className="shrink-0 text-xs text-text-secondary">{channelLabels[row.channel!]}</span></span>,
      };
    }
    return {
      key: `${row.source}:${row.medium}:${row.campaign}:${row.content}`, value: row.pageviews, detail: number.format(row.downloads),
      label: <span className="flex min-w-0 items-center gap-2"><span className="truncate">{row.campaign || "(no campaign)"}</span><span className="shrink-0 text-xs text-text-secondary">{row.source} · {row.medium}{row.content ? ` · ${row.content}` : ""}</span></span>,
    };
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sources</CardTitle>
        <CardDescription>
          Where visits came from{within ? <>, within <strong className="font-medium text-foreground">{channelLabels[within]}</strong></> : ""}. Downloads count here only through tagged links.
          {local && !channel && <> <button type="button" className="underline" onClick={() => setLocal(undefined)}>All channels</button></>}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Tabs value={view} onValueChange={(value) => { setPicked(value as View); if (value === "channel") setLocal(undefined); }} variant="underline">
          <TabsList aria-label="Group sources by">
            <TabsTrigger value="channel" disabled={Boolean(channel)}>Channels</TabsTrigger>
            <TabsTrigger value="source">Sources</TabsTrigger>
            <TabsTrigger value="campaign">Campaigns</TabsTrigger>
          </TabsList>
        </Tabs>
        {sources.isPending ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : !rows.length ? (
          <p className="text-sm text-text-secondary">{view === "campaign" ? "No visits through tagged links in this period." : "No page views in this period."}</p>
        ) : (
          <BarList rows={rows} valueLabel="Page views" detailLabel="Downloads" ariaLabel={`Sources by ${view}`} />
        )}
      </CardContent>
    </Card>
  );
}
