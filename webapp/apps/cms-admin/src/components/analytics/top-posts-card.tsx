// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The posts that brought the most Google Search traffic, as Ghost's Top
// content card on its Analytics overview: each row opens the post's own
// analytics, the drill-down Ghost's dashboard leads to.
import { Link } from "@tanstack/react-router";
import type { SiteSearch } from "@/api/cms.generated";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AnalyticsRangeKey } from "@/lib/analytics-ranges";
import { defaultAnalyticsRange } from "@/lib/analytics-ranges";
import { formatMetric } from "@/lib/search-chart";

export function TopPostsCard({ posts, range }: { posts: SiteSearch["topPosts"]; range: AnalyticsRangeKey }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top posts</CardTitle>
        <CardDescription>The posts with the most clicks from Google Search in this period.</CardDescription>
      </CardHeader>
      <CardContent>
        {!posts.length ? (
          <p className="text-sm text-text-secondary">No post was shown in Google Search in this period.</p>
        ) : (
          <Table aria-label="Top posts">
            <TableHeader>
              <TableRow>
                <TableHead>Post</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="hidden text-right md:table-cell">CTR</TableHead>
                <TableHead className="hidden text-right md:table-cell">Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.postId} className="group/row">
                  <TableCell className="max-w-[28rem] whitespace-normal">
                    <Link
                      to="/posts/$id/analytics" params={{ id: post.postId }}
                      search={range === defaultAnalyticsRange ? {} : { range }}
                      className="font-medium group-hover/row:underline"
                    >
                      {post.title}
                    </Link>
                    {post.status !== "published" && <span className="ms-2 text-xs text-text-secondary">(no longer published)</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetric("impressions", post.impressions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetric("clicks", post.clicks)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{formatMetric("ctr", post.ctr)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{formatMetric("position", post.position)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
