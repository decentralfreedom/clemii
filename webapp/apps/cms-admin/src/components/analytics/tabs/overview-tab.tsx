// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Analytics > Overview, as Ghost's: how the site is doing at a glance. Four
// headline numbers over one chart, the top content and the top sources, each
// with "See all" into the Traffic tab; a source row opens Traffic filtered to it.
import { useGetSiteSearch, useGetSiteTraffic, type TrafficSourceRowChannel } from "@/api/cms.generated";
import { analyticsDay } from "@/components/analytics/data-source";
import { OverviewKpis } from "@/components/analytics/overview-kpis";
import { TopContentCard } from "@/components/analytics/top-content-card";
import { TopSourcesCard } from "@/components/analytics/top-sources-card";
import { rangeParams, type AnalyticsRangeKey } from "@/lib/analytics-ranges";

export function OverviewTab({ range, onTraffic }: { range: AnalyticsRangeKey; onTraffic: (channel?: TrafficSourceRowChannel) => void }) {
  const params = rangeParams(range);
  const search = useGetSiteSearch({ ...params, limit: 1 });
  const numbers = search.data?.status === 200 ? search.data.data : undefined;
  const traffic = useGetSiteTraffic(params);
  const visits = traffic.data?.status === 200 ? traffic.data.data : undefined;
  return (
    <div className="flex flex-col gap-6">
      <OverviewKpis traffic={visits} search={numbers} />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
        <TopContentCard params={params} range={range} onSeeAll={() => onTraffic()} />
        <TopSourcesCard params={params} onChannel={onTraffic} onSeeAll={() => onTraffic()} />
      </div>
      <p className="text-sm text-text-secondary">
        Page views and downloads: Umami{visits?.from && visits.to ? <>, {analyticsDay(visits.from)} to {analyticsDay(visits.to)}</> : ", none imported yet"}.
        {" "}Google clicks: Search Console{numbers?.from && numbers.to ? <>, {analyticsDay(numbers.from)} to {analyticsDay(numbers.to)}; it lags two to three days</> : ", none imported yet"}.
      </p>
    </div>
  );
}
