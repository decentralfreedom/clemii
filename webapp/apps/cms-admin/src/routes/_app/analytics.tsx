// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The site's analytics, as Ghost Admin's Analytics overview (apps/stats):
// "Analytics" in the sidebar, a header with the range, the KPI tabs over the
// chart, then the top posts, each opening its own analytics. The search
// totals are Google's for the whole site, aggregated by property, so they
// include the home and download pages and exceed the posts' sum (PRD R12).
import { createFileRoute } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useGetSiteSearch, useGetSiteTraffic, type TrafficSourceRowChannel } from "@/api/cms.generated";
import { DataSource } from "@/components/analytics/data-source";
import { FunnelCard } from "@/components/analytics/funnel-card";
import { LinksCard } from "@/components/analytics/links-card";
import { PagesCard } from "@/components/analytics/pages-card";
import { RangeSelect } from "@/components/analytics/range-select";
import { SearchKpis } from "@/components/analytics/search-kpis";
import { SourcesCard } from "@/components/analytics/sources-card";
import { TopPostsCard } from "@/components/analytics/top-posts-card";
import { defaultAnalyticsRange, isAnalyticsRange, rangeParams, type AnalyticsRangeKey } from "@/lib/analytics-ranges";
import { channelLabels, isChannel } from "@/lib/traffic-labels";

export const Route = createFileRoute("/_app/analytics")({
  validateSearch: (search: Record<string, unknown>): { range?: AnalyticsRangeKey; channel?: TrafficSourceRowChannel } => ({
    ...(isAnalyticsRange(search.range) && search.range !== defaultAnalyticsRange ? { range: search.range } : {}),
    // A channel picked in the Sources card filters the traffic cards, as a chip in the URL (Plausible's pattern).
    ...(isChannel(search.channel) ? { channel: search.channel } : {}),
  }),
  component: Analytics,
});

function Analytics() {
  const { range = defaultAnalyticsRange, channel } = Route.useSearch();
  const navigate = Route.useNavigate();
  const search = useGetSiteSearch({ ...rangeParams(range), limit: 10 });
  const numbers = search.data?.status === 200 ? search.data.data : undefined;
  const traffic = useGetSiteTraffic({ since: numbers?.from ?? undefined }, { query: { enabled: Boolean(numbers?.from) } });
  const visits = traffic.data?.status === 200 ? traffic.data.data : undefined;

  return (
    <div className="mx-auto flex w-full max-w-(--content-width) flex-col px-(--page-gutter) pb-12">
      <header className="flex items-center justify-between gap-4 pt-[28px] pb-6">
        <h1 className="text-3xl leading-tight font-bold tracking-tight">Analytics</h1>
        <RangeSelect value={range} onChange={(next) => void navigate({ search: (previous) => ({ ...previous, range: next === defaultAnalyticsRange ? undefined : next }) })} />
      </header>
      {search.isPending ? (
        <p className="py-24 text-center text-sm text-text-secondary">Loading…</p>
      ) : !numbers ? (
        <p className="py-24 text-center text-sm text-destructive">The numbers could not be loaded.</p>
      ) : !numbers.from || !numbers.to ? (
        <p className="py-24 text-center text-sm text-text-secondary">No Search Console numbers yet; the CMS reads them once a day.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="google-search" className="flex flex-col gap-3">
            <h2 id="google-search" className="text-lg font-semibold">Google Search</h2>
            <SearchKpis id="site" search={{ ...numbers, from: numbers.from, to: numbers.to }} />
          </section>
          {visits && <FunnelCard search={{ from: numbers.from, to: numbers.to, days: numbers.days }} traffic={visits} />}
          <TopPostsCard posts={numbers.topPosts} range={range} />
          <section aria-labelledby="traffic" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="traffic" className="text-lg font-semibold">Traffic</h2>
              {channel && (
                <button type="button" onClick={() => void navigate({ search: (previous) => ({ ...previous, channel: undefined }) })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-default px-3 py-1 text-sm hover:bg-muted" aria-label={`Remove the ${channelLabels[channel]} filter`}>
                  Channel: {channelLabels[channel]} <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
              <SourcesCard params={rangeParams(range)} channel={channel} onChannel={(next) => void navigate({ search: (previous) => ({ ...previous, channel: next }) })} />
              <PagesCard params={rangeParams(range)} channel={channel} range={range} />
            </div>
            <LinksCard params={rangeParams(range)} />
          </section>
          <DataSource from={numbers.from} to={numbers.to} importedAt={numbers.importedAt} preliminaryFrom={numbers.preliminaryFrom}>
            The totals are Google's for the whole site, home and download pages included, so they are more than the posts add up to.
          </DataSource>
        </div>
      )}
    </div>
  );
}
