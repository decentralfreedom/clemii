// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The Google searches a post was found for, as Ghost's top-content cards:
// impressions, clicks, CTR and position, with the searches in striking
// distance of the first page marked. Only what Google reports: it leaves out
// rare searches, and too few impressions say little, as the card notes.
import { Link } from "@tanstack/react-router";
import { useGetPostSearchQueries, type GetPostSearchParams } from "@/api/cms.generated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMetric } from "@/lib/search-chart";

export function SearchQueriesCard({ postId, params, limit, more, compact = false }: {
  postId: string; params: GetPostSearchParams; limit: number;
  /** Search, impressions and position only, for a half-width card. */
  compact?: boolean;
  /** A link to all searches, on the Overview. */
  more?: { tab: "search" };
}) {
  const queries = useGetPostSearchQueries(postId, { ...params, limit });
  const rows = queries.data?.status === 200 ? queries.data.data.queries : [];
  return (
    <Card className="group">
      <CardHeader>
        <CardTitle>Top searches</CardTitle>
        <CardDescription>What people searched for when Google showed this post. Google leaves out rare searches, so these add up to less than the totals.</CardDescription>
      </CardHeader>
      <CardContent>
        {queries.isPending ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : !rows.length ? (
          <p className="text-sm text-text-secondary">No searches in this period.</p>
        ) : (
          <Table aria-label="Top searches">
            <TableHeader>
              <TableRow>
                <TableHead>Search</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                {!compact && <TableHead className="text-right">Clicks</TableHead>}
                {!compact && <TableHead className="text-right">CTR</TableHead>}
                <TableHead className="text-right">Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.query}>
                  <TableCell className="max-w-[18rem] whitespace-normal">
                    <span className="flex items-center gap-2">
                      <span className="truncate" title={row.query}>{row.query}</span>
                      {row.striking && <Badge variant="secondary" title="Average position 8 to 20: close to the first page">Striking distance</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetric("impressions", row.impressions)}</TableCell>
                  {!compact && <TableCell className="text-right tabular-nums">{formatMetric("clicks", row.clicks)}</TableCell>}
                  {!compact && <TableCell className="text-right tabular-nums">{formatMetric("ctr", row.ctr)}</TableCell>}
                  <TableCell className="text-right tabular-nums">{formatMetric("position", row.position)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {more && rows.length >= limit && (
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="." search={(previous) => ({ ...previous, tab: more.tab })}>See all searches</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
