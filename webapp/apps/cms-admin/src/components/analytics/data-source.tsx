// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Which numbers an analytics view shows, from which days and when they were
// read: no number without its source (PRD R12).
import { formatDistanceToNowStrict } from "date-fns";
import type { ReactNode } from "react";

export const analyticsDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function DataSource({ from, to, importedAt, children }: { from: string; to: string; importedAt: string | null; children?: ReactNode }) {
  return (
    <p className="text-sm text-text-secondary">
      Google Search Console, web search, {analyticsDay(from)} to {analyticsDay(to)} (Search Console days, US Pacific)
      {importedAt && <>; read {formatDistanceToNowStrict(new Date(importedAt), { addSuffix: true })}</>}. Search Console lags two to three days.
      {children && <> {children}</>}
    </p>
  );
}
