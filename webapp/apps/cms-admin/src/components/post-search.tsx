// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// A published post's Google Search Console numbers over the last 28 days the
// CMS has (PRD R12), in the post settings. Search Console lags two to three
// days, so the block says how far its numbers reach and when they were read.
import { format, formatDistanceToNowStrict } from "date-fns";
import { useGetPostSearch } from "@/api/cms.generated";

const number = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function PostSearch({ postId }: { postId: string }) {
  const search = useGetPostSearch(postId, { days: 28 });
  const data = search.data?.status === 200 ? search.data.data : undefined;
  if (search.isPending) return <p className="text-sm text-text-secondary">Loading Search Console numbers…</p>;
  if (!data) return <p className="text-sm text-text-secondary">Search Console numbers could not be loaded.</p>;
  if (!data.to) return <p className="text-sm text-text-secondary">No Search Console numbers yet; the CMS reads them once a day.</p>;
  const { totals } = data;
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3" aria-label="Google Search, last 28 days">
        <Stat label="Impressions" value={number.format(totals.impressions)} />
        <Stat label="Clicks" value={number.format(totals.clicks)} />
        <Stat label="CTR" value={`${(totals.ctr * 100).toFixed(1)}%`} />
        <Stat label="Avg. position" value={totals.position === null ? "–" : totals.position.toFixed(1)} />
      </dl>
      <p className="text-sm text-text-secondary">
        Through {format(new Date(`${data.to}T12:00:00Z`), "d MMM")}
        {data.importedAt && <>, updated {formatDistanceToNowStrict(new Date(data.importedAt), { addSuffix: true })}</>}
      </p>
    </>
  );
}
