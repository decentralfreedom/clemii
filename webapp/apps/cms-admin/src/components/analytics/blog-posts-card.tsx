// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// How each post drives downloads, as Ghost's Top content table: its Google
// clicks, its page views and the downloads that started on it, over the same
// days as the funnel, most downloads first. Ten rows; the rest open in place.
// A post opens its own analytics. Its downloads per page view show only once
// it has enough page views to mean something.
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { BlogAnalyticsPostsItem } from "@/api/cms.generated";
import { minimumViewsForRate } from "@/components/analytics/blog-funnel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { integer } from "@/lib/blog-chart";
import { defaultAnalyticsRange, type AnalyticsRangeKey } from "@/lib/analytics-ranges";

const shown = 10;

export function BlogPostsCard({ posts, range }: { posts: BlogAnalyticsPostsItem[]; range: AnalyticsRangeKey }) {
  const [all, setAll] = useState(false);
  const keep = range === defaultAnalyticsRange ? {} : { range };
  const visible = all ? posts : posts.slice(0, shown);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Posts</CardTitle>
        <CardDescription>Which posts bring readers who download hush, most downloads first.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!posts.length ? (
          <p className="text-sm text-text-secondary">No post had readers in this period.</p>
        ) : (
          <Table aria-label="Posts">
            <TableHeader>
              <TableRow>
                <TableHead>Post</TableHead>
                <TableHead className="hidden text-right whitespace-nowrap md:table-cell">Google clicks</TableHead>
                <TableHead className="text-right whitespace-nowrap">Page views</TableHead>
                <TableHead className="text-right whitespace-nowrap">Downloads</TableHead>
                <TableHead className="hidden text-right md:table-cell" title={`Shown from ${minimumViewsForRate} page views`}>Per view</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((post) => (
                <TableRow key={post.postId} className="group/row">
                  <TableCell className="max-w-[28rem] whitespace-normal">
                    <Link to="/posts/$id/analytics" params={{ id: post.postId }} search={keep} className="font-medium group-hover/row:underline">{post.title || "Untitled"}</Link>
                    {post.status !== "published" && <span className="ms-2 text-xs text-text-secondary">(no longer published)</span>}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{integer.format(post.clicks)}</TableCell>
                  <TableCell className="text-right tabular-nums">{integer.format(post.pageviews)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{integer.format(post.downloads)}</TableCell>
                  <TableCell className="hidden text-right text-text-secondary tabular-nums md:table-cell">
                    {post.pageviews >= minimumViewsForRate ? `${((post.downloads / post.pageviews) * 100).toFixed(1)}%` : <span title={`Fewer than ${minimumViewsForRate} page views`}>too few views</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {posts.length > shown && (
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setAll((value) => !value)} aria-expanded={all}>
            {all ? "Show the top 10" : `Show all ${posts.length} posts`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
