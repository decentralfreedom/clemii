// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// A post's analytics, as Ghost Admin's (apps/admin/src/posts/analytics:
// post-analytics-header.tsx, overview, web): reached from the posts list, the
// editor's Google Search block and the Analytics page's posts; a header with
// the way back, the post and its actions and the range Ghost offers, then one
// view: Google Search, the funnel, where readers came from and the searches,
// whose full list opens in place. Every number is one the CMS has (PRD R12).
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Pen } from "lucide-react";
import { useGetPost, useGetPostSearch, useGetPostTraffic, type Post } from "@/api/cms.generated";
import { DataSource } from "@/components/analytics/data-source";
import { FunnelCard } from "@/components/analytics/funnel-card";
import { SourcesCard } from "@/components/analytics/sources-card";
import { RangeSelect } from "@/components/analytics/range-select";
import { SearchChanges } from "@/components/analytics/search-changes";
import { SearchKpis } from "@/components/analytics/search-kpis";
import { SearchQueriesCard } from "@/components/analytics/search-queries-card";
import { Button } from "@/components/ui/button";
import { articleUrl } from "@/lib/article-url";
import { defaultAnalyticsRange, isAnalyticsRange, rangeParams, type AnalyticsRangeKey } from "@/lib/analytics-ranges";

export const Route = createFileRoute("/_app/posts/$id/analytics")({
  validateSearch: (search: Record<string, unknown>): { range?: AnalyticsRangeKey } =>
    isAnalyticsRange(search.range) && search.range !== defaultAnalyticsRange ? { range: search.range } : {},
  component: PostAnalytics,
});

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Which numbers these are, from which days and when they were read: the page never shows a number without its source. */

function PostAnalytics() {
  const { id } = Route.useParams();
  const { range = defaultAnalyticsRange } = Route.useSearch();
  const navigate = Route.useNavigate();
  const params = rangeParams(range);
  const post = useGetPost(id);
  const search = useGetPostSearch(id, params);
  const data = post.data?.status === 200 ? post.data.data as Post : undefined;
  const numbers = search.data?.status === 200 ? search.data.data : undefined;
  // The funnel's later steps, from the same first day; the card keeps to the days both sources have.
  const traffic = useGetPostTraffic(id, { since: numbers?.from ?? undefined }, { query: { enabled: Boolean(numbers?.from) } });
  const visits = traffic.data?.status === 200 ? traffic.data.data : undefined;
  const title = data ? data.rendition?.heading ?? data.title : "";

  return (
    <div className="mx-auto flex w-full max-w-(--content-width) flex-col px-(--page-gutter) pb-12">
      <header className="flex flex-col gap-4 pt-[28px] pb-6">
        <Link to="/analytics" search={range === defaultAnalyticsRange ? {} : { range }} className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-foreground">
          <ArrowLeft className="size-4" />Analytics
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-3xl leading-tight font-bold tracking-tight text-balance">{title || "Post analytics"}</h1>
            {data?.publishedAt && data.status === "published" && (
              <p className="text-sm text-text-secondary">Published {day(data.publishedAt.slice(0, 10))}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {data?.status === "published" && (
              <Button asChild variant="outline" size="sm">
                <a href={articleUrl(data.lang, data.slug)} target="_blank" rel="noopener noreferrer">View post<ArrowUpRight /></a>
              </Button>
            )}
            <Button asChild variant="outline" size="sm"><Link to="/posts/$id" params={{ id }}><Pen />Edit post</Link></Button>
            <RangeSelect value={range} onChange={(next) => void navigate({ search: next === defaultAnalyticsRange ? {} : { range: next } })} />
          </div>
        </div>
      </header>

      {search.isPending ? (
        <p className="py-24 text-center text-sm text-text-secondary">Loading…</p>
      ) : !numbers ? (
        <p className="py-24 text-center text-sm text-destructive">The numbers could not be loaded.</p>
      ) : !numbers.from || !numbers.to ? (
        <p className="py-24 text-center text-sm text-text-secondary">No Search Console numbers yet; the CMS reads them once a day.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <SearchKpis id="post" search={{ ...numbers, from: numbers.from, to: numbers.to }} />
          {visits && <FunnelCard search={{ from: numbers.from, to: numbers.to, days: numbers.days }} traffic={visits} />}
          <SourcesCard params={params} postId={id} />
          <SearchQueriesCard postId={id} params={params} />
          <SearchChanges markers={numbers.markers} />
          <DataSource from={numbers.from} to={numbers.to} importedAt={numbers.importedAt} preliminaryFrom={numbers.preliminaryFrom} />
        </div>
      )}
    </div>
  );
}
