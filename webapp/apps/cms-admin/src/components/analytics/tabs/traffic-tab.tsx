// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Analytics > Traffic: where visits come from (Umami), every page and the
// tracked links. A channel row filters the tab, shown as a removable chip, as
// Plausible's rows filter its dashboard.
import { X } from "lucide-react";
import type { TrafficSourceRowChannel } from "@/api/cms.generated";
import { LinksCard } from "@/components/analytics/links-card";
import { PagesCard } from "@/components/analytics/pages-card";
import { SourcesCard } from "@/components/analytics/sources-card";
import { rangeParams, type AnalyticsRangeKey } from "@/lib/analytics-ranges";
import { channelLabels } from "@/lib/traffic-labels";

export function TrafficTab({ range, channel, onChannel }: {
  range: AnalyticsRangeKey;
  channel?: TrafficSourceRowChannel;
  onChannel: (channel?: TrafficSourceRowChannel) => void;
}) {
  const params = rangeParams(range);
  return (
    <div className="flex flex-col gap-6">
      {channel && (
        <button type="button" onClick={() => onChannel(undefined)} aria-label={`Remove the ${channelLabels[channel]} filter`}
          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border-default px-3 py-1 text-sm hover:bg-muted">
          Channel: {channelLabels[channel]} <X className="size-3.5" />
        </button>
      )}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
        <SourcesCard params={params} channel={channel} onChannel={onChannel} />
        <PagesCard params={params} channel={channel} range={range} />
      </div>
      <LinksCard params={params} />
    </div>
  );
}
