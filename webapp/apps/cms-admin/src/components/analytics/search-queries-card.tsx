// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The Google searches a post was found for, as Ghost's top-content cards:
// impressions, clicks, CTR and position, with the searches in striking
// distance of the first page marked. Only what Google reports: it leaves out
// rare searches, and too few impressions say little, as the card notes. The
// top five first; the rest open in place.
import { useState } from "react";
import { useGetPostSearchQueries, type GetPostSearchParams } from "@/api/cms.generated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMetric } from "@/lib/search-chart";

const shown = 5;
const all = 100;

export function SearchQueriesCard({ postId, params }: { postId: string; params: GetPostSearchParams }) {
  const [open, setOpen] = useState(false);
  const limit = open ? all : shown + 1;
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
                <TableHead className="hidden text-right md:table-cell">Clicks</TableHead>
                <TableHead className="hidden text-right md:table-cell">CTR</TableHead>
                <TableHead className="text-right">Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(open ? rows : rows.slice(0, shown)).map((row) => (
                <TableRow key={row.query}>
                  <TableCell className="max-w-[18rem] whitespace-normal">
                    <span className="flex items-center gap-2">
                      <span className="truncate" title={row.query}>{row.query}</span>
                      {row.striking && <Badge variant="secondary" title="Average position 8 to 20: close to the first page">Striking distance</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetric("impressions", row.impressions)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{formatMetric("clicks", row.clicks)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{formatMetric("ctr", row.ctr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetric("position", row.position)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {(open || rows.length > shown) && (
          <Button variant="outline" size="sm" className="mt-4" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? "Show the top 5" : "Show all searches"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
