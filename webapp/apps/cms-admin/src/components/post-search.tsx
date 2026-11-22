// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// A published post's Google Search Console numbers (PRD R12), in the post
// settings, with Ghost Admin's date ranges (apps/admin/src/shared/analytics/
// constants.ts) except "Today", which Search Console's two to three day lag
// leaves empty. Only numbers the CMS has are shown: the range starts no
// earlier than its first imported day, so a day drawn as zero had no
// impressions, and the searches say that Google leaves out rare ones.
import { format, formatDistanceToNowStrict } from "date-fns";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useGetPostSearch, useGetPostSearchQueries, type SearchDay } from "@/api/cms.generated";
import { Button } from "@/components/ui/button";
import { analyticsRanges, defaultAnalyticsRange, rangeParams, type AnalyticsRangeKey } from "@/lib/analytics-ranges";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const number = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });



const day = (iso: string) => format(new Date(`${iso}T12:00:00Z`), "d MMM yyyy");

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** Impressions per day from the range's first to its last day; the CMS has numbers for every one of them. */
function Trend({ days, from, to }: { days: SearchDay[]; from: string; to: string }) {
  const byDay = new Map(days.map((entry) => [entry.date, entry.impressions]));
  const values: number[] = [];
  for (let time = Date.parse(from); time <= Date.parse(to); time += 86_400_000) {
    values.push(byDay.get(new Date(time).toISOString().slice(0, 10)) ?? 0);
  }
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${30 - (value / max) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="Impressions per day" className="h-10 w-full overflow-visible text-foreground">
      <polygon points={`0,30 ${points} 100,30`} className="fill-current opacity-[0.06]" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="opacity-60" />
    </svg>
  );
}

export function PostSearch({ postId }: { postId: string }) {
  const [range, setRange] = useState<AnalyticsRangeKey>(defaultAnalyticsRange);
  const params = rangeParams(range);
  const search = useGetPostSearch(postId, params);
  const queries = useGetPostSearchQueries(postId, { ...params, limit: 5 });
  const data = search.data?.status === 200 ? search.data.data : undefined;
  const top = queries.data?.status === 200 ? queries.data.data.queries : [];

  return (
    <>
      <Select value={range} onValueChange={(value) => setRange(value as AnalyticsRangeKey)}>
        <SelectTrigger aria-label="Date range" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{analyticsRanges.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      {search.isPending ? (
        <p className="text-sm text-text-secondary">Loading Search Console numbers…</p>
      ) : !data ? (
        <p className="text-sm text-text-secondary">Search Console numbers could not be loaded.</p>
      ) : !data.from || !data.to ? (
        <p className="text-sm text-text-secondary">No Search Console numbers yet; the CMS reads them once a day.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3" aria-label="Google Search">
            <Stat label="Impressions" value={number.format(data.totals.impressions)} />
            <Stat label="Clicks" value={number.format(data.totals.clicks)} />
            <Stat label="CTR" value={`${(data.totals.ctr * 100).toFixed(1)}%`} />
            <Stat label="Avg. position" value={data.totals.position === null ? "–" : data.totals.position.toFixed(1)} />
          </dl>
          <Trend days={data.days} from={data.from} to={data.to} />
          {top.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-xs text-text-secondary">Top searches · impressions · position</h4>
              <ol aria-label="Top searches" className="flex flex-col gap-1 text-sm">
                {top.map((query) => (
                  <li key={query.query} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate" title={query.query}>{query.query}</span>
                    <span className="shrink-0 text-text-secondary tabular-nums">{number.format(query.impressions)} · {query.position.toFixed(1)}</span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-text-secondary">Google leaves out rare searches, so these add up to less than the totals.</p>
            </div>
          )}
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/posts/$id/analytics" search={range === defaultAnalyticsRange ? {} : { range }} params={{ id: postId }}>Open analytics<ArrowRight /></Link>
          </Button>
          <p className="text-sm text-text-secondary">
            Web search, {day(data.from)} to {day(data.to)} (Search Console days, US Pacific)
            {data.importedAt && <>; updated {formatDistanceToNowStrict(new Date(data.importedAt), { addSuffix: true })}</>}
          </p>
        </>
      )}
    </>
  );
}
