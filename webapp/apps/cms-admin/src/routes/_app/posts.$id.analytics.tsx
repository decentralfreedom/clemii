// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// A post's analytics, as Ghost Admin's (apps/admin/src/posts/analytics:
// post-analytics-header.tsx, overview, web): reached from the posts list, the
// editor's Google Search block and, later, the Analytics dashboard; a header
// with the way back, the post and its actions, then Overview and Search tabs
// over the range Ghost offers. Every number is one the CMS has (PRD R12).
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Pen } from "lucide-react";
import { useGetPost, useGetPostSearch, type Post } from "@/api/cms.generated";
import { DataSource } from "@/components/analytics/data-source";
import { RangeSelect } from "@/components/analytics/range-select";
import { SearchChanges } from "@/components/analytics/search-changes";
import { SearchKpis } from "@/components/analytics/search-kpis";
import { SearchQueriesCard } from "@/components/analytics/search-queries-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { articleUrl } from "@/lib/article-url";
import { defaultAnalyticsRange, isAnalyticsRange, rangeParams, type AnalyticsRangeKey } from "@/lib/analytics-ranges";

type Tab = "overview" | "search";

export const Route = createFileRoute("/_app/posts/$id/analytics")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab; range?: AnalyticsRangeKey } => ({
    ...(search.tab === "search" ? { tab: "search" as const } : {}),
    ...(isAnalyticsRange(search.range) && search.range !== defaultAnalyticsRange ? { range: search.range } : {}),
  }),
  component: PostAnalytics,
});

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Which numbers these are, from which days and when they were read: the page never shows a number without its source. */

function PostAnalytics() {
  const { id } = Route.useParams();
  const { tab = "overview", range = defaultAnalyticsRange } = Route.useSearch();
  const navigate = Route.useNavigate();
  const params = rangeParams(range);
  const post = useGetPost(id);
  const search = useGetPostSearch(id, params);
  const data = post.data?.status === 200 ? post.data.data as Post : undefined;
  const numbers = search.data?.status === 200 ? search.data.data : undefined;
  const title = data ? data.rendition?.heading ?? data.title : "";

  return (
    <div className="mx-auto flex w-full max-w-(--content-width) flex-col px-(--page-gutter) pb-12">
      <header className="flex flex-col gap-4 pt-[28px] pb-6">
        <Link to="/" search={{}} className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-foreground">
          <ArrowLeft className="size-4" />Posts
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
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-border-default">
          <Tabs value={tab} onValueChange={(value) => void navigate({ search: (previous) => ({ ...previous, tab: value === "search" ? "search" : undefined }) })} variant="underline">
            <TabsList aria-label="Post analytics">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="search">Search</TabsTrigger>
            </TabsList>
          </Tabs>
          <RangeSelect value={range} onChange={(next) => void navigate({ search: (previous) => ({ ...previous, range: next === defaultAnalyticsRange ? undefined : next }) })} />
        </div>
      </header>

      {search.isPending ? (
        <p className="py-24 text-center text-sm text-text-secondary">Loading…</p>
      ) : !numbers ? (
        <p className="py-24 text-center text-sm text-destructive">The numbers could not be loaded.</p>
      ) : !numbers.from || !numbers.to ? (
        <p className="py-24 text-center text-sm text-text-secondary">No Search Console numbers yet; the CMS reads them once a day.</p>
      ) : tab === "overview" ? (
        <div className="flex flex-col gap-6">
          <SearchKpis id="post" search={{ ...numbers, from: numbers.from, to: numbers.to }} />
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
            <SearchQueriesCard postId={id} params={params} limit={5} more={{ tab: "search" }} compact />
            <SearchChanges markers={numbers.markers} />
          </div>
          <DataSource from={numbers.from} to={numbers.to} importedAt={numbers.importedAt} />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <SearchQueriesCard postId={id} params={params} limit={100} />
          <DataSource from={numbers.from} to={numbers.to} importedAt={numbers.importedAt} />
        </div>
      )}
    </div>
  );
}
