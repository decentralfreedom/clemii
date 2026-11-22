// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The blog's analytics on one screen, as Ghost Admin's Analytics overview and
// a dashboard in Stephen Few's sense: the blog's funnel from Google
// impressions to downloads as the headline, then every post with how it
// drives downloads, each opening the post's own analytics, one level deeper.
// No tabs: more opens by clicking. Google and Umami count the same days, the
// days both have (GET /v1/blog), posts only. A goal an agent proposed shows
// here only while it waits for the owner.
import { createFileRoute } from "@tanstack/react-router";
import { useGetBlogAnalytics } from "@/api/cms.generated";
import { BlogFunnel } from "@/components/analytics/blog-funnel";
import { BlogPostsCard } from "@/components/analytics/blog-posts-card";
import { DataSource } from "@/components/analytics/data-source";
import { GoalProposalsCard } from "@/components/analytics/goal-proposals-card";
import { RangeSelect } from "@/components/analytics/range-select";
import { defaultAnalyticsRange, isAnalyticsRange, rangeParams, type AnalyticsRangeKey } from "@/lib/analytics-ranges";

export const Route = createFileRoute("/_app/analytics")({
  validateSearch: (search: Record<string, unknown>): { range?: AnalyticsRangeKey } =>
    isAnalyticsRange(search.range) && search.range !== defaultAnalyticsRange ? { range: search.range } : {},
  component: Analytics,
});

function Analytics() {
  const { range = defaultAnalyticsRange } = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = useGetBlogAnalytics(rangeParams(range));
  const blog = query.data?.status === 200 ? query.data.data : undefined;

  return (
    <div className="mx-auto flex w-full max-w-(--content-width) flex-col px-(--page-gutter) pb-12">
      <header className="flex flex-wrap items-center justify-between gap-4 pt-[28px] pb-6">
        <h1 className="text-3xl leading-tight font-bold tracking-tight">Analytics</h1>
        <RangeSelect value={range} onChange={(next) => void navigate({ search: next === defaultAnalyticsRange ? {} : { range: next } })} />
      </header>
      <div className="flex flex-col gap-6">
        <GoalProposalsCard />
        {query.isPending ? (
          <p className="py-24 text-center text-sm text-text-secondary">Loading…</p>
        ) : !blog ? (
          <p className="py-24 text-center text-sm text-destructive">The numbers could not be loaded.</p>
        ) : !blog.from || !blog.to ? (
          <p className="py-24 text-center text-sm text-text-secondary">No Search Console numbers yet; the CMS reads them once a day.</p>
        ) : (
          <>
            <BlogFunnel blog={{ ...blog, from: blog.from, to: blog.to }} />
            <BlogPostsCard posts={blog.posts} range={range} counted={blog.trafficCounted} />
            <DataSource from={blog.from} to={blog.to} importedAt={blog.searchImportedAt} preliminaryFrom={blog.preliminaryFrom}>
              {blog.trafficCounted
                ? "Posts only: impressions and clicks from Google Search Console, page views and downloads from Umami, over the same days. Home and download pages do not count here."
                : "Posts only: impressions and clicks from Google Search Console. Umami's page views and downloads join once Google's numbers reach the days Umami counts. Home and download pages do not count here."}
            </DataSource>
          </>
        )}
      </div>
    </div>
  );
}
