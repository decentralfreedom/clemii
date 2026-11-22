// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Analytics > Search: Google's side from Search Console, the funnel from
// impressions to downloads over the days both sources have, and the top posts,
// each opening its own analytics. The totals are Google's for the whole site,
// aggregated by property, so they exceed the posts' sum (PRD R12).
import { useGetSiteSearch, useGetSiteTraffic } from "@/api/cms.generated";
import { DataSource } from "@/components/analytics/data-source";
import { FunnelCard } from "@/components/analytics/funnel-card";
import { SearchKpis } from "@/components/analytics/search-kpis";
import { TopPostsCard } from "@/components/analytics/top-posts-card";
import { rangeParams, type AnalyticsRangeKey } from "@/lib/analytics-ranges";

export function SearchTab({ range }: { range: AnalyticsRangeKey }) {
  const search = useGetSiteSearch({ ...rangeParams(range), limit: 10 });
  const numbers = search.data?.status === 200 ? search.data.data : undefined;
  const traffic = useGetSiteTraffic({ since: numbers?.from ?? undefined }, { query: { enabled: Boolean(numbers?.from) } });
  const visits = traffic.data?.status === 200 ? traffic.data.data : undefined;
  if (search.isPending) return <p className="py-24 text-center text-sm text-text-secondary">Loading…</p>;
  if (!numbers) return <p className="py-24 text-center text-sm text-destructive">The numbers could not be loaded.</p>;
  if (!numbers.from || !numbers.to) return <p className="py-24 text-center text-sm text-text-secondary">No Search Console numbers yet; the CMS reads them once a day.</p>;
  return (
    <div className="flex flex-col gap-6">
      <SearchKpis id="site" search={{ ...numbers, from: numbers.from, to: numbers.to }} />
      {visits && <FunnelCard search={{ from: numbers.from, to: numbers.to, days: numbers.days }} traffic={visits} />}
      <TopPostsCard posts={numbers.topPosts} range={range} />
      <DataSource from={numbers.from} to={numbers.to} importedAt={numbers.importedAt} preliminaryFrom={numbers.preliminaryFrom}>
        The totals are Google's for the whole site, home and download pages included, so they are more than the posts add up to.
      </DataSource>
    </div>
  );
}
